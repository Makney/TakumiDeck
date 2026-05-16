import { app, BrowserWindow, ipcMain, session, shell } from 'electron';
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
import { registerProjectIpc, syncScannedToDb } from './ipc/project';
import { createUsagePusher, registerUsageIpc } from './ipc/usage';
import { registerStatsIpc } from './ipc/stats';
import { setMainWebContentsResolver } from './ipc/sender-guard';
import { registerFsIpc, screenshotsDirFromUserData, templatesDirFromUserData } from './ipc/fs';
import { registerGitIpc } from './ipc/git';
import { registerTemplatesIpc } from './ipc/templates';
import { realGitDriver } from './git/driver';
import { PtyManager } from './pty/manager';
import { realPtySpawn } from './pty/spawn';
import { SessionRepository, SqliteSessionDriver } from './db/repos/sessions';
import {
  ensureDefaultProject,
  ProjectRepository,
  SqliteProjectDriver,
  DEFAULT_PROJECT_ID,
} from './db/repos/projects';
import { MessageRepository, SqliteMessageDriver } from './db/repos/messages';
import { UsageRepository, SqliteUsageDriver } from './db/repos/usage';
import { StatsRepository, SqliteStatsDriver } from './db/repos/stats';
import { HeatmapRepository, SqliteHeatmapDriver } from './db/repos/heatmap';
import { ModelStatsRepository, SqliteModelStatsDriver } from './db/repos/model-stats';
import {
  JsonlOffsetRepository,
  SqliteJsonlOffsetDriver,
} from './db/repos/jsonl-offsets';
import { MetaKvRepository, SqliteMetaKvDriver } from './db/repos/meta-kv';
import { SessionLifecycle } from './sessions/lifecycle';
import { reconcileCrashedSessions } from './sessions/reconciliation';
import { StateDetectionLoop } from './sessions/state-detection-loop';
import { JsonlWatcher, defaultClaudeProjectsPath } from './jsonl/watcher';
import { JsonlPollingRing } from './jsonl/polling-ring';
import { realJsonlReadDriver } from './jsonl/parser';
import { runJsonlPathBackfill } from './jsonl/backfill';
import { runScreenshotRetention } from './screenshots/retention';
import { Channels } from '@shared/ipc-channels';
import { scanWorkspace, realFsDriver, shouldRunInitialWorkspaceScan } from './workspace/scanner';

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
let jsonlWatcher: JsonlWatcher | null = null;
let jsonlPollingRing: JsonlPollingRing | null = null;
let stateLoop: StateDetectionLoop | null = null;

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: '#0d0f0e',
    show: false,
    autoHideMenuBar: true,
    // Sprint 8 — native Title-Bar weg, td-titlebar (Architektur 6.0) übernimmt
    // Branding + Window-Controls. Drag-Region kommt aus -webkit-app-region: drag
    // auf .td-titlebar selbst. resizable bleibt true (Electron-Default), die
    // OS-Resize-Handles am Rand greifen weiter.
    frame: false,
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

void app.whenReady().then(async () => {
  try {
    const settings = SettingsStore.initialize(getSettingsPath());
    const db = openDatabase(getDatabasePath());

    // Default-Project wird beibehalten — Sprint 4 erkennt es als Legacy-Bucket
    // und versucht, dessen Sessions per cwd-Prefix-Match auf echte Projects umzuhängen
    // (siehe ENTSCHEIDUNGEN.md "Default-Project-Migration").
    ensureDefaultProject(db, settings.read().workspace_path);

    const projectRepo = new ProjectRepository(new SqliteProjectDriver(db));
    // Phase-2 Season-10: SessionRepository bekommt das MessageRepository als
    // zweite Dep, damit listHistoryForProject die Modell-Aggregate pro Eintrag
    // nachliefern kann. Reihenfolge daher tauschen — MessageRepo zuerst.
    const messageRepo = new MessageRepository(new SqliteMessageDriver(db));
    const sessions = new SessionRepository(new SqliteSessionDriver(db), messageRepo);
    // Logger fürs Lifecycle-Debug-Tracing: jeder Statusübergang wird mit Reason
    // im Log nachvollziehbar (debug-Level, daher im Default-Loglevel still).
    const lifecycle = new SessionLifecycle(sessions, undefined, logger);
    const usageRepo = new UsageRepository(new SqliteUsageDriver(db));
    const statsRepo = new StatsRepository(new SqliteStatsDriver(db));
    const heatmapRepo = new HeatmapRepository(new SqliteHeatmapDriver(db));
    const modelStatsRepo = new ModelStatsRepository(new SqliteModelStatsDriver(db));
    const jsonlOffsetRepo = new JsonlOffsetRepository(new SqliteJsonlOffsetDriver(db));
    // Phase-2 Season-15: Meta-KV-Store ueber die seit Sprint 1 reservierte
    // SQLite-`settings`-Tabelle. Aktuell nur fuer das Boot-Backfill-Flag,
    // bietet sich aber als generischer Internal-State-Store an (anders als
    // die User-facing AppSettings).
    const metaKvRepo = new MetaKvRepository(new SqliteMetaKvDriver(db));
    ptyManager = new PtyManager(realPtySpawn);

    // Sprint 8 — Crash-Recovery (Variante C aus Sprint-3-Briefing).
    // Nach openDatabase, vor Workspace-Scan: orphane running/idle-Sessions ohne
    // ended_at auf interrupted patchen. Hartfehler beim Reconciliation-Pass
    // dürfen den App-Start nicht blocken (try/catch lokal). ended_at = MAX(messages.ts)
    // für die Session, Fallback now() — siehe sessions/reconciliation.ts.
    try {
      reconcileCrashedSessions({
        sessions,
        messages: messageRepo,
        lifecycle,
        log: logger,
      });
    } catch (e) {
      logger.warn('[startup] Crash-Recovery-Reconciliation fehlgeschlagen', e);
    }

    // Sprint-4-Initial-Pass: workspace_path scannen, neue Projekte einfügen,
    // dann die Sprint-2/3-Default-Sessions per cwd-Prefix umhängen. Ein Hard-Crash
    // im Scanner darf den App-Start nicht blocken — daher try/catch um den ganzen Pass.
    //
    // Phase-2 Season-18: Skip, solange der First-Start-Wizard nicht abgeschlossen
    // ist oder der User per Skip einen leeren Pfad gesetzt hat — sonst wuerde der
    // Default-`<home>/Projekte` doch wieder still gescannt. Der Renderer entscheidet
    // anhand des Flags, ob er den Welcome-Screen rendert.
    try {
      const settingsSnapshot = settings.read();
      if (shouldRunInitialWorkspaceScan(settingsSnapshot)) {
        const workspacePath = settingsSnapshot.workspace_path;
        const scanned = await scanWorkspace(workspacePath, realFsDriver);
        const insertedCount = syncScannedToDb(projectRepo, scanned, logger);
        const moved = projectRepo.remapSessionsByCwdPrefix(
          DEFAULT_PROJECT_ID,
          projectRepo.listAll(),
        );
        logger.info(
          `[startup] workspace gescannt path=${workspacePath} gefunden=${scanned.length} neu=${insertedCount} sessions_umgehängt=${moved}`,
        );
      } else {
        logger.info(
          `[startup] Initial-Workspace-Scan uebersprungen wizard_completed=${settingsSnapshot.workspace_wizard_completed} workspace_path_len=${settingsSnapshot.workspace_path.length}`,
        );
      }
    } catch (e) {
      logger.warn('[startup] Initial-Workspace-Scan fehlgeschlagen', e);
    }

    // Bereich-4-Review (B-2): Sender-Guard-Resolver setzen, BEVOR irgendein
    // Handler registriert wird. Sonst wären Handler bis zum ersten Aufruf
    // ungeschützt (defensiv-blockend ist OK, aber inkonsistent).
    setMainWebContentsResolver(() => mainWindow?.webContents ?? null);

    // Phase-2 Season-15: Polling-Ring fuer Live-Token-Updates parallel zur
    // chokidar-Pipeline. Wird unten via attach() pro Session aktiviert; den
    // notifyChanged-Callback bedient der Watcher (gleiche handleFile-Logik
    // wie chokidar-change), damit Anti-Reentrancy und jsonl_offsets-Tail
    // konsistent bleiben.
    const claudeProjectsRoot = defaultClaudeProjectsPath();
    jsonlPollingRing = new JsonlPollingRing({
      onChange: (filePath) => jsonlWatcher?.notifyChanged(filePath),
      log: logger,
    });

    registerSettingsIpc(settings);
    registerAppIpc({ settings });
    registerSessionIpc({
      sessions,
      lifecycle,
      manager: ptyManager,
      settings,
      log: logger,
      pollingRing: jsonlPollingRing,
    });
    registerPtyIpc({
      manager: ptyManager,
      sessions,
      projects: projectRepo,
      lifecycle,
      settings,
      getWebContents: () => mainWindow?.webContents ?? null,
      log: logger,
      pollingRing: jsonlPollingRing,
      claudeProjectsRoot,
    });
    registerProjectIpc({
      projects: projectRepo,
      settings,
      log: logger,
      getMainWindow: () => mainWindow,
    });
    registerUsageIpc({
      usage: usageRepo,
      messages: messageRepo,
      sessions,
      settings,
      log: logger,
    });
    registerStatsIpc({
      stats: statsRepo,
      heatmap: heatmapRepo,
      models: modelStatsRepo,
      log: logger,
    });
    registerFsIpc({
      projects: projectRepo,
      templatesDir: templatesDirFromUserData(getDataDir()),
      screenshotsDir: screenshotsDirFromUserData(getDataDir()),
      log: logger,
    });
    registerGitIpc({
      projects: projectRepo,
      driver: realGitDriver,
      log: logger,
    });
    registerTemplatesIpc({
      projects: projectRepo,
      sessions,
      settings,
      log: logger,
    });

    // Sprint-5-JSONL-Watcher startet die globale Token-Aggregation. Initial-Scan
    // (ignoreInitial:false) zieht historische Sessions in messages/usage_buckets
    // nach; persistierte Byte-Offsets verhindern, dass derselbe Bytes-Bereich beim
    // nächsten Start nochmal gelesen wird.
    // Bereich-4-Review (W-4): usage:update-Push lebt im ipc/-Layer.
    jsonlWatcher = new JsonlWatcher({
      watchPath: claudeProjectsRoot,
      reader: realJsonlReadDriver,
      offsets: jsonlOffsetRepo,
      messages: messageRepo,
      usage: usageRepo,
      sessions,
      log: logger,
      push: createUsagePusher(() => mainWindow?.webContents ?? null),
    });
    void jsonlWatcher.start();

    // Phase-2 Season-15: Boot-One-Shot-Backfill fuer resume-tote Multi-Session-
    // Bestaende — verteilt JSONL-Files nach mtime-Reihenfolge auf TakumiDeck-
    // Sessions ohne claude_session_id. Flag in settings (`backfill_jsonl_link_v1_done`)
    // verhindert Re-Run nach App-Restart. Hartfehler darf den App-Start nicht
    // blocken.
    try {
      await runJsonlPathBackfill({
        sessions,
        meta: metaKvRepo,
        claudeProjectsRoot,
        log: logger,
      });
    } catch (e) {
      logger.warn('[startup] JSONL-Path-Backfill fehlgeschlagen', e);
    }

    // Phase-2 Season-17: Boot-One-Shot-Retention fuer <userData>/screenshots/.
    // Age-Cutoff + Size-Cap aus settings.screenshot_retention. Hartfehler
    // (z.B. EACCES auf den Folder) blockt den App-Start NICHT — der Manual-
    // Clear-Button im Settings-Modal ist der Fallback-Pfad.
    try {
      const currentSettings = settings.read();
      await runScreenshotRetention({
        screenshotsDir: screenshotsDirFromUserData(getDataDir()),
        config: {
          maxAgeDays: currentSettings.screenshot_retention.max_age_days,
          maxTotalBytes:
            currentSettings.screenshot_retention.max_total_mib * 1024 * 1024,
        },
        log: logger,
      });
    } catch (e) {
      logger.warn('[startup] Screenshot-Retention fehlgeschlagen', e);
    }

    // Phase-2 Season-15: bereits laufende / idle / waiting / permission-prompt
    // Sessions an den Polling-Ring koppeln, sobald die DB konsistent ist. Diese
    // Sessions stammen entweder aus einem Crash-Recovery-Roundtrip (in dem Fall
    // wurden sie gerade auf interrupted gepatcht und tauchen nicht mehr in der
    // Liste auf) oder es laeuft tatsaechlich ein PTY (typisch nur im Dev-Modus
    // mit Hot-Reload). Aus Defensiv-Gruenden trotzdem attachen — `detach` ist
    // idempotent, wenn der naechste Lifecycle-Tick Sessions schliesst.
    for (const status of ['running', 'idle', 'waiting', 'permission-prompt'] as const) {
      for (const row of sessions.listByStatus(status)) {
        if (row.jsonl_path) {
          jsonlPollingRing.attach(row.id, row.jsonl_path);
        }
      }
    }

    // State-Detection-Loop (Architektur 6.2): alle 2 s laufen running/idle-Übergänge
    // basierend auf der letzten messages.ts-Zeile. running-Sessions ohne Activity
    // werden nach 3 s als idle markiert; eintreffende JSONL-Lines re-aktivieren sie.
    stateLoop = new StateDetectionLoop({
      sessions,
      messages: messageRepo,
      lifecycle,
      log: logger,
      notifyRenderer: (sessionId, status) => {
        mainWindow?.webContents.send(Channels.SessionStatusPush, { sessionId, status });
      },
    });
    stateLoop.start();

    logger.info('TakumiDeck startet', {
      version: app.getVersion(),
      dataDir: getDataDir(),
      packaged: app.isPackaged,
    });

    // Beim App-Beenden: zuerst Shutdown-Flag setzen + alle running-Sessions auf
    // 'interrupted' patchen (synchron, better-sqlite3 ist synchron). Dann erst die
    // PTYs killen — sonst würde der pty:exit-Handler die Sessions auf 'completed'
    // setzen (Sprint-2-Bug, Variante A aus Sprint-3-Briefing).
    //
    // Async-Cleanup via preventDefault: der JSONL-Watcher schreibt asynchron in
    // die DB; wenn wir db.close() vor dem `await jsonlWatcher.stop()` aufrufen,
    // kann ein laufendes handleFile in eine geschlossene DB schreiben. Wir blocken
    // das Quit-Event, fahren das Cleanup synchron+asynchron sauber zu Ende und
    // rufen dann app.quit() erneut auf — `cleanupDone` verhindert die Endlos-
    // Schleife.
    let cleanupDone = false;
    app.on('before-quit', (event) => {
      if (cleanupDone) return;
      event.preventDefault();
      lifecycle.markShuttingDown();
      void (async () => {
        try {
          // Sprint 5: idle zählt wie running als „live". Phase-2 Season-1 ergänzt
          // waiting + permission-prompt — alle vier Status bedeuten, dass der
          // claude-Prozess noch läuft und beim Quit auf interrupted zu setzen ist.
          const liveSessions = [
            ...sessions.listByStatus('running'),
            ...sessions.listByStatus('idle'),
            ...sessions.listByStatus('waiting'),
            ...sessions.listByStatus('permission-prompt'),
          ];
          for (const session of liveSessions) {
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
          stateLoop?.stop();
        } catch (e) {
          logger.warn('State-Detection-Loop-Stop fehlgeschlagen', e);
        }
        // Phase-2 Season-15: Polling-Ring vor PTY-Kill stoppen, damit kein Tick
        // mehr in den Watcher pusht, waehrend die Pipeline runterfaehrt.
        try {
          jsonlPollingRing?.stopAll();
        } catch (e) {
          logger.warn('JSONL-Polling-Ring-Stop fehlgeschlagen', e);
        }
        try {
          ptyManager?.killAll();
        } catch (e) {
          logger.warn('PTY-Kill-All fehlgeschlagen', e);
        }
        // Watcher stop: awaited, damit inFlight-handleFile-Promises ihren DB-
        // Write zu Ende schreiben, bevor db.close() läuft (sonst SQLITE_MISUSE
        // oder verlorene Token-Aggregate beim Hard-Quit).
        try {
          await jsonlWatcher?.stop();
        } catch (e) {
          logger.warn('JSONL-Watcher-Stop fehlgeschlagen', e);
        }
        try {
          db.close();
        } catch (e) {
          logger.warn('DB-Close fehlgeschlagen', e);
        }
        cleanupDone = true;
        app.quit();
      })();
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

// Hardening — Navigation/Window-Handling (Electronegativity LIMIT_NAVIGATION_GLOBAL_CHECK):
//   1. setWindowOpenHandler → externe Links via window.open / target="_blank" werden
//      geblockt; HTTP(S)-Ziele werden stattdessen im Standard-Browser des Users
//      geöffnet (sicherer als ein eigenes BrowserWindow ohne Hardening).
//   2. will-navigate → fängt In-Place-Navigation (location.href, Form-Submit) ab.
//      Erlaubt bleibt nur die initial geladene URL (Dev: Vite-Devserver, Prod: file://-
//      Renderer-Bundle). Alle anderen Ziele werden geblockt und ggf. extern geöffnet.
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    // Nur http(s) extern öffnen — sonstige Schemata (file:, javascript:, data:) stumm
    // ignorieren, damit kein Sniff-Vektor existiert.
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    const initialUrl = contents.getURL();
    if (url !== initialUrl) {
      event.preventDefault();
      if (url.startsWith('http://') || url.startsWith('https://')) {
        void shell.openExternal(url);
      }
    }
  });
});

// Hardening — Permission-Request-Handler (Electronegativity PERMISSION_REQUEST_HANDLER_GLOBAL_CHECK):
// Default-Deny für alle Permissions (media, geolocation, notifications, midi, …).
// TakumiDeck braucht in Phase 1 keine davon; ein Whitelist-Eintrag käme erst, wenn ein
// Feature ihn rechtfertigt. Permission-Check ebenfalls deny, damit Synchron-API-Pfade
// (z.B. Notification.permission) nicht „granted" sehen.
//
// Ausnahmen (Whitelist): Clipboard-Schreib- und Lesezugriff für das Copy/Paste-Wiring
// im Terminal-Panel (clipboardKeyHandler.ts). Ohne die Whitelist scheitert
// navigator.clipboard.writeText still im void-catch → Ctrl+C / Ctrl+Shift+C kopieren
// gar nichts. Paste lief unsichtbar über xterms nativen paste-DOM-Event und maskierte
// den Bug. `clipboard-sanitized-write` sanitisiert HTML/Image-Payload — das ist die
// Stufe, die moderne Web-Terminals (VS Code, Windows Terminal) standardmäßig nutzen.
const CLIPBOARD_PERMISSIONS = new Set(['clipboard-sanitized-write', 'clipboard-read']);
app.on('ready', () => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(CLIPBOARD_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) =>
    CLIPBOARD_PERMISSIONS.has(permission),
  );

  // Hardening — header-basierte CSP (Electronegativity CSP_GLOBAL_CHECK):
  // In Production lädt der Renderer via file://, dort wirkt nur der Meta-Tag aus
  // index.html (vom Vite-Plugin `productionCspMetaPlugin` beim Build injiziert).
  // Im Dev-Modus läuft der Renderer über den Vite-Devserver (http://localhost:5173)
  // — wir setzen die CSP als HTTP-Header und müssen `'unsafe-inline'`/`'unsafe-eval'`
  // für script-src zulassen, weil @vitejs/plugin-react ein inline Fast-Refresh-
  // Preamble-Script einfügt und HMR via eval läuft. connect-src erlaubt zusätzlich
  // den WebSocket des Devservers.
  // Bei Änderung der Production-Werte: Konstante PRODUCTION_CSP in
  // vite.renderer.config.ts parallel anpassen.
  const isDev = !app.isPackaged;
  const cspProd =
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "font-src 'self' data:;";
  const cspDev =
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' ws://localhost:5173 http://localhost:5173;";
  const csp = isDev ? cspDev : cspProd;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
});

// Sentinel: stellt sicher, dass ipcMain-Imports nicht tree-shaked werden,
// falls Vite zu aggressiv optimiert.
void ipcMain;
