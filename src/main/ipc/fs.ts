import { ipcMain } from 'electron';
import path from 'node:path';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import { FsListTemplatesInputSchema } from '@shared/schemas';
import { DEFAULT_PROJECT_ID } from '@shared/constants';
import { listTemplates, realTemplateFsDriver } from '../templates/reader';
import type { ProjectRepository } from '../db/repos/projects';
import type { Logger } from '../logger';

// IPC-Handler für die FS-Domain (Sprint 6 + Sprint 7).
//
// fs:list-templates (Sprint 6) — on-demand Template-Discovery für das Modal.
//   Globaler Pfad: <userData>/templates/*.md
//   Per-Projekt:   <projektPfad>/docs/templates/*.md  +  <projektPfad>/docs/*_TEMPLATE.md
//   Beide Quellen kommen mit source-Tag separat zurück (Q2 Variante B).
//
// fs:read / fs:write folgen mit Sprint 7 (Markdown-Editor).

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
}

// Helper: liefert den globalen Templates-Pfad (configurePaths legt ihn beim Start an).
export function templatesDirFromUserData(userDataDir: string): string {
  return path.join(userDataDir, 'templates');
}
