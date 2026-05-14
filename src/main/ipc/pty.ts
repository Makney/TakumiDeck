import { ipcMain, type WebContents } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import {
  PtyCreateInputSchema,
  PtyWriteInputSchema,
  PtyResizeInputSchema,
  PtyKillInputSchema,
  PtyTuiStateInputSchema,
} from '@shared/schemas';
import type { PtyManager } from '../pty/manager';
import type { SessionRepository } from '../db/repos/sessions';
import type { ProjectRepository } from '../db/repos/projects';
import type { SessionLifecycle } from '../sessions/lifecycle';
import type { SettingsStore } from '../settings/store';
import type { Logger } from '../logger';
import { preSpawnCheck } from '../pty/preSpawnCheck';
import { assertFromMainWindow } from './sender-guard';

// IPC-Handler für pty:create / pty:write / pty:resize / pty:kill.
// Forwarded außerdem die PtyManager-Events ans aktive BrowserWindow.
export function registerPtyIpc(deps: {
  manager: PtyManager;
  sessions: SessionRepository;
  projects: ProjectRepository;
  lifecycle: SessionLifecycle;
  settings: SettingsStore;
  getWebContents: () => WebContents | null;
  log: Logger;
}): void {
  const { manager, sessions, projects, lifecycle, settings, getWebContents, log } = deps;

  // Manager-Events ans Renderer durchreichen + bei Exit Session-Status nachziehen.
  manager.setListeners({
    data: (event) => {
      getWebContents()?.send(Channels.PtyData, event);
    },
    exit: (event) => {
      // App-Quit: Lifecycle hat die Sessions schon auf 'interrupted' gesetzt
      // (in main.ts before-quit, vor killAll). Hier nichts mehr tun, sonst würden
      // wir den interrupted-Status mit completed überschreiben — der Sprint-2-Bug.
      // Tab-Close hat Sessions bereits auf 'archived' gesetzt — Lifecycle wird die
      // archived → completed-Transition ohnehin ablehnen, das Logging zeigt das nur an.
      if (lifecycle.isShuttingDown()) {
        getWebContents()?.send(Channels.PtyExit, event);
        return;
      }
      const result = lifecycle.transition(event.sessionId, 'completed', 'pty-exit');
      if (!result.ok) {
        // Erwartet bei archived (User hat Tab vor PTY-Exit geschlossen) oder
        // running→running (sollte nicht passieren, aber idempotent). Nur loggen.
        log.warn(
          `[pty:exit] Lifecycle-Transition abgelehnt sessionId=${event.sessionId} → ${result.error}`,
        );
      }
      getWebContents()?.send(Channels.PtyExit, event);
    },
  });

  ipcMain.handle(Channels.PtyCreate, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = PtyCreateInputSchema.parse(payload);
      const current = settings.read();

      // Bereich-4-Review (B-5): cwd kommt nicht mehr aus dem Renderer-Payload,
      // sondern wird serverseitig aus dem Project hergeleitet. Damit kann der
      // Renderer keinen freien OS-Pfad in einen `claude`-Spawn schieben.
      const project = projects.getById(input.projectId);
      if (!project) {
        return err<never>(
          `Projekt ${input.projectId} nicht gefunden`,
          'PROJECT_NOT_FOUND',
        );
      }
      const cwd = project.path;

      // Bereich-4-Review (W-1): Binary + cwd in einem Pre-Spawn-Helper, weil
      // session:resume denselben Block hatte. PTY_BINARY_NOT_FOUND und
      // PTY_CWD_NOT_FOUND kommen aus dem Helper zurück.
      const pre = preSpawnCheck({
        binaryPath: current.claude_binary_path,
        cwd,
        log,
        label: 'pty',
        cwdMissingHint: 'Setze workspace_path in settings.json auf einen vorhandenen Ordner.',
      });
      if (!pre.ok) return pre;
      const { resolvedBinary } = pre.data;

      // 1. Sprint 6: Counter atomar allozieren (Q6 Variante B). Nur für 'feature' —
      //    Bug/Review/Docs-Sync/Custom bleiben ohne season_number. Wenn das Project
      //    nicht existiert (sollte beim Sprint-4-Filter im Renderer nicht passieren,
      //    ist aber als Defense-in-Depth korrekt), bekommt die Session keine Nummer.
      let seasonNumber: number | null = null;
      if (input.type === 'feature') {
        seasonNumber = projects.allocateSeasonNumber(input.projectId);
      }

      // 2. Session-DB-Row anlegen. Wir verwenden die vom Renderer vorgegebene
      //    sessionId 1:1, damit pty:data-Events sofort zuordnenbar sind. Sprint 5
      //    nimmt project_id aus dem Input — Sprint-2-Lifeline (DEFAULT_PROJECT_ID
      //    hartcoded) hatte alle Sessions am Default-Bucket hängen lassen, was
      //    Per-Projekt-Token-Aggregate verhindert hat.
      //
      //    Sprint-6-Hotfix: claude_session_id = sessionId, weil wir den Spawn unten
      //    mit --session-id <sessionId> machen. Damit ist die Session ab dem ersten
      //    Tick resume-fähig (Variante A des Hotfix-Plans).
      //
      //    Phase-2 Season-5: bei type='custom' speichert das Repo die freie
      //    Bezeichnung in custom_type_label; bei den vier festen Typen verwerfen
      //    wir einen versehentlich mitgeschickten Wert.
      const row = sessions.create({
        id: input.sessionId,
        project_id: input.projectId,
        title: input.title,
        type: input.type,
        model: input.model,
        cwd,
        season_number: seasonNumber,
        claude_session_id: input.sessionId,
        custom_type_label:
          input.type === 'custom' ? (input.customTypeLabel ?? null) : null,
      });

      // 3. PTY spawnen. Wenn das fehlschlägt (Binary nicht gefunden, cwd ungültig),
      //    die Session in der DB als 'error' markieren statt als orphaned 'running'.
      //
      //    Sprint-6-Hotfix: --session-id <uuid> erzwingt, dass claude-code unsere
      //    UUID als interne Session-UUID verwendet (statt eine eigene zu erzeugen).
      //    Damit matcht --resume <sessionId> später 1:1 — ohne dieses Flag schreibt
      //    claude-code die JSONL unter einer eigenen UUID, und Resume scheitert mit
      //    "No conversation found with session ID: ...".
      try {
        manager.create(input.sessionId, {
          shell: resolvedBinary,
          args: ['--session-id', input.sessionId, '--model', input.model],
          cwd,
          cols: input.cols,
          rows: input.rows,
        });
      } catch (e) {
        // running → error via Lifecycle (statt direktem repo.update), damit der
        // Side-Effect-Pfad (ended_at setzen) konsolidiert bleibt.
        // Bereich-4-Review (I-1): Result-Drop sichtbar machen, falls die
        // Transition selbst fehlschlägt (z.B. Session-Row inzwischen gelöscht).
        const tr = lifecycle.transition(input.sessionId, 'error', 'spawn-error');
        if (!tr.ok) {
          log.warn(
            `[pty] Lifecycle-Transition zu 'error' abgelehnt sessionId=${input.sessionId} → ${tr.error}`,
          );
        }
        throw e;
      }

      log.info(`[pty] erstellt sessionId=${input.sessionId} model=${input.model}`);
      return ok(row);
    } catch (e) {
      return errFromUnknown(e, 'PTY_CREATE');
    }
  });

  ipcMain.handle(Channels.PtyWrite, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = PtyWriteInputSchema.parse(payload);
      manager.write(input.sessionId, input.data);

      // Variante A+B: Enter-Tastendruck auf einer waiting-Session → sofort
      // optimistisch auf running setzen, damit der Tab-Dot sofort grün wird.
      // Kein JSONL nötig — der State-Detection-Loop macht den Revert: kommt
      // innerhalb von ~3 s keine neue JSONL-Zeile (versehentlicher Enter),
      // landet die Session automatisch wieder auf waiting.
      //
      // Phase-2 Season-3-Folge: Bracketed-Paste-Bloecke (\x1b[200~ … \x1b[201~)
      // tragen die eingefuegten Newlines IM Paste-Block — Claude Code wertet die
      // als Shift+Enter, nicht als Absende-Enter. Wir filtern den Paste-Body
      // raus und pruefen nur die Newlines ausserhalb (= echter CR vom Submit).
      // eslint-disable-next-line no-control-regex -- ESC (\x1b) ist Teil der ANSI-Bracketed-Paste-Marker, hier absichtlich.
      const stripped = input.data.replace(/\x1b\[200~[\s\S]*?\x1b\[201~/g, '');
      if (stripped.includes('\r') || stripped.includes('\n')) {
        const current = sessions.findById(input.sessionId);
        if (current?.status === 'waiting') {
          const tr = lifecycle.transition(input.sessionId, 'running', 'manual');
          if (tr.ok) {
            getWebContents()?.send(Channels.SessionStatusPush, {
              sessionId: input.sessionId,
              status: 'running',
            });
          }
        }
      }

      return ok(null);
    } catch (e) {
      return errFromUnknown(e, 'PTY_WRITE');
    }
  });

  ipcMain.handle(Channels.PtyResize, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = PtyResizeInputSchema.parse(payload);
      manager.resize(input.sessionId, input.cols, input.rows);
      return ok(null);
    } catch (e) {
      return errFromUnknown(e, 'PTY_RESIZE');
    }
  });

  ipcMain.handle(Channels.PtyKill, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = PtyKillInputSchema.parse(payload);
      manager.kill(input.sessionId);
      return ok(null);
    } catch (e) {
      return errFromUnknown(e, 'PTY_KILL');
    }
  });

  // Phase-2 Season-1: Renderer-Push aus dem TUI-Pattern-Matcher. Wir trauen dem
  // gemeldeten Status, aber filtern terminale Sessions (completed/archived/etc.)
  // hier weg statt sie dem Lifecycle zu reichen — sonst würde ein „stille
  // running-Push"-Renderer eine bereits archivierte Session resurrecten. Der
  // Lifecycle würde das ohnehin per ALLOWED-Tabelle ablehnen, aber der explizite
  // Check macht die Erwartung im Handler-Code sichtbar.
  ipcMain.handle(Channels.PtyTuiState, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = PtyTuiStateInputSchema.parse(payload);
      const current = sessions.findById(input.sessionId);
      if (!current) {
        return err<null>(
          `Session ${input.sessionId} nicht gefunden`,
          'SESSION_NOT_FOUND',
        );
      }
      // Terminale Status sind vom Renderer aus nicht überschreibbar. Tab kann
      // beim Schließen noch einen letzten TUI-State-Push schicken, bevor der
      // Listener abreißt — den verwerfen wir hier still.
      if (
        current.status === 'completed' ||
        current.status === 'archived' ||
        current.status === 'interrupted' ||
        current.status === 'error'
      ) {
        return ok(null);
      }
      const result = lifecycle.transition(input.sessionId, input.state, 'manual');
      if (!result.ok) {
        // Best-Effort: TUI-State-Push ist „Nice-to-have"; abgelehnte Transitions
        // (z.B. weil die State-Machine den Pfad sperrt) loggen wir, lassen den
        // Renderer aber keinen Fehler sehen. Sonst würde jeder Tick im Renderer
        // den IpcResult-Error inspizieren müssen.
        log.warn(
          `[pty:tui-state] Transition abgelehnt sessionId=${input.sessionId.slice(0, 8)} → ${input.state}: ${result.error}`,
        );
      }
      return ok(null);
    } catch (e) {
      return errFromUnknown(e, 'PTY_TUI_STATE');
    }
  });
}
