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
  GitWorktreeMergePreviewInputSchema,
  GitWorktreeMergeInputSchema,
  GitBranchOverviewInputSchema,
  GitCheckoutInputSchema,
  GitFetchInputSchema,
  GitPullInputSchema,
} from '@shared/schemas';
import type {
  GitBranchOverviewResult,
  GitCheckoutResult,
  GitDiffResult,
  GitFetchResult,
  GitListBranchesResult,
  GitPullResult,
  GitSessionDiffResult,
  GitShowResult,
  GitShowStagedResult,
  GitStatusResult,
  GitWorktreeDiffResult,
  GitWorktreeListResult,
  GitWorktreeRemoveResult,
  GitWorktreeStatusResult,
  GitWorktreeMergePreviewResult,
  GitWorktreeMergeResult,
  IpcResult,
  ProjectRow,
} from '@shared/types';
import { buildBranchOverview } from '../git/branchOps';
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

  // Phase 3 (In-App-Merge): Vorab-Stand fuers Merge-Modal. Reine Lese-Operation
  // — resolved Worktree-Pfad + Branch aus der Session, den Basis-Ref aus dem
  // Repo, und fragt den Driver nach Haupt-Checkout-Branch/Sauberkeit + ahead/behind.
  ipcMain.handle(Channels.GitWorktreeMergePreview, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = GitWorktreeMergePreviewInputSchema.parse(payload);
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
        const result: GitWorktreeMergePreviewResult = {
          hasWorktree: false,
          branch: '',
          baseRef: '',
          mainCurrentBranch: '',
          mainClean: false,
          worktreeUncommittedCount: 0,
          ahead: 0,
          behind: 0,
        };
        return ok(result);
      }
      try {
        const baseRef = await driver.resolveBaseBranchRef(project.data.path);
        const [preview, dirty] = await Promise.all([
          driver.mergePreview(project.data.path, session.worktree_branch, baseRef),
          driver.worktreeDirtyState(session.worktree_path),
        ]);
        const result: GitWorktreeMergePreviewResult = {
          hasWorktree: true,
          branch: session.worktree_branch,
          baseRef,
          mainCurrentBranch: preview.mainCurrentBranch,
          mainClean: preview.mainClean,
          worktreeUncommittedCount: dirty.uncommittedCount,
          ahead: preview.ahead,
          behind: preview.behind,
        };
        return ok(result);
      } catch (e) {
        log.warn(`[git:worktree-merge-preview] fehlgeschlagen path=${session.worktree_path}`, e);
        return err('Merge-Vorschau fehlgeschlagen', 'GIT_WORKTREE_MERGE_PREVIEW_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_WORKTREE_MERGE_PREVIEW');
    }
  });

  // Phase 3: Worktree-Branch nach main/master mergen. Der Merge laeuft im
  // Haupt-Checkout (project.path), der dafuer auf dem Basis-Ref stehen UND
  // sauber sein muss — beide Vorbedingungen prueft der Server hier erneut
  // (Renderer-Anzeige ist nur Komfort). Bei Erfolg optional Cleanup:
  // Worktree zuerst entfernen, dann Branch loeschen (umgekehrt geht nicht —
  // ein im Worktree ausgecheckter Branch laesst sich nicht loeschen).
  ipcMain.handle(Channels.GitWorktreeMerge, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = GitWorktreeMergeInputSchema.parse(payload);
      const session = sessions.findById(input.sessionId);
      if (!session) {
        return err(`Session ${input.sessionId} nicht gefunden`, 'SESSION_NOT_FOUND');
      }
      if (session.worktree_path === null || session.worktree_branch === null) {
        return err('Diese Session hat keinen Worktree zum Mergen', 'NO_WORKTREE');
      }
      const project = resolveGitProject(projects, session.project_id);
      if (!project.ok) return project;
      if (project.data.has_git === 0) {
        return err(
          `Projekt „${project.data.name}" ist kein Git-Repository`,
          'NOT_A_GIT_REPO',
        );
      }
      const branch = session.worktree_branch;
      const worktreePath = session.worktree_path;
      try {
        const baseRef = await driver.resolveBaseBranchRef(project.data.path);
        const preview = await driver.mergePreview(project.data.path, branch, baseRef);
        // Vorbedingung 1: Haupt-Checkout muss auf dem Basis-Ref stehen, sonst
        // wuerde der Merge in den falschen Branch laufen.
        if (preview.mainCurrentBranch !== baseRef) {
          return err(
            `Haupt-Checkout steht auf „${preview.mainCurrentBranch}", nicht auf „${baseRef}"`,
            'MERGE_BASE_NOT_CHECKED_OUT',
          );
        }
        // Vorbedingung 2: Haupt-Checkout muss sauber sein.
        if (!preview.mainClean) {
          return err(
            'Haupt-Checkout hat uncommittete Aenderungen — bitte erst committen oder verwerfen',
            'MERGE_MAIN_DIRTY',
          );
        }
        const outcome = await driver.mergeBranch(project.data.path, branch, {
          strategy: input.strategy,
          commitMessage: input.commitMessage,
        });
        if (outcome.status === 'conflict') {
          const result: GitWorktreeMergeResult = {
            merged: false,
            conflicted: true,
            ffFailed: false,
            conflictFiles: outcome.conflictFiles,
            mergeCommitSha: null,
            worktreeRemoved: false,
            branchDeleted: false,
          };
          return ok(result);
        }
        if (outcome.status === 'ff-failed') {
          const result: GitWorktreeMergeResult = {
            merged: false,
            conflicted: false,
            ffFailed: true,
            conflictFiles: [],
            mergeCommitSha: null,
            worktreeRemoved: false,
            branchDeleted: false,
          };
          return ok(result);
        }
        // Erfolg → optionaler Cleanup. Worktree zuerst, dann Branch.
        let worktreeRemoved = false;
        let branchDeleted = false;
        if (input.removeWorktree) {
          try {
            // force=true: nach erfolgreichem Merge ist die committete History in
            // main; verbleibende uncommittete Worktree-Aenderungen waren nie Teil
            // des Branches und werden bewusst verworfen (Modal warnt vorher).
            await driver.removeWorktree(project.data.path, worktreePath, true);
            worktreeRemoved = true;
          } catch (e) {
            log.warn(`[git:worktree-merge] Worktree-Cleanup fehlgeschlagen path=${worktreePath}`, e);
          }
        }
        if (input.deleteBranch) {
          try {
            // squash markiert den Branch nicht als „merged" → force (`-D`) noetig.
            await driver.deleteBranch(project.data.path, branch, input.strategy === 'squash');
            branchDeleted = true;
          } catch (e) {
            log.warn(`[git:worktree-merge] Branch-Loeschen fehlgeschlagen branch=${branch}`, e);
          }
        }
        const result: GitWorktreeMergeResult = {
          merged: true,
          conflicted: false,
          ffFailed: false,
          conflictFiles: [],
          mergeCommitSha: outcome.mergeCommitSha,
          worktreeRemoved,
          branchDeleted,
        };
        return ok(result);
      } catch (e) {
        log.warn(`[git:worktree-merge] fehlgeschlagen branch=${branch}`, e);
        return err('Merge fehlgeschlagen', 'GIT_WORKTREE_MERGE_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_WORKTREE_MERGE');
    }
  });

  // ============================================================ Season 38
  // Pull/Fetch/Branch-Switch — alle projectId-basiert, laufen im Haupt-Checkout.

  // Branch-Uebersicht mit Tracking-Info. Reine Lese-Operation: status (current +
  // sauber), for-each-ref (per-Branch ahead/behind), Worktree-Liste (belegte
  // Branches) und Remote-Status in einem Pass; buildBranchOverview aggregiert.
  ipcMain.handle(Channels.GitBranchOverview, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = GitBranchOverviewInputSchema.parse(payload);
      const project = resolveGitProject(projects, input.projectId);
      if (!project.ok) return project;
      if (project.data.has_git === 0) {
        const result: GitBranchOverviewResult = {
          hasGit: false,
          current: '',
          detached: false,
          mainClean: false,
          hasRemote: false,
          branches: [],
        };
        return ok(result);
      }
      try {
        const [status, track, worktrees, hasRemote] = await Promise.all([
          driver.status(project.data.path),
          driver.branchTrackInfos(project.data.path),
          driver.listWorktrees(project.data.path),
          driver.hasRemote(project.data.path),
        ]);
        const result = buildBranchOverview({
          current: status.branch,
          mainClean: status.files.length === 0,
          hasRemote,
          track,
          worktrees,
        });
        return ok(result);
      } catch (e) {
        log.warn(`[git:branch-overview] fehlgeschlagen path=${project.data.path}`, e);
        return err('Branch-Uebersicht fehlgeschlagen', 'GIT_BRANCH_OVERVIEW_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_BRANCH_OVERVIEW');
    }
  });

  // Branch-Switch im Haupt-Checkout. Vorbedingungen (Server ist Autoritaet):
  //   1. Ziel-Branch darf nicht in einem Linked-Worktree belegt sein.
  //   2. Bei dirty Working-Tree blockt der Switch (status='dirty'), ausser der
  //      Renderer schickt autoStash=true → dann wird vorher gestasht.
  ipcMain.handle(Channels.GitCheckout, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = GitCheckoutInputSchema.parse(payload);
      const project = resolveGitProject(projects, input.projectId);
      if (!project.ok) return project;
      if (project.data.has_git === 0) {
        return err(`Projekt „${project.data.name}" ist kein Git-Repository`, 'NOT_A_GIT_REPO');
      }
      try {
        const worktrees = await driver.listWorktrees(project.data.path);
        const elsewhere = worktrees.find((w) => !w.isMain && w.branch === input.branch);
        if (elsewhere) {
          const result: GitCheckoutResult = {
            status: 'checked-out-elsewhere',
            branch: input.branch,
            stashed: false,
            checkedOutPath: elsewhere.path,
          };
          return ok(result);
        }
        const status = await driver.status(project.data.path);
        const dirty = status.files.length > 0;
        if (dirty && !input.autoStash) {
          const result: GitCheckoutResult = {
            status: 'dirty',
            branch: input.branch,
            stashed: false,
            checkedOutPath: null,
          };
          return ok(result);
        }
        let stashed = false;
        if (dirty && input.autoStash) {
          stashed = await driver.stashPush(
            project.data.path,
            `TakumiDeck: vor Wechsel auf ${input.branch}`,
          );
        }
        await driver.checkout(project.data.path, input.branch);
        const result: GitCheckoutResult = {
          status: 'switched',
          branch: input.branch,
          stashed,
          checkedOutPath: null,
        };
        return ok(result);
      } catch (e) {
        log.warn(`[git:checkout] fehlgeschlagen branch=${input.branch}`, e);
        return err('Branch-Wechsel fehlgeschlagen', 'GIT_CHECKOUT_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_CHECKOUT');
    }
  });

  // Fetch: aktualisiert Remote-Tracking-Refs (ahead/behind) ohne Working-Tree-
  // Aenderung. Ohne Remote ein no-op-Result statt Fehler.
  ipcMain.handle(Channels.GitFetch, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    try {
      const input = GitFetchInputSchema.parse(payload);
      const project = resolveGitProject(projects, input.projectId);
      if (!project.ok) return project;
      if (project.data.has_git === 0) {
        return err(`Projekt „${project.data.name}" ist kein Git-Repository`, 'NOT_A_GIT_REPO');
      }
      try {
        const hasRemote = await driver.hasRemote(project.data.path);
        if (!hasRemote) {
          const result: GitFetchResult = { status: 'no-remote' };
          return ok(result);
        }
        await driver.fetch(project.data.path);
        const result: GitFetchResult = { status: 'fetched' };
        return ok(result);
      } catch (e) {
        log.warn(`[git:fetch] fehlgeschlagen path=${project.data.path}`, e);
        return err('Fetch fehlgeschlagen', 'GIT_FETCH_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_FETCH');
    }
  });

  // Pull fuer den aktuellen Branch. Vorbedingungen vorab geprueft (klarere
  // Meldung als ein roher Git-Fehler): Remote vorhanden, Working-Tree sauber,
  // aktueller Branch hat einen Upstream. Der eigentliche Pull rollt bei Konflikt
  // selbst zurueck (Driver).
  ipcMain.handle(Channels.GitPull, async (event, payload: unknown) => {
    const guard = assertFromMainWindow(event);
    if (!guard.ok) return guard;
    const zeros = { conflictFiles: [] as string[], filesChanged: 0, insertions: 0, deletions: 0 };
    try {
      const input = GitPullInputSchema.parse(payload);
      const project = resolveGitProject(projects, input.projectId);
      if (!project.ok) return project;
      if (project.data.has_git === 0) {
        return err(`Projekt „${project.data.name}" ist kein Git-Repository`, 'NOT_A_GIT_REPO');
      }
      try {
        const hasRemote = await driver.hasRemote(project.data.path);
        if (!hasRemote) {
          return ok<GitPullResult>({ status: 'no-remote', ...zeros });
        }
        const status = await driver.status(project.data.path);
        if (status.files.length > 0) {
          return ok<GitPullResult>({ status: 'dirty', ...zeros });
        }
        const track = await driver.branchTrackInfos(project.data.path);
        const current = track.find((t) => t.name === status.branch);
        if (!current || current.upstream === null) {
          return ok<GitPullResult>({ status: 'no-upstream', ...zeros });
        }
        const outcome = await driver.pull(project.data.path);
        return ok<GitPullResult>({
          status: outcome.status,
          conflictFiles: outcome.conflictFiles,
          filesChanged: outcome.filesChanged,
          insertions: outcome.insertions,
          deletions: outcome.deletions,
        });
      } catch (e) {
        log.warn(`[git:pull] fehlgeschlagen path=${project.data.path}`, e);
        return err('Pull fehlgeschlagen', 'GIT_PULL_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_PULL');
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
