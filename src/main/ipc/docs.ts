import { ipcMain } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import {
  DocsSyncStatusInputSchema,
  DocsOnDemandStatusInputSchema,
} from '@shared/schemas';
import {
  DOCS_SYNC_FILES,
  computeFileSyncStatus,
  deriveOnDemandDescriptor,
  stripFrontmatter,
  type DocsSyncFileStatus,
  type DocsSyncStatusResult,
} from '@shared/docs-sync';
import type {
  DocsOnDemandFileStatus,
  DocsOnDemandStatusResult,
} from '@shared/types';
import type { ProjectRepository } from '../db/repos/projects';
import type { Logger } from '../logger';
import { parseClaudeMd } from '../workspace/claudeMdParser';
import { assertFromMainWindow } from './sender-guard';

// Phase-2 Season-21 — Docs-Sync-Status-IPC.
//
// Liest die vier Doku-Originale + ihre erwarteten Summary-Files projekt-
// relativ, bildet den SHA-256 der Originale und delegiert die Status-
// Entscheidung an `computeFileSyncStatus` (shared/docs-sync.ts). Reine
// Glue-Code: keine Pure-Logik in dieser Datei.
//
// Phase-2 Season-22 — Zweiter Channel `docs:on-demand-status` liest die
// On-Demand-Files-Liste aus dem CLAUDE.md-Frontmatter, sucht jeweils eine
// passende Summary unter `docs/SUMMARIES/<basename>` und liefert pro Datei
// den Status plus (wenn vorhanden) den Body ohne Frontmatter — der
// Renderer baut daraus die Kontext-Praeambel.

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

  ipcMain.handle(Channels.DocsOnDemandStatus, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = DocsOnDemandStatusInputSchema.parse(payload);
      const project = projects.getById(input.projectId);
      if (!project) {
        return err(`Projekt ${input.projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
      }
      // CLAUDE.md lesen + parsen. Frontmatter null → keine On-Demand-Files,
      // leeres Result. Read-Fehler (z.B. EACCES) propagiert über errFromUnknown.
      const claudeMdPath = path.join(project.path, 'CLAUDE.md');
      let claudeMdRaw: string | null = null;
      try {
        claudeMdRaw = await fs.readFile(claudeMdPath, 'utf8');
      } catch (e) {
        if (!isErrnoCode(e, 'ENOENT')) throw e;
      }
      const onDemandPaths: string[] = [];
      if (claudeMdRaw !== null) {
        const parsed = parseClaudeMd(claudeMdRaw);
        if (parsed.ok && parsed.data.frontmatter) {
          const fm = parsed.data.frontmatter.workbench.on_demand_files ?? [];
          for (const item of fm) {
            const rel = typeof item === 'string' ? item : item.path;
            if (rel) onDemandPaths.push(rel);
          }
        }
      }
      // Dedup: gleiche Pfade aus dem Frontmatter nur einmal verarbeiten
      // (User-Editier-Versehen, lockerer Schema-Vertrag).
      const seen = new Set<string>();
      const files: DocsOnDemandFileStatus[] = [];
      for (const relPath of onDemandPaths) {
        const descriptor = deriveOnDemandDescriptor(relPath);
        if (!descriptor) continue;
        if (seen.has(descriptor.sourcePath)) continue;
        seen.add(descriptor.sourcePath);
        const sourceAbs = path.join(project.path, descriptor.sourcePath);
        const summaryAbs = path.join(project.path, descriptor.summaryPath);
        const [sourceHash, summaryRaw] = await Promise.all([
          hashFileIfExists(sourceAbs),
          readFileIfExists(summaryAbs),
        ]);
        const status = computeFileSyncStatus({
          descriptor,
          sourceHash,
          summaryRaw,
        });
        files.push({
          ...status,
          // Body nur ableiten, wenn die Summary-Datei gelesen werden konnte —
          // bei missing-summary/missing-source ist `summaryRaw` null.
          summaryBody: summaryRaw === null ? null : stripFrontmatter(summaryRaw),
        });
      }
      const result: DocsOnDemandStatusResult = {
        files,
        generatedAt: Date.now(),
      };
      log.info(
        `[docs:on-demand-status] projectId=${input.projectId} ` +
          `files=${files.map((f) => `${f.name}:${f.state}`).join(',')}`,
      );
      return ok(result);
    } catch (e) {
      return errFromUnknown(e, 'DOCS_ON_DEMAND_STATUS');
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
