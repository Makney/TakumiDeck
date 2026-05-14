import { ipcMain, dialog, type BrowserWindow } from 'electron';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import { ProjectReadCfgInputSchema, ProjectRemoveInputSchema } from '@shared/schemas';
import type { ProjectRow } from '@shared/types';
import type { ProjectRepository } from '../db/repos/projects';
import type { SettingsStore } from '../settings/store';
import type { Logger } from '../logger';
import { scanWorkspace, realFsDriver } from '../workspace/scanner';
import { parseClaudeMd } from '../workspace/claudeMdParser';
import { scannedProjectName } from '../db/repos/projects';
import { assertFromMainWindow } from './sender-guard';

// IPC-Handler für die Project-Domain (Sprint 4).
//
// project:list           — flache Liste aller Projects aus der DB. Read-only.
// project:add            — öffnet dialog.showOpenDialog im Main, validiert CLAUDE.md,
//                          inserted in die DB. Args: keine.
// project:scan-workspace — Re-Scan des konfigurierten workspace_path; neue Projects
//                          werden in die DB übernommen, bestehende bleiben unangetastet.
// project:read-claude-md — liest die CLAUDE.md eines bekannten Project-Eintrags und
//                          gibt das geparste Frontmatter+Body zurück.
//
// Konvention: jeder Channel mit Eingangs-Payload wird zod-validiert. project:list /
// project:add / project:scan-workspace nehmen keine Payload — die Channel-Definition ist
// die Validierung.

export function registerProjectIpc(deps: {
  projects: ProjectRepository;
  settings: SettingsStore;
  log: Logger;
  getMainWindow: () => BrowserWindow | null;
}): void {
  const { projects, settings, log, getMainWindow } = deps;

  ipcMain.handle(Channels.ProjectList, (event) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      return ok(projects.listAll());
    } catch (e) {
      return errFromUnknown(e, 'PROJECT_LIST');
    }
  });

  ipcMain.handle(Channels.ProjectScan, async (event) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const workspacePath = settings.read().workspace_path;
      const scanned = await scanWorkspace(workspacePath, realFsDriver);
      const inserted = syncScannedToDb(projects, scanned, log);
      log.info(
        `[project:scan-workspace] gescannt=${scanned.length} neu_eingefügt=${inserted}`,
      );
      return ok(projects.listAll());
    } catch (e) {
      return errFromUnknown(e, 'PROJECT_SCAN');
    }
  });

  ipcMain.handle(Channels.ProjectAdd, async (event) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const window = getMainWindow();
      // showOpenDialog kann ohne parent aufgerufen werden, dann ist es nicht modal —
      // wir bevorzugen modal, wenn das Fenster da ist (häufiger Fall).
      const dialogResult = window
        ? await dialog.showOpenDialog(window, {
            title: 'Projekt-Ordner auswählen',
            properties: ['openDirectory'],
          })
        : await dialog.showOpenDialog({
            title: 'Projekt-Ordner auswählen',
            properties: ['openDirectory'],
          });

      if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
        return ok<ProjectRow | null>(null);
      }

      const chosenPath = dialogResult.filePaths[0];
      if (!chosenPath) {
        return ok<ProjectRow | null>(null);
      }
      // Pflicht-Marker: CLAUDE.md im gewählten Ordner. Ohne sie wäre der Eintrag
      // ein leerer Project-Stub, den die App nicht sinnvoll konfigurieren kann.
      const claudeMdPath = path.join(chosenPath, 'CLAUDE.md');
      const exists = await fileExists(claudeMdPath);
      if (!exists) {
        return err<ProjectRow | null>(
          `Im gewählten Ordner liegt keine CLAUDE.md. Pfad: ${chosenPath}`,
          'PROJECT_NO_CLAUDE_MD',
        );
      }

      const hasGit = await directoryExists(path.join(chosenPath, '.git'));
      const insertResult = projects.insert({
        name: path.basename(chosenPath) || chosenPath,
        path: chosenPath,
        has_git: hasGit,
        added_manually: true,
      });
      if (!insertResult.ok) return insertResult;

      log.info(`[project:add] hinzugefügt path=${chosenPath} hasGit=${hasGit}`);
      return ok<ProjectRow | null>(insertResult.data);
    } catch (e) {
      return errFromUnknown(e, 'PROJECT_ADD');
    }
  });

  ipcMain.handle(Channels.ProjectRemove, (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = ProjectRemoveInputSchema.parse(payload);
      const removeResult = projects.removeProject(input.projectId);
      if (!removeResult.ok) return removeResult;
      log.info(
        `[project:remove] entfernt id=${input.projectId} sessions_remapped=${removeResult.data.sessionsRemapped}`,
      );
      // Wie scanWorkspace: aktuelle Liste zurückliefern, damit der Renderer-Store
      // ohne separaten list-Call konsistent bleibt.
      return ok(projects.listAll());
    } catch (e) {
      return errFromUnknown(e, 'PROJECT_REMOVE');
    }
  });

  ipcMain.handle(Channels.ProjectReadCfg, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = ProjectReadCfgInputSchema.parse(payload);
      const project = projects.getById(input.projectId);
      if (!project) {
        return err(`Projekt ${input.projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
      }
      const claudeMdPath = path.join(project.path, 'CLAUDE.md');
      let raw: string;
      try {
        raw = await fs.readFile(claudeMdPath, 'utf8');
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code === 'ENOENT') {
          return err(
            `CLAUDE.md fehlt im Projekt-Ordner: ${project.name}`,
            'CLAUDE_MD_NOT_FOUND',
          );
        }
        // Bereich-4-Review (B-3): Originalfehler nur ins Log; an den Renderer
        // geht ein generischer Text mit Code, damit fs-Internals (Pfade) nicht
        // ungewollt in die Renderer-Schicht leaken.
        log.warn(`[project:read-claude-md] readFile fehlgeschlagen path=${claudeMdPath}`, e);
        return err('CLAUDE.md konnte nicht gelesen werden', 'CLAUDE_MD_READ');
      }
      return parseClaudeMd(raw);
    } catch (e) {
      return errFromUnknown(e, 'PROJECT_READ_CLAUDE_MD');
    }
  });
}

// Helper: gescannte Projekte in die DB übernehmen, falls noch nicht vorhanden.
// Existierende Pfade bleiben unverändert (kein Update-Pass) — Sprint 4 will nur den
// Initial-Erkennungs-Drift abdecken; spätere CLAUDE.md-Änderungen kommen über
// project:read-claude-md, nicht über den Scanner.
//
// Rückgabe: Anzahl der wirklich neu eingefügten Rows.
export function syncScannedToDb(
  projects: ProjectRepository,
  scanned: import('@shared/types').ScannedProject[],
  log: Logger,
): number {
  let inserted = 0;
  for (const sp of scanned) {
    if (projects.getByPath(sp.path)) continue;
    const result = projects.insert({
      name: scannedProjectName(sp),
      path: sp.path,
      has_git: sp.has_git,
      added_manually: false,
    });
    if (result.ok) {
      inserted += 1;
    } else {
      log.warn(`[project:scan] Insert für ${sp.path} fehlgeschlagen: ${result.error}`);
    }
  }
  return inserted;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
