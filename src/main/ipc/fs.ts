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
import type { FsReadResult, FsTreeNode, FsWriteResult, IpcResult, ProjectRow } from '@shared/types';
import { listTemplates, realTemplateFsDriver } from '../templates/reader';
import { scanProjectTree, realFsTreeDriver } from '../fs/treeScanner';
import type { ProjectRepository } from '../db/repos/projects';
import type { Logger } from '../logger';
import { assertFromMainWindow } from './sender-guard';

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
//
// Bereich-4-Review (B-4): Anti-Traversal nutzt jetzt fs.realpath — Symlinks
// innerhalb des Projekts, die nach außen zeigen, werden ebenfalls geblockt.

export function registerFsIpc(deps: {
  projects: ProjectRepository;
  templatesDir: string;
  log: Logger;
}): void {
  const { projects, templatesDir, log } = deps;

  ipcMain.handle(Channels.FsListTemplates, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
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

  ipcMain.handle(Channels.FsRead, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = FsReadInputSchema.parse(payload);
      const resolved = await resolveValidatedProjectPath(projects, input.projectId, input.relPath);
      if (!resolved.ok) return resolved;
      const { absolute } = resolved.data;
      try {
        const content = await fs.readFile(absolute, 'utf8');
        const result: FsReadResult = {
          content,
          relPath: input.relPath,
          absolutePath: absolute,
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
        // Bereich-4-Review (B-3): Original-Exception-Message bleibt im Log, an
        // den Renderer geht nur ein generischer Text mit Code — sonst leaken
        // Absolutpfade aus Node-FS-Fehlern ins Renderer-Result.
        log.warn(`[fs:read] readFile fehlgeschlagen path=${absolute}`, e);
        return err('Datei konnte nicht gelesen werden', 'FS_READ_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'FS_READ');
    }
  });

  ipcMain.handle(Channels.FsListTree, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
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
        // Bereich-4-Review (B-3): siehe FsRead — Pfade nur ins Log.
        log.warn(`[fs:list-tree] Scan fehlgeschlagen path=${project.path}`, e);
        return err('Projekt-Baum konnte nicht gelesen werden', 'FS_LIST_TREE_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'FS_LIST_TREE');
    }
  });

  ipcMain.handle(Channels.FsWrite, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = FsWriteInputSchema.parse(payload);
      const resolved = await resolveValidatedProjectPath(projects, input.projectId, input.relPath);
      if (!resolved.ok) return resolved;
      const { absolute } = resolved.data;
      try {
        // Eltern-Verzeichnis muss existieren — wir legen es NICHT automatisch an.
        // Editor öffnet existierende Files (Datei-Browser oder Schnellzugriff),
        // nicht ad-hoc-Pfade — fehlende Parent-Dirs sind ein User-Fehler, der
        // sich im Klartext melden soll, statt versteckt mkdir -p auszuführen.
        await fs.writeFile(absolute, input.content, 'utf8');
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
        // Bereich-4-Review (B-3): siehe FsRead — Pfade nur ins Log.
        log.warn(`[fs:write] writeFile fehlgeschlagen path=${absolute}`, e);
        return err('Datei konnte nicht geschrieben werden', 'FS_WRITE_FAILED');
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

// Bereich-4-Review (W-2): Projekt-Lookup + Anti-Traversal-Resolve in einem
// Helper, weil fs:read und fs:write den Block bisher 1:1 kopiert hatten.
//
// Liefert entweder den absoluten Datei-Pfad samt Project-Row oder ein passendes
// Result-Err (PROJECT_NOT_FOUND / FS_PATH_ESCAPED). Exportiert für Tests.
export async function resolveValidatedProjectPath(
  projects: ProjectRepository,
  projectId: string,
  relPath: string,
): Promise<IpcResult<{ absolute: string; project: ProjectRow }>> {
  const project = projects.getById(projectId);
  if (!project) {
    return err(`Projekt ${projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
  }
  const resolved = await resolveProjectRelativeReal(project.path, relPath);
  if (resolved === null) {
    return err(`Pfad „${relPath}" liegt außerhalb des Projekts`, 'FS_PATH_ESCAPED');
  }
  return ok({ absolute: resolved, project });
}

// Lexikalisches Anti-Traversal: löst projectPath + relPath auf und prüft via
// path.relative, dass das Ergebnis nicht mit `..` herausführt. null = Pfad
// würde aus dem Project-Root herausspringen (`..` oder absolute Pfade auf
// anderen Drives).
//
// Symlinks werden hier NICHT geprüft — das macht resolveProjectRelativeReal,
// das auf disk-resident realpath-Calls angewiesen ist. Diese Funktion bleibt
// synchron und dateisystem-agnostisch, damit Unit-Tests sie mit synthetischen
// Pfaden (die nicht existieren müssen) anfahren können.
//
// Exportiert für Tests; in den Handlern direkt aufrufbar.
export function resolveProjectRelative(
  projectPath: string,
  relPath: string,
): string | null {
  const root = path.resolve(projectPath);
  const candidate = path.resolve(root, relPath);
  const rel = path.relative(root, candidate);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return candidate;
}

// Bereich-4-Review (B-4): Real-Pfad-Anti-Traversal. Bisher rein lexikalisches
// path.relative — ein Symlink `<projekt>/escape → C:\\Users\\...` wäre vom
// Check unbemerkt. Hier: erst Lexikal-Filter (`..` raus), dann realpath für
// Root und Kandidat mit Fallback auf Parent-realpath bei noch-nicht-existierender
// Datei (fs:write auf neue Datei). Ergebnis muss innerhalb des realen Roots
// liegen, sonst null.
export async function resolveProjectRelativeReal(
  projectPath: string,
  relPath: string,
): Promise<string | null> {
  const lexical = resolveProjectRelative(projectPath, relPath);
  if (lexical === null) return null;
  const root = await safeRealpath(path.resolve(projectPath));
  if (root === null) return null;
  // Datei existiert vielleicht noch nicht (fs:write auf neue Datei). Dann den
  // Parent realpath-en und basename anhängen — der Parent muss existieren,
  // weil wir Eltern-Verzeichnisse bewusst nicht automatisch anlegen.
  let real = await safeRealpath(lexical);
  if (real === null) {
    const parentReal = await safeRealpath(path.dirname(lexical));
    if (parentReal === null) return null;
    real = path.join(parentReal, path.basename(lexical));
  }
  const rel = path.relative(root, real);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return real;
}

async function safeRealpath(p: string): Promise<string | null> {
  try {
    return await fs.realpath(p);
  } catch {
    return null;
  }
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

