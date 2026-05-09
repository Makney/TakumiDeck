import { ipcMain } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, errFromUnknown } from '@shared/result';
import { AppSettingsPatchSchema } from '@shared/schemas';
import type { SettingsStore } from '../settings/store';

// IPC-Handler für settings:get und settings:set.
// Eingangs-Payload wird mit zod validiert; Errors werden als IpcResult (ok=false) zurückgegeben,
// nicht als Exception, damit der Renderer sauber prüfen kann.
export function registerSettingsIpc(store: SettingsStore): void {
  ipcMain.handle(Channels.SettingsGet, () => {
    try {
      return ok(store.read());
    } catch (e) {
      return errFromUnknown(e, 'SETTINGS_READ');
    }
  });

  ipcMain.handle(Channels.SettingsSet, (_event, payload: unknown) => {
    try {
      const patch = AppSettingsPatchSchema.parse(payload);
      const merged = store.patch(patch);
      return ok(merged);
    } catch (e) {
      return errFromUnknown(e, 'SETTINGS_WRITE');
    }
  });
}
