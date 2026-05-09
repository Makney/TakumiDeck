import { ipcMain } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import { SessionUpdateInputSchema } from '@shared/schemas';
import type { SessionRepository } from '../db/repos/sessions';

// IPC-Handler für session:update. Sprint 2 deckt das schmale Update-Set ab
// (notes, title, status, current_model, ended_at). Resume/Close/History folgen mit Sprint 3.
export function registerSessionIpc(sessions: SessionRepository): void {
  ipcMain.handle(Channels.SessionUpdate, (_event, payload: unknown) => {
    try {
      const input = SessionUpdateInputSchema.parse(payload);
      const row = sessions.update(input.sessionId, input.patch);
      if (!row) {
        return err<never>(`Session ${input.sessionId} nicht gefunden`, 'SESSION_NOT_FOUND');
      }
      return ok(row);
    } catch (e) {
      return errFromUnknown(e, 'SESSION_UPDATE');
    }
  });
}
