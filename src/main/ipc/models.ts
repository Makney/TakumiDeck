import { ipcMain } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, errFromUnknown } from '@shared/result';
import { fetchAvailableModels } from '../models/fetchAvailableModels';
import { assertFromMainWindow } from './sender-guard';

// Phase-2 Season-34 (Variante D): IPC-Bruecke fuer den optionalen Modell-Auto-
// Refresh. Liest den API-Key aus der Umgebung und delegiert an das testbare
// fetchAvailableModels-Modul. Ohne Key kommt `available=false` zurueck (kein
// Fehler); HTTP-/Netzwerkfehler werden als IpcResult.ok=false verpackt.
export function registerModelsIpc(): void {
  ipcMain.handle(Channels.ModelsFetchAvailable, async (event) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const result = await fetchAvailableModels({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
      return ok(result);
    } catch (e) {
      return errFromUnknown(e, 'MODELS_FETCH');
    }
  });
}
