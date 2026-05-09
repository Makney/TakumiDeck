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
import type { SettingsStore } from '../settings/store';
import type { Logger } from '../logger';
import { DEFAULT_PROJECT_ID } from '../db/repos/projects';
import fs from 'node:fs';
import { resolveExecutable } from '../pty/binary';

// IPC-Handler für pty:create / pty:write / pty:resize / pty:kill.
// Forwarded außerdem die PtyManager-Events ans aktive BrowserWindow.
export function registerPtyIpc(deps: {
  manager: PtyManager;
  sessions: SessionRepository;
  settings: SettingsStore;
  getWebContents: () => WebContents | null;
  log: Logger;
}): void {
  const { manager, sessions, settings, getWebContents, log } = deps;

  // Manager-Events ans Renderer durchreichen + bei Exit Session-Status nachziehen.
  manager.setListeners({
    data: (event) => {
      getWebContents()?.send(Channels.PtyData, event);
    },
    exit: (event) => {
      // Sprint-2-Minimum: bei natürlichem Exit Session auf 'completed' setzen.
      // Differenzierte Lifecycle-Stati (interrupted, error, archived) sind Sprint 3.
      try {
        sessions.update(event.sessionId, {
          status: 'completed',
          ended_at: Date.now(),
        });
      } catch (e) {
        log.warn('Session-Status-Update bei pty:exit fehlgeschlagen', e);
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

      // 1. Session-DB-Row anlegen. Wir verwenden die vom Renderer vorgegebene
      //    sessionId 1:1, damit pty:data-Events sofort zuordnenbar sind.
      const row = sessions.create({
        id: input.sessionId,
        project_id: DEFAULT_PROJECT_ID,
        title: input.title,
        type: input.type,
        model: input.model,
        cwd: input.cwd,
      });

      // 2. PTY spawnen. Wenn das fehlschlägt (Binary nicht gefunden, cwd ungültig),
      //    die Session in der DB als 'error' markieren statt als orphaned 'running'.
      try {
        manager.create(input.sessionId, {
          shell: lookup.resolved,
          args: ['--model', input.model],
          cwd: input.cwd,
          cols: input.cols,
          rows: input.rows,
        });
      } catch (e) {
        sessions.update(input.sessionId, {
          status: 'error',
          ended_at: Date.now(),
        });
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
