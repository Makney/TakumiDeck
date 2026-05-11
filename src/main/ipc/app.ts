import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import { WindowActionSchema } from '@shared/schemas';
import { resolveExecutable } from '../pty/binary';
import type { SettingsStore } from '../settings/store';
import { assertFromMainWindow } from './sender-guard';

// IPC-Handler für app:get-version, app:open-data-folder und app:window-action.
//
// Sprint 8 (Header-Bar, Architektur 6.0): app:window-action erlaubt dem Renderer,
// die Standard-Window-Controls (minimieren/maximieren/schließen) auszulösen.
// Wir validieren die Action-String per zod (Schema aus @shared/schemas), damit die
// Renderer-Boundary nicht beliebige Methoden-Calls auf BrowserWindow triggern kann.

export function registerAppIpc(deps?: { settings?: SettingsStore }): void {
  ipcMain.handle(Channels.AppGetVersion, (event) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      return ok(app.getVersion());
    } catch (e) {
      return errFromUnknown(e);
    }
  });

  ipcMain.handle(Channels.AppOpenDataFolder, async (event) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const dir = app.getPath('userData');
      const result = await shell.openPath(dir);
      // shell.openPath returnt String != '' bei Fehler (z.B. Pfad existiert nicht).
      if (result) return err<string>(result, 'OPEN_FAILED');
      return ok(dir);
    } catch (e) {
      return errFromUnknown(e);
    }
  });

  ipcMain.handle(Channels.AppClaudeHealth, (event) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      // Wenn der SettingsStore nicht injiziert wurde (Tests, frühe App-Init),
      // probieren wir 'claude' aus dem PATH — vernünftiger Default.
      const binaryPath = deps?.settings?.read().claude_binary_path ?? 'claude';
      const lookup = resolveExecutable(binaryPath);
      if (lookup.ok) {
        return ok({ resolved: lookup.resolved, healthy: true as const });
      }
      return ok({
        resolved: null,
        healthy: false as const,
        hint: lookup.error,
      });
    } catch (e) {
      return errFromUnknown(e, 'CLAUDE_HEALTH');
    }
  });

  ipcMain.handle(Channels.AppWindowAction, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const action = WindowActionSchema.parse(payload);
      // Wir greifen auf das BrowserWindow des Senders zu — sauberer als ein
      // globaler Singleton, weil der Hauptfenster-Identifier künftig auch
      // mehrere Windows haben könnte.
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return err<null>('Kein BrowserWindow für diesen Render-Sender', 'NO_WINDOW');
      switch (action) {
        case 'minimize':
          win.minimize();
          break;
        case 'maximize':
          // Toggle: wenn schon maximiert, unmaximize — ist die Standard-
          // Erwartung an einen Window-Maximize-Knopf.
          if (win.isMaximized()) win.unmaximize();
          else win.maximize();
          break;
        case 'close':
          win.close();
          break;
      }
      return ok(null);
    } catch (e) {
      return errFromUnknown(e, 'WINDOW_ACTION');
    }
  });
}
