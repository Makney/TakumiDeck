import { ipcMain } from 'electron';
import fs from 'node:fs';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import {
  SessionUpdateInputSchema,
  SessionCloseInputSchema,
  SessionResumeInputSchema,
  SessionHistoryInputSchema,
  SessionArchiveInputSchema,
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
      // Sprint-6-UX-Fix (Variante B): × auf einem Tab schließt nur die UI-Ansicht
      // und killt ggf. den PTY — die Session selbst bleibt resume-fähig in der
      // DB, weil archived ein bewusster, expliziter Schritt ist (siehe
      // session:archive). Der pty:exit-Handler patcht running/idle → completed
      // automatisch, sobald der Subprozess gestorben ist.
      if (manager.has(input.sessionId)) {
        try {
          manager.kill(input.sessionId);
        } catch (e) {
          log.warn(`[session:close] PTY-Kill fehlgeschlagen sessionId=${input.sessionId}`, e);
        }
      }
      // Aktuellsten Stand zurückliefern — wenn der pty:exit-Handler synchron noch
      // nicht gefeuert hat, ist hier ggf. noch der alte Status, das Renderer-Update
      // kommt dann via pty:exit-Push.
      const refreshed = sessions.findById(input.sessionId) ?? session;
      return ok(refreshed);
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

      // 0c. Sprint-6-Hotfix: Resume nutzt die claude-eigene Session-UUID. Bei
      //     Sessions ab dem Hotfix ist das gleich `session.id` (weil pty:create
      //     mit --session-id <id> spawnt), bei Legacy-Sessions wird die UUID vom
      //     JSONL-Watcher rückwirkend befüllt. Wenn beides null ist (Session war
      //     so kurz aktiv, dass keine JSONL-Zeile entstand), bleibt nur der
      //     Sprint-3-Pfad — der für diese Session nicht funktioniert. Wir geben
      //     einen sprechenden Fehler zurück, statt den Spawn ins Leere laufen zu
      //     lassen.
      const claudeSessionId = session.claude_session_id;
      if (claudeSessionId === null) {
        lifecycle.transition(input.sessionId, 'error', 'spawn-error');
        return err<never>(
          'Diese Session hat keine claude-Session-UUID. Vermutlich wurde sie vor dem Hotfix gespawnt und hat nie eine Antwort erzeugt. Eine neue Session anlegen.',
          'SESSION_NO_CLAUDE_UUID',
        );
      }

      // 1. Lifecycle: completed / interrupted / error → running. Lehnt running/archived ab.
      const transitionResult = lifecycle.transition(input.sessionId, 'running', 'resume');
      if (!transitionResult.ok) {
        return transitionResult;
      }

      // 2. PTY mit --resume <claude-session-id> spawnen. Modell aus session.current_model
      //    (Architektur 6.2: gleiches Modell wie ursprünglich, kein Picker beim Resume).
      const model = session.current_model ?? current.default_model;
      try {
        manager.create(input.sessionId, {
          shell: lookup.resolved,
          args: ['--resume', claudeSessionId, '--model', model],
          cwd: session.cwd,
          cols: input.cols,
          rows: input.rows,
        });
      } catch (e) {
        lifecycle.transition(input.sessionId, 'error', 'spawn-error');
        return errFromUnknown(e, 'PTY_RESUME_SPAWN');
      }

      log.info(
        `[session:resume] sessionId=${input.sessionId} claudeSessionId=${claudeSessionId} model=${model}`,
      );
      return ok(transitionResult.data);
    } catch (e) {
      return errFromUnknown(e, 'SESSION_RESUME');
    }
  });

  // Sprint 6: Verlauf-Panel-Liste für ein Projekt. Filter (Typ/Status/Volltext) sind
  // optional; leere Filter liefern alle Sessions des Projekts. Token-Aggregate kommen
  // aus der messages-Tabelle (Sprint-5-Persistenz). Sortierung: jüngste zuerst.
  ipcMain.handle(Channels.SessionHistory, (_event, payload: unknown) => {
    try {
      const input = SessionHistoryInputSchema.parse(payload);
      return ok(sessions.listHistoryForProject(input));
    } catch (e) {
      return errFromUnknown(e, 'SESSION_HISTORY');
    }
  });

  // Sprint-6-UX-Fix: explizites Archivieren aus dem Verlauf-Detail-Pane. Trennt sich
  // bewusst von session:close (= Tab schließen ohne archive). Lifecycle setzt den
  // Status auf archived; Resume aus archived ist weiterhin verboten — der User
  // muss bewusst zustimmen, dass die Session aus der Liste verschwindet.
  ipcMain.handle(Channels.SessionArchive, (_event, payload: unknown) => {
    try {
      const input = SessionArchiveInputSchema.parse(payload);
      const result = lifecycle.transition(input.sessionId, 'archived', 'tab-close');
      return result;
    } catch (e) {
      return errFromUnknown(e, 'SESSION_ARCHIVE');
    }
  });
}
