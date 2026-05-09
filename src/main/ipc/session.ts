import { ipcMain } from 'electron';
import fs from 'node:fs';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import {
  SessionUpdateInputSchema,
  SessionCloseInputSchema,
  SessionResumeInputSchema,
} from '@shared/schemas';
import type { SessionRepository } from '../db/repos/sessions';
import type { SessionLifecycle } from '../sessions/lifecycle';
import type { PtyManager } from '../pty/manager';
import type { SettingsStore } from '../settings/store';
import type { Logger } from '../logger';
import { resolveExecutable } from '../pty/binary';

// IPC-Handler für die Session-Domain.
// session:update — Sprint 2: notes_md / title / status-Patches.
// session:close  — Sprint 3: Tab-X klick → archived (+ PTY-Kill, falls running).
// session:resume — Sprint 3: Resume-Button → claude --resume <id>, gleiches cwd/Modell.
//
// Lifecycle-Transitions laufen ausschließlich über SessionLifecycle (Variante A aus
// Sprint-3-Briefing): zentral validiert, ended_at-Side-Effect konsolidiert.
export function registerSessionIpc(deps: {
  sessions: SessionRepository;
  lifecycle: SessionLifecycle;
  manager: PtyManager;
  settings: SettingsStore;
  log: Logger;
}): void {
  const { sessions, lifecycle, manager, settings, log } = deps;

  ipcMain.handle(Channels.SessionUpdate, (_event, payload: unknown) => {
    try {
      const input = SessionUpdateInputSchema.parse(payload);
      // Status-Patches gehen durch die Lifecycle, alles andere direkt ins Repo.
      // So bleibt zentrale Validierung garantiert, ohne dass legitime Notes-/Title-
      // Updates durch die State-Machine müssen.
      if (input.patch.status !== undefined) {
        const result = lifecycle.transition(input.sessionId, input.patch.status, 'manual');
        if (!result.ok) return result;
      }
      const restPatch = { ...input.patch };
      delete restPatch.status;
      // ended_at-Side-Effect ist jetzt in der Lifecycle — wir respektieren aber explizite
      // Patches vom Renderer (z.B. wenn ein zukünftiger Caller ended_at gezielt setzt).
      const row = sessions.update(input.sessionId, restPatch);
      if (!row) {
        return err<never>(`Session ${input.sessionId} nicht gefunden`, 'SESSION_NOT_FOUND');
      }
      return ok(row);
    } catch (e) {
      return errFromUnknown(e, 'SESSION_UPDATE');
    }
  });

  ipcMain.handle(Channels.SessionClose, (_event, payload: unknown) => {
    try {
      const input = SessionCloseInputSchema.parse(payload);
      const session = sessions.findById(input.sessionId);
      if (!session) {
        return err<never>(`Session ${input.sessionId} nicht gefunden`, 'SESSION_NOT_FOUND');
      }
      // Reihenfolge wichtig: erst Lifecycle nach archived patchen, dann PTY killen.
      // Sonst feuert pty:exit zuerst und versucht running → completed; jetzt scheitert
      // diese Transition sauber an archived (Lifecycle lehnt ab) und logged nur eine Warnung.
      const result = lifecycle.transition(input.sessionId, 'archived', 'tab-close');
      if (!result.ok) {
        return result;
      }
      if (session.status === 'running' && manager.has(input.sessionId)) {
        try {
          manager.kill(input.sessionId);
        } catch (e) {
          log.warn(`[session:close] PTY-Kill fehlgeschlagen sessionId=${input.sessionId}`, e);
        }
      }
      return ok(result.data);
    } catch (e) {
      return errFromUnknown(e, 'SESSION_CLOSE');
    }
  });

  ipcMain.handle(Channels.SessionResume, (_event, payload: unknown) => {
    try {
      const input = SessionResumeInputSchema.parse(payload);
      const session = sessions.findById(input.sessionId);
      if (!session) {
        return err<never>(`Session ${input.sessionId} nicht gefunden`, 'SESSION_NOT_FOUND');
      }

      // 0a. Pre-Check: Binary auflösen (analog pty:create-Pfad).
      const current = settings.read();
      const lookup = resolveExecutable(current.claude_binary_path);
      if (!lookup.ok) {
        log.warn(`[session:resume] Binary nicht auflösbar: ${lookup.error}`);
        return err<never>(lookup.error, 'PTY_BINARY_NOT_FOUND');
      }
      // 0b. Pre-Check: existiert das (gespeicherte) cwd noch? Falls der User den
      //     Ordner zwischen den Sessions umbenannt hat, scheitert ConPTY sonst.
      if (!fs.existsSync(session.cwd)) {
        const msg = `Working-Directory existiert nicht mehr: ${session.cwd}`;
        log.warn(`[session:resume] ${msg}`);
        return err<never>(msg, 'PTY_CWD_NOT_FOUND');
      }

      // 1. Lifecycle: completed / interrupted / error → running. Lehnt running/archived ab.
      const transitionResult = lifecycle.transition(input.sessionId, 'running', 'resume');
      if (!transitionResult.ok) {
        return transitionResult;
      }

      // 2. PTY mit --resume <session-id> spawnen. Modell aus session.current_model
      //    (Architektur 6.2: gleiches Modell wie ursprünglich, kein Picker beim Resume).
      const model = session.current_model ?? current.default_model;
      try {
        manager.create(input.sessionId, {
          shell: lookup.resolved,
          args: ['--resume', input.sessionId, '--model', model],
          cwd: session.cwd,
          cols: input.cols,
          rows: input.rows,
        });
      } catch (e) {
        lifecycle.transition(input.sessionId, 'error', 'spawn-error');
        return errFromUnknown(e, 'PTY_RESUME_SPAWN');
      }

      log.info(`[session:resume] sessionId=${input.sessionId} model=${model}`);
      return ok(transitionResult.data);
    } catch (e) {
      return errFromUnknown(e, 'SESSION_RESUME');
    }
  });
}
