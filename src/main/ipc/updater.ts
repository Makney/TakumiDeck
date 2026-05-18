import { ipcMain } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, errFromUnknown } from '@shared/result';
import type { AutoUpdaterWrapper } from '../updater/auto-updater';
import { assertFromMainWindow } from './sender-guard';

// Phase-2 Season-26: IPC-Bruecke fuer den AutoUpdater-Wrapper.
//
// Renderer-Flow:
//   1. Mount: `updater.getState()` (Sync-Snapshot ohne Trigger).
//   2. Abo: `updater.onStatePush(handler)` empfaengt jeden State-Wechsel.
//   3. Manual: `updater.check()` aus dem Settings-About-Tab.
//   4. Banner-Klicks: `startDownload()` → `quitAndInstall()`.
//
// Die `setState`-Pushes laufen ueber den Konstruktor-`push`-Callback des
// Wrappers (siehe registerUpdaterIpc), nicht ueber einen direkten Channel-
// Send hier — damit der Wrapper auch ausserhalb der IPC-Layer (z.B. fuer
// einen kuenftigen Tray-Icon-Indikator) konsumierbar bleibt.

export function registerUpdaterIpc(deps: { wrapper: AutoUpdaterWrapper }): void {
  ipcMain.handle(Channels.UpdaterGetState, (event) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      return ok(deps.wrapper.getState());
    } catch (e) {
      return errFromUnknown(e, 'UPDATER_GET_STATE');
    }
  });

  ipcMain.handle(Channels.UpdaterCheck, async (event) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const state = await deps.wrapper.check();
      return ok(state);
    } catch (e) {
      return errFromUnknown(e, 'UPDATER_CHECK');
    }
  });

  ipcMain.handle(Channels.UpdaterStartDownload, async (event) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const state = await deps.wrapper.startDownload();
      return ok(state);
    } catch (e) {
      return errFromUnknown(e, 'UPDATER_DOWNLOAD');
    }
  });

  ipcMain.handle(Channels.UpdaterQuitAndInstall, (event) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      deps.wrapper.quitAndInstall();
      return ok(null);
    } catch (e) {
      return errFromUnknown(e, 'UPDATER_QUIT_INSTALL');
    }
  });
}
