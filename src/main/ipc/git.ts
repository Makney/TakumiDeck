import { ipcMain } from 'electron';
import { Channels } from '@shared/ipc-channels';
import { ok, err, errFromUnknown } from '@shared/result';
import {
  GitStatusInputSchema,
  GitDiffInputSchema,
  GitShowInputSchema,
  GitShowStagedInputSchema,
  GitSessionDiffInputSchema,
  GitListBranchesInputSchema,
  GitWorktreeListInputSchema,
  GitWorktreeDiffInputSchema,
  GitWorktreeRemoveInputSchema,
  GitWorktreeStatusInputSchema,
} from '@shared/schemas';
import type {
  GitDiffResult,
  GitListBranchesResult,
  GitSessionDiffResult,
  GitShowResult,
  GitShowStagedResult,
  GitStatusResult,
  GitWorktreeDiffResult,
  GitWorktreeListResult,
  GitWorktreeRemoveResult,
  GitWorktreeStatusResult,
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

  // Season 37 (Worktree-Support): lokale Branch-Liste fuers Modal-Dropdown.
  ipcMain.handle(Channels.GitListBranches, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = GitListBranchesInputSchema.parse(payload);
      const project = resolveGitProject(projects, input.projectId);
      if (!project.ok) return project;
      if (project.data.has_git === 0) {
        const result: GitListBranchesResult = { hasGit: false, current: '', branches: [] };
        return ok(result);
      }
      try {
        const { current, branches } = await driver.listBranches(project.data.path);
        const result: GitListBranchesResult = { hasGit: true, current, branches };
        return ok(result);
      } catch (e) {
        log.warn(`[git:list-branches] fehlgeschlagen path=${project.data.path}`, e);
        return err('Branch-Liste konnte nicht geladen werden', 'GIT_LIST_BRANCHES_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_LIST_BRANCHES');
    }
  });

  // Season 37: bestehende Worktrees eines Projekts (Uebersicht im Modal).
  ipcMain.handle(Channels.GitWorktreeList, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = GitWorktreeListInputSchema.parse(payload);
      const project = resolveGitProject(projects, input.projectId);
      if (!project.ok) return project;
      if (project.data.has_git === 0) {
        const result: GitWorktreeListResult = { hasGit: false, worktrees: [] };
        return ok(result);
      }
      try {
        const worktrees = await driver.listWorktrees(project.data.path);
        const result: GitWorktreeListResult = { hasGit: true, worktrees };
        return ok(result);
      } catch (e) {
        log.warn(`[git:list-worktrees] fehlgeschlagen path=${project.data.path}`, e);
        return err('Worktree-Liste konnte nicht geladen werden', 'GIT_WORKTREE_LIST_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_WORKTREE_LIST');
    }
  });

  // Season 37: Worktree-Diff vs. Basis-Branch (main/master). Renderer schickt
  // die sessionId; der Main resolved Worktree-Pfad + Branch aus der Session-Row.
  // Die per-File-Inhalte holt der Renderer separat: Original via git:show mit
  // ref=baseRef (der Basis-Branch lebt im geteilten Objekt-Store, also liefert
  // der Haupt-Checkout den Blob), doc via fs:read-worktree aus dem Worktree-Pfad.
  ipcMain.handle(Channels.GitWorktreeDiff, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = GitWorktreeDiffInputSchema.parse(payload);
      const session = sessions.findById(input.sessionId);
      if (!session) {
        return err(`Session ${input.sessionId} nicht gefunden`, 'SESSION_NOT_FOUND');
      }
      const project = resolveGitProject(projects, session.project_id);
      if (!project.ok) return project;
      if (
        project.data.has_git === 0 ||
        session.worktree_path === null ||
        session.worktree_branch === null
      ) {
        const result: GitWorktreeDiffResult = {
          hasWorktree: false,
          branch: '',
          baseRef: '',
          files: [],
        };
        return ok(result);
      }
      try {
        const baseRef = await driver.resolveBaseBranchRef(project.data.path);
        const files = await driver.changedFilesAgainst(session.worktree_path, baseRef);
        const result: GitWorktreeDiffResult = {
          hasWorktree: true,
          branch: session.worktree_branch,
          baseRef,
          files,
        };
        return ok(result);
      } catch (e) {
        log.warn(`[git:worktree-diff] fehlgeschlagen path=${session.worktree_path}`, e);
        return err('Worktree-Diff-Aufruf fehlgeschlagen', 'GIT_WORKTREE_DIFF_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_WORKTREE_DIFF');
    }
  });

  // Season 37: Worktree-Cleanup beim Archivieren. Ohne `force` wird ein
  // dirty Worktree (uncommittete/ungepushte Aenderungen) NICHT entfernt —
  // stattdessen kommt dirty=true zurueck, und das UI fragt nach. Mit `force`
  // wird bedingungslos entfernt.
  ipcMain.handle(Channels.GitWorktreeRemove, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = GitWorktreeRemoveInputSchema.parse(payload);
      const session = sessions.findById(input.sessionId);
      if (!session) {
        return err(`Session ${input.sessionId} nicht gefunden`, 'SESSION_NOT_FOUND');
      }
      // Keine Worktree-Session → No-op-Erfolg, damit der Archive-Flow im
      // Renderer einheitlich aufrufen kann, ohne vorher zu pruefen.
      if (session.worktree_path === null) {
        const result: GitWorktreeRemoveResult = {
          removed: false,
          dirty: false,
          uncommittedCount: 0,
          ahead: 0,
        };
        return ok(result);
      }
      const project = resolveGitProject(projects, session.project_id);
      if (!project.ok) return project;
      if (project.data.has_git === 0) {
        const result: GitWorktreeRemoveResult = {
          removed: false,
          dirty: false,
          uncommittedCount: 0,
          ahead: 0,
        };
        return ok(result);
      }
      const force = input.force ?? false;
      try {
        if (!force) {
          const dirty = await driver.worktreeDirtyState(session.worktree_path);
          if (dirty.uncommittedCount > 0 || dirty.ahead > 0) {
            const result: GitWorktreeRemoveResult = {
              removed: false,
              dirty: true,
              uncommittedCount: dirty.uncommittedCount,
              ahead: dirty.ahead,
            };
            return ok(result);
          }
        }
        await driver.removeWorktree(project.data.path, session.worktree_path, force);
        const result: GitWorktreeRemoveResult = {
          removed: true,
          dirty: false,
          uncommittedCount: 0,
          ahead: 0,
        };
        return ok(result);
      } catch (e) {
        log.warn(`[git:worktree-remove] fehlgeschlagen path=${session.worktree_path}`, e);
        return err('Worktree konnte nicht entfernt werden', 'GIT_WORKTREE_REMOVE_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_WORKTREE_REMOVE');
    }
  });

  // Season 37: Working-Tree-Status DES Worktrees einer Session. Das Pre-Commit-
  // Panel ruft das fuer die aktive Session; laeuft sie in einem Worktree, zeigt
  // das Panel dessen Branch + geaenderte Dateien (statt des Haupt-Checkouts).
  // hasWorktree=false → die Session laeuft im Projekt-Root, der Renderer faellt
  // auf git:status zurueck.
  ipcMain.handle(Channels.GitWorktreeStatus, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = GitWorktreeStatusInputSchema.parse(payload);
      const session = sessions.findById(input.sessionId);
      if (!session) {
        return err(`Session ${input.sessionId} nicht gefunden`, 'SESSION_NOT_FOUND');
      }
      if (session.worktree_path === null) {
        const result: GitWorktreeStatusResult = {
          hasWorktree: false,
          hasGit: true,
          status: null,
        };
        return ok(result);
      }
      const project = resolveGitProject(projects, session.project_id);
      if (!project.ok) return project;
      if (project.data.has_git === 0) {
        const result: GitWorktreeStatusResult = {
          hasWorktree: true,
          hasGit: false,
          status: null,
        };
        return ok(result);
      }
      try {
        // status() laeuft direkt im Worktree-Pfad — derselbe Driver wie fuer den
        // Haupt-Checkout, nur mit anderem Repo-Pfad.
        const status = await driver.status(session.worktree_path);
        const result: GitWorktreeStatusResult = {
          hasWorktree: true,
          hasGit: true,
          status,
        };
        return ok(result);
      } catch (e) {
        log.warn(`[git:worktree-status] fehlgeschlagen path=${session.worktree_path}`, e);
        return err('Worktree-Status-Aufruf fehlgeschlagen', 'GIT_WORKTREE_STATUS_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_WORKTREE_STATUS');
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
