import { ipcMain } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import {
  TerminalSaveBufferInputSchema,
  TerminalLoadBufferInputSchema,
} from '@shared/schemas';
import type { SessionRepository } from '../db/repos/sessions';
import type { SessionBufferRepository } from '../db/repos/session-buffer';
import type { Logger } from '../logger';
import { assertFromMainWindow } from './sender-guard';

// Phase 2 Season 33: Terminal-Buffer-Persistierung ueber Resume.
//
// Zwei IPC-Handler, beide hart auf type='terminal' gegated. Claude-Sessions
// rendern ihren Verlauf beim `--resume` selbst aus der JSONL — wir
// persistieren bewusst nur dort, wo es keinen Ersatz-Pfad gibt (PowerShell-
// Shells).
//
// Save: vom TerminalTab-Cleanup gefeuert. Der Renderer serialisiert via
// @xterm/addon-serialize und trimt mit `trimBufferSnapshot` (Pure-Helper
// in @shared) auf 2000 Zeilen + 256 KiB; das Schema laesst 1 MiB als
// Trust-Boundary durch. Wenn der Snapshot leer ist (z.B. StrictMode-
// Double-Mount mit frischem terminal vor terminal.open), schickt der
// Renderer den Call gar nicht erst.
//
// Load: vom TerminalTab-Mount gefeuert bei resumed terminal-Sessions
// (needsSpawn=false). Liefert den Snapshot oder null — der Renderer
// schreibt ihn dann vor dem ersten PTY-Frame in xterm zurueck.
export function registerTerminalBufferIpc(deps: {
  sessions: SessionRepository;
  buffers: SessionBufferRepository;
  log: Logger;
}): void {
  const { sessions, buffers, log } = deps;

  ipcMain.handle(Channels.TerminalSaveBuffer, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = TerminalSaveBufferInputSchema.parse(payload);
      const session = sessions.findById(input.sessionId);
      if (!session) {
        return err<never>(
          `Session ${input.sessionId} nicht gefunden`,
          'SESSION_NOT_FOUND',
        );
      }
      // Skip-Gate: Buffer-Persistierung gilt nur fuer terminal-Sessions.
      // Falls der Renderer (Bug oder Misuse) den Save fuer eine claude-
      // Session feuert, lehnen wir still ab — kein Crash, kein Schreib-
      // Zugriff, aber der Renderer kriegt einen klaren Code zurueck, falls
      // er ihn loggen will.
      if (session.type !== 'terminal') {
        return err<never>(
          'Buffer-Persist nur fuer terminal-Sessions erlaubt',
          'TERMINAL_BUFFER_TYPE_MISMATCH',
        );
      }
      buffers.upsert(input.sessionId, input.snapshot);
      return ok(null);
    } catch (e) {
      return errFromUnknown(e, 'TERMINAL_SAVE_BUFFER');
    }
  });

  ipcMain.handle(Channels.TerminalLoadBuffer, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = TerminalLoadBufferInputSchema.parse(payload);
      const session = sessions.findById(input.sessionId);
      if (!session) {
        return err<never>(
          `Session ${input.sessionId} nicht gefunden`,
          'SESSION_NOT_FOUND',
        );
      }
      // Wie beim Save: claude-Sessions rufen den Load nicht — falls doch
      // (z.B. defensive Renderer-Erweiterung), liefern wir null statt
      // einer Fehler-Response, damit der Mount-Pfad ohne Sonderfall durch
      // laeuft.
      if (session.type !== 'terminal') {
        return ok({ snapshot: null });
      }
      const snapshot = buffers.get(input.sessionId);
      return ok({ snapshot });
    } catch (e) {
      log.warn(`[terminal:load-buffer] payload-parse-fail: ${String(e)}`);
      return errFromUnknown(e, 'TERMINAL_LOAD_BUFFER');
    }
  });
}
