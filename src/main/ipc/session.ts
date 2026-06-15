import { ipcMain } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import {
  SessionUpdateInputSchema,
  SessionCloseInputSchema,
  SessionResumeInputSchema,
  SessionHistoryInputSchema,
  SessionArchiveInputSchema,
} from '@shared/schemas';
import fs from 'node:fs';
import type { SessionRepository } from '../db/repos/sessions';
import type { SessionLifecycle } from '../sessions/lifecycle';
import type { PtyManager } from '../pty/manager';
import type { SettingsStore } from '../settings/store';
import type { Logger } from '../logger';
import { preSpawnCheck } from '../pty/preSpawnCheck';
import { resolveTerminalShell } from '../pty/terminalShell';
import { assertFromMainWindow } from './sender-guard';
import type { JsonlPollingRing } from '../jsonl/polling-ring';

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
  // Phase-2 Season-15: optional, weil Tests den Polling-Ring nicht aufsetzen.
  pollingRing?: JsonlPollingRing;
}): void {
  const { sessions, lifecycle, manager, settings, log, pollingRing } = deps;

  ipcMain.handle(Channels.SessionUpdate, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
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
      // Bereich-4-Review (B-1): ended_at ist nicht mehr im Schema; die Lifecycle
      // setzt/nullt es zentral. Verbleibende Felder im restPatch sind reine
      // Renderer-Eigenschaften (title, notes_md, current_model).
      const row = sessions.update(input.sessionId, restPatch);
      if (!row) {
        return err<never>(`Session ${input.sessionId} nicht gefunden`, 'SESSION_NOT_FOUND');
      }
      return ok(row);
    } catch (e) {
      return errFromUnknown(e, 'SESSION_UPDATE');
    }
  });

  ipcMain.handle(Channels.SessionClose, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
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
      // Phase-2 Season-15: Polling-Ring abkoppeln, sobald der PTY weg ist.
      // Der pty:exit-Handler patcht zwar nochmal nach, aber bis dahin haengt
      // der Per-Session-Timer noch und macht ein paar leere fs.stat-Calls.
      pollingRing?.detach(input.sessionId);
      // Aktuellsten Stand zurückliefern — wenn der pty:exit-Handler synchron noch
      // nicht gefeuert hat, ist hier ggf. noch der alte Status, das Renderer-Update
      // kommt dann via pty:exit-Push.
      const refreshed = sessions.findById(input.sessionId) ?? session;
      return ok(refreshed);
    } catch (e) {
      return errFromUnknown(e, 'SESSION_CLOSE');
    }
  });

  ipcMain.handle(Channels.SessionResume, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = SessionResumeInputSchema.parse(payload);
      const session = sessions.findById(input.sessionId);
      if (!session) {
        return err<never>(`Session ${input.sessionId} nicht gefunden`, 'SESSION_NOT_FOUND');
      }

      // Phase-2 Season-31: Terminal-Sessions resumen via Shell-Resolution statt
      // des claude-Binary-Pfads — und sie haben per Design keine claude-Session-
      // UUID, also greift der Sprint-6-Hotfix-Check unten nicht. Beides wird
      // ueber einen frueh gesetzten isTerminal-Branch erschlagen.
      const isTerminal = session.type === 'terminal';
      // Season 39: opencode-Sessions resumen via `opencode --continue` (eigene
      // Binary, keine claude-UUID). Analog zum terminal-Branch frueh gesetzt.
      const isOpencode = session.type === 'opencode';
      const current = settings.read();

      // Season 39: deaktivierte Engine → kein Resume. Defense-in-Depth zum
      // Renderer-Toggle.
      if (isOpencode && !current.opencode_enabled) {
        return err<never>(
          'Opencode ist in den Einstellungen nicht aktiviert.',
          'OPENCODE_DISABLED',
        );
      }

      let resolvedBinary: string;
      if (isTerminal) {
        const shellResult = resolveTerminalShell(log);
        if (!shellResult.ok) return shellResult;
        if (!fs.existsSync(session.cwd)) {
          return err<never>(
            `Working-Directory existiert nicht: ${session.cwd}. Der Ordner wurde umbenannt oder gelöscht.`,
            'PTY_CWD_NOT_FOUND',
          );
        }
        resolvedBinary = shellResult.data.resolvedShell;
      } else {
        // Bereich-4-Review (W-1): Pre-Spawn-Check via gemeinsamem Helper (Binary
        // + cwd). Bei Sessions, deren Ordner zwischen den Sessions umbenannt
        // wurde, kommt PTY_CWD_NOT_FOUND mit passendem Hint zurück.
        // Season 39: opencode laeuft durch denselben Helper mit eigener Binary.
        const pre = preSpawnCheck({
          binaryPath: isOpencode ? current.opencode_binary_path : current.claude_binary_path,
          cwd: session.cwd,
          log,
          label: isOpencode ? 'session:resume-opencode' : 'session:resume',
          cwdMissingHint: 'Der Ordner wurde umbenannt oder gelöscht.',
        });
        if (!pre.ok) return pre;
        resolvedBinary = pre.data.resolvedBinary;
      }

      // Sprint-6-Hotfix: Resume nutzt die claude-eigene Session-UUID. Bei
      // Sessions ab dem Hotfix ist das gleich `session.id` (weil pty:create
      // mit --session-id <id> spawnt), bei Legacy-Sessions wird die UUID vom
      // JSONL-Watcher rückwirkend befüllt. Wenn beides null ist (Session war
      // so kurz aktiv, dass keine JSONL-Zeile entstand), bleibt nur der
      // Sprint-3-Pfad — der für diese Session nicht funktioniert. Wir geben
      // einen sprechenden Fehler zurück, statt den Spawn ins Leere laufen zu
      // lassen.
      // Phase-2 Season-31: Terminal-Sessions sind per Design ohne UUID — der
      // Check uebersteigt sie.
      // Season 39: opencode-Sessions haben per Design keine claude-UUID — der
      // Check uebersteigt sie (wie terminal).
      const claudeSessionId = session.claude_session_id;
      if (!isTerminal && !isOpencode && claudeSessionId === null) {
        // Bereich-4-Review (I-1): Result der Lifecycle-Transition prüfen
        // und loggen, falls sie scheitert.
        const tr = lifecycle.transition(input.sessionId, 'error', 'spawn-error');
        if (!tr.ok) {
          log.warn(
            `[session:resume] Lifecycle-Transition zu 'error' abgelehnt sessionId=${input.sessionId} → ${tr.error}`,
          );
        }
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

      // Phase-2 Season-15: Polling-Ring wieder an die Session koppeln, sobald
      // sie zurueck im Live-Status ist. jsonl_path kann bei Legacy-Sessions
      // noch null sein — dann bleibt nur der Chokidar-Pfad. Watcher-Backfill
      // wuerde den Pfad bei der naechsten Antwort eintragen, aber der erste
      // Resume-Run profitiert dann noch nicht vom Polling.
      // Phase-2 Season-31: Terminal-Sessions haben dauerhaft jsonl_path=null —
      // der Truthy-Check skippt sie hier automatisch.
      if (transitionResult.data.jsonl_path) {
        pollingRing?.attach(input.sessionId, transitionResult.data.jsonl_path);
      }

      // 2. PTY mit --resume <claude-session-id> spawnen. Modell aus session.current_model
      //    (Architektur 6.2: gleiches Modell wie ursprünglich, kein Picker beim Resume).
      // Phase-2 Season-31: Terminal-Sessions spawnen die Shell ohne Args — kein
      // --resume, kein --model. Der gespeicherte cwd reicht, um die Session am
      // gewohnten Ort fortzusetzen.
      const model = session.current_model ?? current.default_model;
      // Season 39: opencode kennt kein --resume mit fixer UUID. Wir setzen die
      // letzte Session im cwd via `--continue` fort. Sonderfall (mehrere
      // opencode-Sessions im selben Ordner) ist bewusst akzeptiert — eine
      // robuste Per-Session-Aufloesung kommt erst mit dem Token-Tracking-Feature.
      const resumeArgs = isTerminal
        ? []
        : isOpencode
          ? ['--continue']
          : ['--resume', claudeSessionId as string, '--model', model];
      try {
        manager.create(input.sessionId, {
          shell: resolvedBinary,
          args: resumeArgs,
          cwd: session.cwd,
          cols: input.cols,
          rows: input.rows,
        });
      } catch (e) {
        const tr = lifecycle.transition(input.sessionId, 'error', 'spawn-error');
        if (!tr.ok) {
          log.warn(
            `[session:resume] Lifecycle-Transition zu 'error' abgelehnt sessionId=${input.sessionId} → ${tr.error}`,
          );
        }
        // Bereich-4-Review (B-3): Spawn-Error landet im Log, Renderer bekommt
        // nur einen generischen Text mit Code.
        log.warn(`[session:resume] PTY-Spawn fehlgeschlagen sessionId=${input.sessionId}`, e);
        return err<never>('PTY-Spawn beim Resume fehlgeschlagen', 'PTY_RESUME_SPAWN');
      }

      log.info(
        isTerminal
          ? `[session:resume] sessionId=${input.sessionId} shell=${resolvedBinary}`
          : isOpencode
            ? `[session:resume] sessionId=${input.sessionId} opencode --continue`
            : `[session:resume] sessionId=${input.sessionId} claudeSessionId=${claudeSessionId} model=${model}`,
      );
      return ok(transitionResult.data);
    } catch (e) {
      return errFromUnknown(e, 'SESSION_RESUME');
    }
  });

  // Sprint 6: Verlauf-Panel-Liste für ein Projekt. Filter (Typ/Status/Volltext) sind
  // optional; leere Filter liefern alle Sessions des Projekts. Token-Aggregate kommen
  // aus der messages-Tabelle (Sprint-5-Persistenz). Sortierung: jüngste zuerst.
  ipcMain.handle(Channels.SessionHistory, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
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
  ipcMain.handle(Channels.SessionArchive, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = SessionArchiveInputSchema.parse(payload);
      const result = lifecycle.transition(input.sessionId, 'archived', 'tab-close');
      // Phase-2 Season-15: archivierte Sessions schreiben keine JSONL mehr.
      // detach ist idempotent — falls die Session nie attached war, no-op.
      pollingRing?.detach(input.sessionId);
      return result;
    } catch (e) {
      return errFromUnknown(e, 'SESSION_ARCHIVE');
    }
  });
}
