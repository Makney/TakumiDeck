import { ipcMain } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import {
  GitStatusInputSchema,
  GitDiffInputSchema,
  GitShowInputSchema,
} from '@shared/schemas';
import type { GitDiffResult, GitShowResult, GitStatusResult } from '@shared/types';
import type { ProjectRepository } from '../db/repos/projects';
import type { GitDriver } from '../git/driver';
import type { Logger } from '../logger';

// IPC-Handler für die Git-Domain (Sprint 7, Architektur 6.7).
//
// Beide Channels lösen den Project-Pfad gegen ProjectRepository auf — Renderer
// schickt nur die projectId, nie einen freien Pfad. Wenn das Projekt nicht
// existiert oder kein Git-Repo ist, kommt ein klares Result-Err mit Code zurück
// (statt einer roh durchgereichten simple-git-Exception).
//
// git:status liefert Branch + geänderte Files — Pre-Commit-Panel rendert daraus
// die Liste mit Sensitive-File-Warnung (Phase 7).
//
// git:diff liefert das rohe Unified-Diff-Patch-Format. Render-Logik liegt im
// Renderer (Phase 6 mit @codemirror/merge).

export function registerGitIpc(deps: {
  projects: ProjectRepository;
  driver: GitDriver;
  log: Logger;
}): void {
  const { projects, driver, log } = deps;

  ipcMain.handle(Channels.GitStatus, async (_event, payload: unknown) => {
    try {
      const input = GitStatusInputSchema.parse(payload);
      const project = projects.getById(input.projectId);
      if (!project) {
        return err(`Projekt ${input.projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
      }
      // has_git wird vom Sprint-4-Workspace-Scanner gesetzt. Bei has_git=0 ist
      // simple-git zwar funktional aufrufbar, würde aber „not a git repository"
      // werfen — wir kürzen das mit einem klaren Code ab.
      if (project.has_git === 0) {
        return err(
          `Projekt „${project.name}" ist kein Git-Repository`,
          'NOT_A_GIT_REPO',
        );
      }
      try {
        const status: GitStatusResult = await driver.status(project.path);
        return ok(status);
      } catch (e) {
        log.warn(`[git:status] simple-git-Aufruf fehlgeschlagen path=${project.path}`, e);
        return errFromUnknown(e, 'GIT_STATUS_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_STATUS');
    }
  });

  ipcMain.handle(Channels.GitShow, async (_event, payload: unknown) => {
    try {
      const input = GitShowInputSchema.parse(payload);
      const project = projects.getById(input.projectId);
      if (!project) {
        return err(`Projekt ${input.projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
      }
      if (project.has_git === 0) {
        const result: GitShowResult = { content: '', hasGit: false };
        return ok(result);
      }
      try {
        const content = await driver.showFile(project.path, input.relPath, input.ref);
        const result: GitShowResult = { content, hasGit: true };
        return ok(result);
      } catch (e) {
        log.warn(`[git:show] simple-git-Aufruf fehlgeschlagen path=${project.path}`, e);
        return errFromUnknown(e, 'GIT_SHOW_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_SHOW');
    }
  });

  ipcMain.handle(Channels.GitDiff, async (_event, payload: unknown) => {
    try {
      const input = GitDiffInputSchema.parse(payload);
      const project = projects.getById(input.projectId);
      if (!project) {
        return err(`Projekt ${input.projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
      }
      if (project.has_git === 0) {
        // Kein Git-Repo → wir liefern ein leeres Patch + hasGit=false. Renderer
        // zeigt dann den passenden Empty-State im Diff-Tab statt eines Fehlers.
        const result: GitDiffResult = { patch: '', hasGit: false };
        return ok(result);
      }
      try {
        const patch = await driver.diff(project.path, input.filePath);
        const result: GitDiffResult = { patch, hasGit: true };
        return ok(result);
      } catch (e) {
        log.warn(`[git:diff] simple-git-Aufruf fehlgeschlagen path=${project.path}`, e);
        return errFromUnknown(e, 'GIT_DIFF_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_DIFF');
    }
  });
}
