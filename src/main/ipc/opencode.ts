import { ipcMain } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, errFromUnknown } from '@shared/result';
import { listOpencodeModels } from '../opencode/listModels';
import { assertFromMainWindow } from './sender-guard';
import type { SettingsStore } from '../settings/store';
import type { Logger } from '../logger';

// Season 39 (Opencode): IPC-Bruecke fuer die Modell-Liste der zweiten Engine.
// Liest `opencode_enabled` + `opencode_binary_path` frisch aus den Settings und
// delegiert an das testbare listOpencodeModels-Modul. Der Aufruf wirft nie —
// Fehlerpfade kommen als `available=false` mit `reason` zurueck.
export function registerOpencodeIpc(deps: {
  settings: SettingsStore;
  log: Logger;
}): void {
  const { settings, log } = deps;
  ipcMain.handle(Channels.OpencodeListModels, (event) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const current = settings.read();
      const result = listOpencodeModels({
        enabled: current.opencode_enabled,
        binaryPath: current.opencode_binary_path,
        log,
      });
      return ok(result);
    } catch (e) {
      return errFromUnknown(e, 'OPENCODE_LIST_MODELS');
    }
  });
}
