import { ipcMain } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import { DocsSyncStatusInputSchema } from '@shared/schemas';
import {
  DOCS_SYNC_FILES,
  computeFileSyncStatus,
  type DocsSyncFileStatus,
  type DocsSyncStatusResult,
} from '@shared/docs-sync';
import type { ProjectRepository } from '../db/repos/projects';
import type { Logger } from '../logger';
import { assertFromMainWindow } from './sender-guard';

// Phase-2 Season-21 — Docs-Sync-Status-IPC.
//
// Liest die vier Doku-Originale + ihre erwarteten Summary-Files projekt-
// relativ, bildet den SHA-256 der Originale und delegiert die Status-
// Entscheidung an `computeFileSyncStatus` (shared/docs-sync.ts). Reine
// Glue-Code: keine Pure-Logik in dieser Datei.

export function registerDocsIpc(deps: {
  projects: ProjectRepository;
  log: Logger;
}): void {
  const { projects, log } = deps;

  ipcMain.handle(Channels.DocsSyncStatus, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = DocsSyncStatusInputSchema.parse(payload);
      const project = projects.getById(input.projectId);
      if (!project) {
        return err(`Projekt ${input.projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
      }
      const files: DocsSyncFileStatus[] = [];
      for (const descriptor of DOCS_SYNC_FILES) {
        const sourceAbs = path.join(project.path, descriptor.sourcePath);
        const summaryAbs = path.join(project.path, descriptor.summaryPath);
        const [sourceHash, summaryRaw] = await Promise.all([
          hashFileIfExists(sourceAbs),
          readFileIfExists(summaryAbs),
        ]);
        files.push(
          computeFileSyncStatus({ descriptor, sourceHash, summaryRaw }),
        );
      }
      const result: DocsSyncStatusResult = {
        files,
        generatedAt: Date.now(),
      };
      log.info(
        `[docs:sync-status] projectId=${input.projectId} ` +
          `files=${files.map((f) => `${f.name}:${f.state}`).join(',')}`,
      );
      return ok(result);
    } catch (e) {
      return errFromUnknown(e, 'DOCS_SYNC_STATUS');
    }
  });
}

// SHA-256 hex der Datei oder null bei ENOENT. Andere Fehler propagieren raus,
// damit der IPC-Handler errFromUnknown den User-Hinweis liefert (z.B. EACCES).
async function hashFileIfExists(absPath: string): Promise<string | null> {
  try {
    const buffer = await fs.readFile(absPath);
    return createHash('sha256').update(buffer).digest('hex');
  } catch (e) {
    if (isErrnoCode(e, 'ENOENT')) return null;
    throw e;
  }
}

async function readFileIfExists(absPath: string): Promise<string | null> {
  try {
    return await fs.readFile(absPath, 'utf8');
  } catch (e) {
    if (isErrnoCode(e, 'ENOENT')) return null;
    throw e;
  }
}

function isErrnoCode(e: unknown, code: string): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === code;
}
