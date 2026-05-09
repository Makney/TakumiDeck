import { app, ipcMain, shell } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';

// IPC-Handler für app:get-version und app:open-data-folder.
export function registerAppIpc(): void {
  ipcMain.handle(Channels.AppGetVersion, () => {
    try {
      return ok(app.getVersion());
    } catch (e) {
      return errFromUnknown(e);
    }
  });

  ipcMain.handle(Channels.AppOpenDataFolder, async () => {
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
}
