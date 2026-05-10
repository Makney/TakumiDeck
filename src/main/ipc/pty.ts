import { ipcMain, type WebContents } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import {
  PtyCreateInputSchema,
  PtyWriteInputSchema,
  PtyResizeInputSchema,
  PtyKillInputSchema,
} from '@shared/schemas';
import type { PtyManager } from '../pty/manager';
import type { SessionRepository } from '../db/repos/sessions';
import type { ProjectRepository } from '../db/repos/projects';
import type { SessionLifecycle } from '../sessions/lifecycle';
import type { SettingsStore } from '../settings/store';
import type { Logger } from '../logger';
import fs from 'node:fs';
import { resolveExecutable } from '../pty/binary';

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

  ipcMain.handle(Channels.PtyCreate, (_event, payload: unknown) => {
    try {
      const input = PtyCreateInputSchema.parse(payload);
      const current = settings.read();

      // 0a. Pre-Check: existiert die Binary überhaupt? Sonst wirft ConPTY den Fehler
      //     erst aus einem Worker-Thread und reißt (ohne uncaughtException-Handler)
      //     den Main-Prozess um — wir geben den Fehler stattdessen sauber zurück.
      const lookup = resolveExecutable(current.claude_binary_path);
      if (!lookup.ok) {
        log.warn(`[pty] Binary nicht auflösbar: ${lookup.error}`);
        return err<never>(lookup.error, 'PTY_BINARY_NOT_FOUND');
      }

      // 0b. Pre-Check: existiert das cwd? ConPTY wirft sonst ERROR_DIRECTORY (267).
      if (!fs.existsSync(input.cwd)) {
        const msg = `Working-Directory existiert nicht: ${input.cwd}. Setze workspace_path in settings.json auf einen vorhandenen Ordner.`;
        log.warn(`[pty] ${msg}`);
        return err<never>(msg, 'PTY_CWD_NOT_FOUND');
      }

      // 1. Sprint 6: Counter atomar allozieren (Q6 Variante B). Nur für 'feature' —
      //    Bug/Review/Docs-Sync bleiben ohne season_number. Wenn das Project nicht
      //    existiert (sollte beim Sprint-4-Filter im Renderer nicht passieren, ist
      //    aber als Defense-in-Depth korrekt), bekommt die Session keine Nummer.
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
      const row = sessions.create({
        id: input.sessionId,
        project_id: input.projectId,
        title: input.title,
        type: input.type,
        model: input.model,
        cwd: input.cwd,
        season_number: seasonNumber,
        claude_session_id: input.sessionId,
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
          shell: lookup.resolved,
          args: ['--session-id', input.sessionId, '--model', input.model],
          cwd: input.cwd,
          cols: input.cols,
          rows: input.rows,
        });
      } catch (e) {
        // running → error via Lifecycle (statt direktem repo.update), damit der
        // Side-Effect-Pfad (ended_at setzen) konsolidiert bleibt.
        lifecycle.transition(input.sessionId, 'error', 'spawn-error');
        throw e;
      }

      log.info(`[pty] erstellt sessionId=${input.sessionId} model=${input.model}`);
      return ok(row);
    } catch (e) {
      return errFromUnknown(e, 'PTY_CREATE');
    }
  });

  ipcMain.handle(Channels.PtyWrite, (_event, payload: unknown) => {
    try {
      const input = PtyWriteInputSchema.parse(payload);
      manager.write(input.sessionId, input.data);
      return ok(null);
    } catch (e) {
      return errFromUnknown(e, 'PTY_WRITE');
    }
  });

  ipcMain.handle(Channels.PtyResize, (_event, payload: unknown) => {
    try {
      const input = PtyResizeInputSchema.parse(payload);
      manager.resize(input.sessionId, input.cols, input.rows);
      return ok(null);
    } catch (e) {
      return errFromUnknown(e, 'PTY_RESIZE');
    }
  });

  ipcMain.handle(Channels.PtyKill, (_event, payload: unknown) => {
    try {
      const input = PtyKillInputSchema.parse(payload);
      manager.kill(input.sessionId);
      return ok(null);
    } catch (e) {
      return errFromUnknown(e, 'PTY_KILL');
    }
  });
}
