import { ipcMain } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, errFromUnknown } from '@shared/result';
import { AppSettingsPatchSchema } from '@shared/schemas';
import type { SettingsStore } from '../settings/store';
import { assertFromMainWindow } from './sender-guard';

// IPC-Handler für settings:get und settings:set.
// Eingangs-Payload wird mit zod validiert; Errors werden als IpcResult (ok=false) zurückgegeben,
// nicht als Exception, damit der Renderer sauber prüfen kann.
export function registerSettingsIpc(store: SettingsStore): void {
  ipcMain.handle(Channels.SettingsGet, (event) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      return ok(store.read());
    } catch (e) {
      return errFromUnknown(e, 'SETTINGS_READ');
    }
  });

  ipcMain.handle(Channels.SettingsSet, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const patch = AppSettingsPatchSchema.parse(payload);
      const merged = store.patch(patch);
      return ok(merged);
    } catch (e) {
      return errFromUnknown(e, 'SETTINGS_WRITE');
    }
  });
}
