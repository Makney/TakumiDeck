import fs from 'node:fs';
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
import { resolveTerminalShell } from '../pty/terminalShell';
import { assertFromMainWindow } from './sender-guard';
import { expectedJsonlPath } from '../jsonl/cwd-encoding';
import { defaultClaudeProjectsPath } from '../jsonl/watcher';
import type { JsonlPollingRing } from '../jsonl/polling-ring';
import type { GitDriver } from '../git/driver';
import { resolveWorktreePath } from '../git/worktreePath';
import { sanitizeBranchName } from '@shared/worktree';

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
  // Phase-2 Season-15: optionale Kopplung an den Polling-Ring. Tests, die nur
  // den DB-Pfad pruefen wollen (= ohne realen Watcher/Poller), lassen das Feld
  // weg.
  pollingRing?: JsonlPollingRing;
  // Phase-2 Season-15: Override fuer Tests, damit kein echtes ~/.claude/
  // angefragt wird. Default = defaultClaudeProjectsPath().
  claudeProjectsRoot?: string;
  // Phase-2 Season-29: GitDriver fuer Baseline-SHA-Capture beim Spawn. Optional
  // — Tests, die den Git-Pfad nicht ueberschreiben wollen, lassen das Feld weg
  // (die Session bleibt dann mit start_commit_sha=NULL).
  gitDriver?: GitDriver;
}): void {
  const {
    manager,
    sessions,
    projects,
    lifecycle,
    settings,
    getWebContents,
    log,
    pollingRing,
    gitDriver,
  } = deps;
  const claudeProjectsRoot = deps.claudeProjectsRoot ?? defaultClaudeProjectsPath();

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
      } else {
        // Phase-2 Season-21: Status-Push auch fuer pty:exit. Bisher hat nur
        // die state-detection-loop SessionStatusPush gefeuert, weshalb
        // HistoryPane (volle Tabelle) eine im Hintergrund auf `completed`
        // gewanderte Session nicht aktualisiert hat — das Detail-Pane zeigt
        // dann z.B. „läuft" obwohl die DB-Wahrheit schon `completed` ist.
        getWebContents()?.send(Channels.SessionStatusPush, {
          sessionId: event.sessionId,
          status: result.data.status,
        });
      }
      // Phase-2 Season-15: nach Lifecycle-Transition vom Polling-Ring abkoppeln.
      // Idempotent — falls schon detached (z.B. Tab-Close kam vor pty:exit), no-op.
      pollingRing?.detach(event.sessionId);
      getWebContents()?.send(Channels.PtyExit, event);
    },
  });

  ipcMain.handle(Channels.PtyCreate, async (event, payload: unknown) => {
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
      // Season 37 (Worktree-Support): Standard ist der Projekt-Root. Bei
      // gewaehlter Worktree-Option zeigt cwd anschliessend auf das angelegte
      // Worktree-Verzeichnis — alle cwd-abhaengigen Schritte (Pre-Spawn-Check,
      // JSONL-Pfad, Spawn, Baseline-SHA) laufen dann dort.
      let cwd = project.path;
      let worktreePath: string | null = null;
      let worktreeBranch: string | null = null;
      if (input.worktree) {
        // Worktree braucht ein echtes Git-Repo + den GitDriver. Das Schema
        // schliesst type='terminal' bereits aus.
        if (!gitDriver || project.has_git !== 1) {
          return err<never>(
            `Worktree benoetigt ein Git-Repository — „${project.name}" ist keins`,
            'WORKTREE_NO_GIT',
          );
        }
        // Neuer Branch: frei eingegebenen Namen zu einem gueltigen Git-Ref
        // slugifizieren (Leerzeichen etc. crashen `git worktree add -b` sonst).
        // Bestehender Branch kommt aus dem Dropdown realer Branches → unveraendert.
        const branch =
          input.worktree.mode === 'new'
            ? sanitizeBranchName(input.worktree.branch)
            : input.worktree.branch;
        const wtPath = resolveWorktreePath(project.path, branch);
        try {
          await gitDriver.addWorktree(project.path, wtPath, {
            branch,
            mode: input.worktree.mode,
            baseRef: input.worktree.baseRef ?? null,
          });
        } catch (e) {
          log.warn(
            `[pty] git worktree add fehlgeschlagen branch=${branch} path=${wtPath}`,
            e,
          );
          return err<never>(
            input.worktree.mode === 'new'
              ? `Worktree konnte nicht angelegt werden. Existiert der Branch „${branch}" schon?`
              : `Worktree konnte nicht angelegt werden. Ist der Branch „${branch}" bereits in einem anderen Worktree ausgecheckt?`,
            'WORKTREE_ADD_FAILED',
          );
        }
        cwd = wtPath;
        worktreePath = wtPath;
        worktreeBranch = branch;
      }

      // Phase-2 Season-31: Terminal-Sessions spawnen pwsh.exe/powershell.exe statt
      // der claude-Binary — Skip-Gate #1: Pre-Spawn-Check geht durch einen anderen
      // Helper, der den settings.claude_binary_path-Lookup nicht braucht.
      const isTerminal = input.type === 'terminal';
      let resolvedBinary: string;
      if (isTerminal) {
        const shellResult = resolveTerminalShell(log);
        if (!shellResult.ok) return shellResult;
        // cwd-Existenz-Check ziehen wir aus dem claude-Pfad heraus dupliziert nach,
        // damit ein umbenannter/geloeschter Projekt-Pfad nicht in ConPTYs
        // ERROR_DIRECTORY landet.
        if (!fs.existsSync(cwd)) {
          return err<never>(
            `Working-Directory existiert nicht: ${cwd}. Setze workspace_path in settings.json auf einen vorhandenen Ordner.`,
            'PTY_CWD_NOT_FOUND',
          );
        }
        resolvedBinary = shellResult.data.resolvedShell;
      } else {
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
        resolvedBinary = pre.data.resolvedBinary;
      }

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
      // Phase-2 Season-15: erwarteten JSONL-Pfad gleich beim Insert mitschreiben.
      // Pfad ist deterministisch aus cwd + sessionId — der Watcher landet beim
      // ersten chokidar-add/change ueber `WHERE jsonl_path = ?` in einem einzigen
      // Index-Lookup, und der Polling-Ring weiss sofort, welche Datei er pro
      // Tick anschauen soll.
      //
      // Phase-2 Season-31: Skip-Gate #2 — Terminal-Sessions schreiben keine JSONL,
      // jsonl_path bleibt also null. Damit ueberspringt der Watcher die Session
      // implizit (kein Pfad → kein Match).
      const jsonlPath = isTerminal
        ? null
        : expectedJsonlPath(claudeProjectsRoot, cwd, input.sessionId);

      // Phase-2 Season-31: Skip-Gate #3 — claude_session_id + current_model bleiben
      // bei terminal-Sessions null (keine claude-Spawn-Metadaten). Resume spawnt
      // die Shell ueber den gespeicherten cwd neu; keine UUID noetig.
      const row = sessions.create({
        id: input.sessionId,
        project_id: input.projectId,
        title: input.title,
        type: input.type,
        model: isTerminal ? null : input.model,
        cwd,
        season_number: seasonNumber,
        claude_session_id: isTerminal ? null : input.sessionId,
        custom_type_label:
          input.type === 'custom' ? (input.customTypeLabel ?? null) : null,
        jsonl_path: jsonlPath,
        // Season 37: bei Worktree-Sessions Pfad + Branch persistieren; sonst null.
        worktree_path: worktreePath,
        worktree_branch: worktreeBranch,
      });

      // 3. PTY spawnen. Wenn das fehlschlägt (Binary nicht gefunden, cwd ungültig),
      //    die Session in der DB als 'error' markieren statt als orphaned 'running'.
      //
      //    Sprint-6-Hotfix: --session-id <uuid> erzwingt, dass claude-code unsere
      //    UUID als interne Session-UUID verwendet (statt eine eigene zu erzeugen).
      //    Damit matcht --resume <sessionId> später 1:1 — ohne dieses Flag schreibt
      //    claude-code die JSONL unter einer eigenen UUID, und Resume scheitert mit
      //    "No conversation found with session ID: ...".
      // Phase-2 Season-31: Skip-Gate #4 — Terminal-Shell kennt weder --session-id
      // noch --model. Args bleiben leer, die Shell startet interaktiv im cwd.
      try {
        manager.create(input.sessionId, {
          shell: resolvedBinary,
          args: isTerminal
            ? []
            : ['--session-id', input.sessionId, '--model', input.model],
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
        // Season 37: ein frisch angelegter Worktree waere bei Spawn-Fehler ein
        // Orphan — best-effort wieder entfernen (force, weil er garantiert
        // sauber ist: es lief noch keine Session darin).
        if (worktreePath !== null && gitDriver) {
          void gitDriver
            .removeWorktree(project.path, worktreePath, true)
            .catch((cleanupErr) => {
              log.warn(
                `[pty] Worktree-Cleanup nach Spawn-Fehler fehlgeschlagen path=${worktreePath}`,
                cleanupErr,
              );
            });
        }
        throw e;
      }

      // Phase-2 Season-15: Polling-Ring an die frische Session koppeln, damit
      // die Token-Bars in Echtzeit pushen statt erst am 100-ms-awaitWriteFinish.
      // Detach laeuft ueber den SessionLifecycle bei terminalen Statuswechseln.
      //
      // Phase-2 Season-31: Skip-Gate #5 — Terminal-Sessions haben kein JSONL,
      // also auch nichts zu pollen. jsonlPath ist hier bereits null bei isTerminal,
      // der Guard macht den Skip lesbar.
      if (!isTerminal && jsonlPath !== null) {
        pollingRing?.attach(input.sessionId, jsonlPath);
      }

      // Phase-2 Season-29 (Multi-Tab-Diff): Baseline-SHA fuer den Session-Diff-
      // Modus fixieren. Fire-and-forget — der DiffViewer fragt erst bei Tab-
      // Wechsel auf den Session-Modus nach, da reichen die ~50-100 ms revParse-
      // Roundtrip allemal. Bei has_git=0, detached HEAD oder Git-Fehler bleibt
      // start_commit_sha auf NULL — der Renderer zeigt dann den Empty-State.
      //
      // setStartCommitSha ist idempotent + race-frei via `WHERE start_commit_sha
      // IS NULL` (siehe sessions.ts) — laeuft dieses fire-and-forget nach einem
      // Session-Archive/Close auf, ist es ein No-op. Ein isShuttingDown()-Check
      // ist deshalb nicht noetig.
      if (gitDriver && project.has_git === 1) {
        void gitDriver
          .revParse(cwd, 'HEAD')
          .then((sha) => {
            if (sha) {
              sessions.setStartCommitSha(input.sessionId, sha);
            }
          })
          .catch((e) => {
            // Neutral formuliert: der catch faengt sowohl revParse- als auch
            // setStartCommitSha-Fehler (DB), daher keine revParse-spezifische
            // Message.
            log.warn(
              `[pty] Baseline-SHA-Capture fehlgeschlagen sessionId=${input.sessionId}: ${e}`,
            );
          });
      }

      log.info(
        `[pty] erstellt sessionId=${input.sessionId} ${
          isTerminal ? `shell=${resolvedBinary}` : `model=${input.model}`
        }`,
      );
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
      // Code-Review IPC 2026-05-31 (W-1): Teardown-Race abfangen. Schickt der
      // Renderer noch einen letzten Keystroke, nachdem der PTY bereits beendet/
      // entfernt wurde (Tab-Close vor pty:exit), gibt es nichts zu beschreiben.
      // manager.write würde sonst über requireHandle werfen und einen
      // PTY_WRITE-Error an den fire-and-forget-Renderer reichen — still verwerfen.
      if (!manager.has(input.sessionId)) return ok(null);
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
      //
      // Code-Review IPC 2026-05-31 (V-1): Der [\s\S]*?-Scan laeuft pro Keystroke;
      // bei sehr grossen Pastes (mehrere MB Clipboard) ist das teuer. Da jeder
      // Bracketed-Paste-Block mit \x1b[200~ beginnt, ueberspringt der billige
      // includes-Vorcheck den Regex im Normalfall (einzelne Taste) komplett.
      const hasPasteMarker = input.data.includes('\x1b[200~');
      const stripped = hasPasteMarker
        ? // eslint-disable-next-line no-control-regex -- ESC (\x1b) ist Teil der ANSI-Bracketed-Paste-Marker, hier absichtlich.
          input.data.replace(/\x1b\[200~[\s\S]*?\x1b\[201~/g, '')
        : input.data;
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
      // Code-Review IPC 2026-05-31 (V-2): wie pty:write — Resize auf einen bereits
      // entfernten PTY (Teardown-Race) still verwerfen statt requireHandle werfen
      // zu lassen. Der Renderer ruft resize fire-and-forget nach jedem Mount/Layout.
      if (!manager.has(input.sessionId)) return ok(null);
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
      // Code-Review IPC 2026-05-31 (V-2): Kill auf einen bereits beendeten PTY
      // (onExit hat das Handle schon entfernt) ist ein No-op — still verwerfen,
      // statt requireHandle einen PTY_KILL-Error werfen zu lassen.
      if (!manager.has(input.sessionId)) return ok(null);
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
