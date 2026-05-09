import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { configurePaths, getDataDir, getDatabasePath, getSettingsPath } from './paths';
import { logger } from './logger';
import { SettingsStore } from './settings/store';
import { openDatabase } from './db/connection';
import { registerSettingsIpc } from './ipc/settings';
import { registerAppIpc } from './ipc/app';
import { registerPtyIpc } from './ipc/pty';
import { registerSessionIpc } from './ipc/session';
import { PtyManager } from './pty/manager';
import { realPtySpawn } from './pty/spawn';
import { SessionRepository, SqliteSessionDriver } from './db/repos/sessions';
import { ensureDefaultProject } from './db/repos/projects';
import { SessionLifecycle } from './sessions/lifecycle';

// Squirrel-Installer: bei Setup/Update-Events sofort beenden, bevor BrowserWindow erstellt wird.
if (started) {
  app.quit();
}

// Pfade konfigurieren (Dev vs. Prod), bevor irgendein Modul userData liest.
configurePaths();

// Sicherheitsnetz für Async-Crashes aus Worker-Threads (z.B. node-pty's ConPTY-Worker
// auf Windows, der "Cannot create process" wirft). Ohne diesen Handler hätte Electron
// den Default-Error-Dialog gezeigt und den Main-Prozess beendet — wir loggen stattdessen
// und lassen die App weiterlaufen, damit der User noch settings.json korrigieren kann.
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception im Main-Prozess', error);
});
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise-Rejection im Main-Prozess', reason);
});

let mainWindow: BrowserWindow | null = null;
let ptyManager: PtyManager | null = null;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0d0f0e',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      // Hardening laut Architektur Kapitel 3.
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'string') {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // DevTools-Toggle explizit registrieren. Mit autoHideMenuBar + ohne benutzerdefiniertes
  // Application-Menu kommt der Electron-Default-Accelerator F12 nicht durch — wir hängen
  // ihn als webContents-before-input-event an, damit er auch im Dev-Mode greift.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const isF12 = input.key === 'F12';
    const isCtrlShiftI = input.control && input.shift && input.key.toLowerCase() === 'i';
    if (isF12 || isCtrlShiftI) {
      mainWindow?.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  try {
    const settings = SettingsStore.initialize(getSettingsPath());
    const db = openDatabase(getDatabasePath());

    // FK-Lifeline für Sprint 2: solange der Workspace-Scanner (Sprint 4) noch fehlt,
    // hängen alle Sessions an einem stabilen Default-Projekt.
    ensureDefaultProject(db, settings.read().workspace_path);

    const sessions = new SessionRepository(new SqliteSessionDriver(db));
    const lifecycle = new SessionLifecycle(sessions);
    ptyManager = new PtyManager(realPtySpawn);

    registerSettingsIpc(settings);
    registerAppIpc();
    registerSessionIpc({
      sessions,
      lifecycle,
      manager: ptyManager,
      settings,
      log: logger,
    });
    registerPtyIpc({
      manager: ptyManager,
      sessions,
      lifecycle,
      settings,
      getWebContents: () => mainWindow?.webContents ?? null,
      log: logger,
    });

    logger.info('TakumiDeck startet', {
      version: app.getVersion(),
      dataDir: getDataDir(),
      packaged: app.isPackaged,
    });

    // Beim App-Beenden: zuerst Shutdown-Flag setzen + alle running-Sessions auf
    // 'interrupted' patchen (synchron, better-sqlite3 ist synchron). Dann erst die
    // PTYs killen — sonst würde der pty:exit-Handler die Sessions auf 'completed'
    // setzen (Sprint-2-Bug, Variante A aus Sprint-3-Briefing).
    app.on('before-quit', () => {
      lifecycle.markShuttingDown();
      try {
        const runningSessions = sessions.listByStatus('running');
        for (const session of runningSessions) {
          const result = lifecycle.transition(session.id, 'interrupted', 'app-quit');
          if (!result.ok) {
            logger.warn(
              `[before-quit] Lifecycle-Transition fehlgeschlagen sessionId=${session.id}: ${result.error}`,
            );
          }
        }
      } catch (e) {
        logger.warn('Session-Status-Patches beim Quit fehlgeschlagen', e);
      }
      try {
        ptyManager?.killAll();
      } catch (e) {
        logger.warn('PTY-Kill-All fehlgeschlagen', e);
      }
      try {
        db.close();
      } catch (e) {
        logger.warn('DB-Close fehlgeschlagen', e);
      }
    });

    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  } catch (e) {
    logger.error('Fataler Start-Fehler', e);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // Auf macOS bleibt die App per Konvention im Dock; auf Windows/Linux beenden.
  if (process.platform !== 'darwin') app.quit();
});

// Verbietet das Laden externer Inhalte als BrowserWindow — zusätzliche Hardening-Schicht.
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
});

// Sentinel: stellt sicher, dass ipcMain-Imports nicht tree-shaked werden,
// falls Vite zu aggressiv optimiert.
void ipcMain;
