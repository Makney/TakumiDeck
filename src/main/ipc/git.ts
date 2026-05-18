import { ipcMain } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import {
  GitStatusInputSchema,
  GitDiffInputSchema,
  GitShowInputSchema,
  GitShowStagedInputSchema,
  GitSessionDiffInputSchema,
} from '@shared/schemas';
import type {
  GitDiffResult,
  GitSessionDiffResult,
  GitShowResult,
  GitShowStagedResult,
  GitStatusResult,
  IpcResult,
  ProjectRow,
} from '@shared/types';
import type { ProjectRepository } from '../db/repos/projects';
import type { SessionRepository } from '../db/repos/sessions';
import type { GitDriver } from '../git/driver';
import type { Logger } from '../logger';
import { assertFromMainWindow } from './sender-guard';

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
//
// Bereich-4-Review (B-3): simple-git-Exceptions enthalten häufig den Repo-Pfad
// und Konfig-Hints. An den Renderer geht nur ein generischer Text mit Code;
// der Original-Error landet im Log.

export function registerGitIpc(deps: {
  projects: ProjectRepository;
  // Phase-2 Season-29: SessionRepository fuer den sessionDiff-Handler — der
  // resolved sessionId → projectId + start_commit_sha (Renderer schickt nie
  // einen freien Baseline-SHA, sondern nur die Session-ID).
  sessions: SessionRepository;
  driver: GitDriver;
  log: Logger;
}): void {
  const { projects, sessions, driver, log } = deps;

  ipcMain.handle(Channels.GitStatus, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = GitStatusInputSchema.parse(payload);
      const project = resolveGitProject(projects, input.projectId);
      if (!project.ok) return project;
      // has_git wird vom Sprint-4-Workspace-Scanner gesetzt. Bei has_git=0 ist
      // simple-git zwar funktional aufrufbar, würde aber „not a git repository"
      // werfen — für status liefern wir den expliziten Code, statt einen
      // Empty-State zu erfinden (Renderer zeigt einen Hinweis im Status-Pane).
      if (project.data.has_git === 0) {
        return err(
          `Projekt „${project.data.name}" ist kein Git-Repository`,
          'NOT_A_GIT_REPO',
        );
      }
      try {
        const status: GitStatusResult = await driver.status(project.data.path);
        return ok(status);
      } catch (e) {
        log.warn(`[git:status] simple-git-Aufruf fehlgeschlagen path=${project.data.path}`, e);
        return err('Git-Status-Aufruf fehlgeschlagen', 'GIT_STATUS_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_STATUS');
    }
  });

  ipcMain.handle(Channels.GitShow, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = GitShowInputSchema.parse(payload);
      const project = resolveGitProject(projects, input.projectId);
      if (!project.ok) return project;
      if (project.data.has_git === 0) {
        const result: GitShowResult = { content: '', hasGit: false };
        return ok(result);
      }
      try {
        const content = await driver.showFile(project.data.path, input.relPath, input.ref);
        const result: GitShowResult = { content, hasGit: true };
        return ok(result);
      } catch (e) {
        log.warn(`[git:show] simple-git-Aufruf fehlgeschlagen path=${project.data.path}`, e);
        return err('Git-Show-Aufruf fehlgeschlagen', 'GIT_SHOW_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_SHOW');
    }
  });

  ipcMain.handle(Channels.GitDiff, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = GitDiffInputSchema.parse(payload);
      const project = resolveGitProject(projects, input.projectId);
      if (!project.ok) return project;
      if (project.data.has_git === 0) {
        // Kein Git-Repo → wir liefern ein leeres Patch + hasGit=false. Renderer
        // zeigt dann den passenden Empty-State im Diff-Tab statt eines Fehlers.
        const result: GitDiffResult = { patch: '', hasGit: false };
        return ok(result);
      }
      try {
        const patch = await driver.diff(project.data.path, input.filePath);
        const result: GitDiffResult = { patch, hasGit: true };
        return ok(result);
      } catch (e) {
        log.warn(`[git:diff] simple-git-Aufruf fehlgeschlagen path=${project.data.path}`, e);
        return err('Git-Diff-Aufruf fehlgeschlagen', 'GIT_DIFF_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_DIFF');
    }
  });

  // Phase-2 Season-29 (Multi-Tab-Diff): Index-Version einer Datei via
  // `git show :<relPath>`. Same Resolve-Pfad wie git:show, aber ohne ref.
  ipcMain.handle(Channels.GitShowStaged, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = GitShowStagedInputSchema.parse(payload);
      const project = resolveGitProject(projects, input.projectId);
      if (!project.ok) return project;
      if (project.data.has_git === 0) {
        const result: GitShowStagedResult = { content: '', hasGit: false };
        return ok(result);
      }
      try {
        const content = await driver.showStagedFile(project.data.path, input.relPath);
        const result: GitShowStagedResult = { content, hasGit: true };
        return ok(result);
      } catch (e) {
        log.warn(`[git:show-staged] simple-git-Aufruf fehlgeschlagen path=${project.data.path}`, e);
        return err('Git-ShowStaged-Aufruf fehlgeschlagen', 'GIT_SHOW_STAGED_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_SHOW_STAGED');
    }
  });

  // Phase-2 Season-29 (Multi-Tab-Diff): Session-Diff. Renderer schickt nur die
  // sessionId; der Main resolved die Session (Projekt + start_commit_sha) und
  // ruft den Driver mit dem Baseline-SHA. Bei fehlender Baseline kommt
  // hasBaseline=false zurueck — der Renderer zeigt einen Empty-State.
  ipcMain.handle(Channels.GitSessionDiff, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = GitSessionDiffInputSchema.parse(payload);
      const session = sessions.findById(input.sessionId);
      if (!session) {
        return err(`Session ${input.sessionId} nicht gefunden`, 'SESSION_NOT_FOUND');
      }
      const project = resolveGitProject(projects, session.project_id);
      if (!project.ok) return project;
      if (project.data.has_git === 0 || session.start_commit_sha === null) {
        // Kein Git-Repo oder Baseline-Capture beim Spawn fehlgeschlagen →
        // Empty-State im Renderer. Branch fuellen wir trotzdem mit dem
        // Project-Namen als Fallback, damit die Head-Zeile nicht leer wirkt.
        const result: GitSessionDiffResult = {
          hasBaseline: false,
          baselineSha: null,
          branch: '',
          files: [],
        };
        return ok(result);
      }
      try {
        // Branch + Files in zwei Roundtrips — Branch fuer die Head-Zeile,
        // Files fuer die linke Spalte. Branch kommt aus der bestehenden
        // status()-Logik (current bzw. Short-SHA bei detached HEAD).
        const status = await driver.status(project.data.path);
        const files = await driver.changedFilesAgainst(
          project.data.path,
          session.start_commit_sha,
        );
        const result: GitSessionDiffResult = {
          hasBaseline: true,
          baselineSha: session.start_commit_sha,
          branch: status.branch,
          files,
        };
        return ok(result);
      } catch (e) {
        log.warn(`[git:session-diff] simple-git-Aufruf fehlgeschlagen path=${project.data.path}`, e);
        return err('Git-SessionDiff-Aufruf fehlgeschlagen', 'GIT_SESSION_DIFF_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_SESSION_DIFF');
    }
  });
}

// Bereich-4-Review (W-3): Project-Lookup für Git-Handler. Alle drei Handler
// haben denselben getById + PROJECT_NOT_FOUND-Block; das has_git-Branching
// bleibt absichtlich beim Aufrufer, weil status/show/diff den Empty-State
// unterschiedlich formen (Error vs. ok({hasGit:false}) mit content/patch).
export function resolveGitProject(
  projects: ProjectRepository,
  projectId: string,
): IpcResult<ProjectRow> {
  const project = projects.getById(projectId);
  if (!project) {
    return err(`Projekt ${projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
  }
  return ok(project);
}
