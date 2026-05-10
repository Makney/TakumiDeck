import { ipcMain } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import {
  FsListTemplatesInputSchema,
  FsListTreeInputSchema,
  FsReadInputSchema,
  FsWriteInputSchema,
} from '@shared/schemas';
import { DEFAULT_PROJECT_ID } from '@shared/constants';
import type { FsReadResult, FsTreeNode, FsWriteResult } from '@shared/types';
import { listTemplates, realTemplateFsDriver } from '../templates/reader';
import { scanProjectTree, realFsTreeDriver } from '../fs/treeScanner';
import type { ProjectRepository } from '../db/repos/projects';
import type { Logger } from '../logger';

// IPC-Handler für die FS-Domain (Sprint 6 + Sprint 7).
//
// fs:list-templates (Sprint 6) — on-demand Template-Discovery für das Modal.
//   Globaler Pfad: <userData>/templates/*.md
//   Per-Projekt:   <projektPfad>/docs/templates/*.md  +  <projektPfad>/docs/*_TEMPLATE.md
//   Beide Quellen kommen mit source-Tag separat zurück (Q2 Variante B).
//
// fs:read / fs:write (Sprint 7, Q1 Variante A: manueller Save) — Markdown-Editor.
//   Pfad-Auflösung: projectId → projects.getById → path.resolve(projectPath, relPath).
//   Anti-Traversal: das Ergebnis muss innerhalb des Project-Roots liegen, sonst
//   FS_PATH_ESCAPED. Damit kann der Renderer keinen `../../../etc/passwd`-Pfad
//   reinschicken, selbst wenn die zod-Schema-Validation ihn passieren ließe.

export function registerFsIpc(deps: {
  projects: ProjectRepository;
  templatesDir: string;
  log: Logger;
}): void {
  const { projects, templatesDir, log } = deps;

  ipcMain.handle(Channels.FsListTemplates, async (_event, payload: unknown) => {
    try {
      const input = FsListTemplatesInputSchema.parse(payload);
      // Default-Bucket hat keinen eigenen Projekt-Pfad mit docs/ — nur globale
      // Templates liefern (Q8 Variante A: Sessions sichtbar, aber Templates leer
      // bzw. nur global).
      let projectPath: string | null = null;
      if (input.projectId !== DEFAULT_PROJECT_ID) {
        const project = projects.getById(input.projectId);
        if (!project) {
          return err(`Projekt ${input.projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
        }
        projectPath = project.path;
      }
      const templates = await listTemplates(
        { globalDir: templatesDir, projectPath },
        realTemplateFsDriver,
      );
      log.info(
        `[fs:list-templates] projectId=${input.projectId} gefunden=${templates.length}`,
      );
      return ok(templates);
    } catch (e) {
      return errFromUnknown(e, 'FS_LIST_TEMPLATES');
    }
  });

  ipcMain.handle(Channels.FsRead, async (_event, payload: unknown) => {
    try {
      const input = FsReadInputSchema.parse(payload);
      const project = projects.getById(input.projectId);
      if (!project) {
        return err(`Projekt ${input.projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
      }
      const resolved = resolveProjectRelative(project.path, input.relPath);
      if (resolved === null) {
        return err(
          `Pfad „${input.relPath}" liegt außerhalb des Projekts`,
          'FS_PATH_ESCAPED',
        );
      }
      try {
        const content = await fs.readFile(resolved, 'utf8');
        const result: FsReadResult = {
          content,
          relPath: input.relPath,
          absolutePath: resolved,
        };
        return ok(result);
      } catch (e) {
        if (isFsNotFound(e)) {
          return err(`Datei „${input.relPath}" existiert nicht`, 'FS_NOT_FOUND');
        }
        if (isFsPermissionDenied(e)) {
          return err(
            `Keine Lese-Berechtigung für „${input.relPath}". ` +
              'Antimalware-Scanner oder Cloud-Sync (OneDrive/Dropbox) könnte die Datei locken.',
            'FS_PERMISSION',
          );
        }
        log.warn(`[fs:read] readFile fehlgeschlagen path=${resolved}`, e);
        return errFromUnknown(e, 'FS_READ_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'FS_READ');
    }
  });

  ipcMain.handle(Channels.FsListTree, async (_event, payload: unknown) => {
    try {
      const input = FsListTreeInputSchema.parse(payload);
      // Default-Bucket hat keinen real existierenden Pfad — leeres Tree-Array
      // ist der saubere Empty-State (Renderer rendert „kein Browser verfügbar").
      if (input.projectId === DEFAULT_PROJECT_ID) {
        return ok([] as FsTreeNode[]);
      }
      const project = projects.getById(input.projectId);
      if (!project) {
        return err(`Projekt ${input.projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
      }
      try {
        const tree = await scanProjectTree(
          { rootPath: project.path, maxDepth: input.maxDepth },
          realFsTreeDriver,
        );
        return ok(tree);
      } catch (e) {
        log.warn(`[fs:list-tree] Scan fehlgeschlagen path=${project.path}`, e);
        return errFromUnknown(e, 'FS_LIST_TREE_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'FS_LIST_TREE');
    }
  });

  ipcMain.handle(Channels.FsWrite, async (_event, payload: unknown) => {
    try {
      const input = FsWriteInputSchema.parse(payload);
      const project = projects.getById(input.projectId);
      if (!project) {
        return err(`Projekt ${input.projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
      }
      const resolved = resolveProjectRelative(project.path, input.relPath);
      if (resolved === null) {
        return err(
          `Pfad „${input.relPath}" liegt außerhalb des Projekts`,
          'FS_PATH_ESCAPED',
        );
      }
      try {
        // Eltern-Verzeichnis muss existieren — wir legen es NICHT automatisch an.
        // Editor öffnet existierende Files (Datei-Browser oder Schnellzugriff),
        // nicht ad-hoc-Pfade — fehlende Parent-Dirs sind ein User-Fehler, der
        // sich im Klartext melden soll, statt versteckt mkdir -p auszuführen.
        await fs.writeFile(resolved, input.content, 'utf8');
        const bytesWritten = Buffer.byteLength(input.content, 'utf8');
        const result: FsWriteResult = { bytesWritten };
        return ok(result);
      } catch (e) {
        if (isFsNotFound(e)) {
          return err(
            `Verzeichnis von „${input.relPath}" existiert nicht`,
            'FS_NOT_FOUND',
          );
        }
        if (isFsPermissionDenied(e)) {
          return err(
            `Keine Schreib-Berechtigung für „${input.relPath}". ` +
              'Datei könnte im Read-Only-Modus sein, von einem anderen Programm gehalten ' +
              '(VS Code, Antimalware-Scan), oder das Volume ist read-only.',
            'FS_PERMISSION',
          );
        }
        log.warn(`[fs:write] writeFile fehlgeschlagen path=${resolved}`, e);
        return errFromUnknown(e, 'FS_WRITE_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'FS_WRITE');
    }
  });
}

// Helper: liefert den globalen Templates-Pfad (configurePaths legt ihn beim Start an).
export function templatesDirFromUserData(userDataDir: string): string {
  return path.join(userDataDir, 'templates');
}

// Anti-Traversal: löst projectPath + relPath auf und prüft, dass das Ergebnis
// innerhalb von projectPath bleibt. null = Pfad würde aus dem Project-Root
// herausführen (z.B. via `..\..\windows\system32`).
//
// Exportiert für Tests; in den Handlern direkt aufrufbar.
export function resolveProjectRelative(
  projectPath: string,
  relPath: string,
): string | null {
  const root = path.resolve(projectPath);
  const candidate = path.resolve(root, relPath);
  // Plattform-aware: path.relative liefert auf Windows den Backslash-Pfad,
  // der mit '..' beginnt, wenn candidate außerhalb von root liegt.
  const rel = path.relative(root, candidate);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return candidate;
}

function isFsNotFound(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const code = (e as { code?: unknown }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

// Sprint 8 — Permission-denied auf allen drei OS-Flavours abdecken: EACCES (Linux/
// macOS), EPERM (oft Windows), EBUSY (Datei ist von anderem Prozess gehalten —
// nicht direkt Permission, aber gleiche User-Action: nochmal probieren).
function isFsPermissionDenied(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const code = (e as { code?: unknown }).code;
  return code === 'EACCES' || code === 'EPERM' || code === 'EBUSY';
}
