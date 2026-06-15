import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, err, errFromUnknown } from '../../src/shared/result';
import {
  PtyCreateInputSchema,
  GitWorktreeDiffInputSchema,
  GitWorktreeRemoveInputSchema,
  GitWorktreeStatusInputSchema,
  GitWorktreeMergePreviewInputSchema,
  GitWorktreeMergeInputSchema,
} from '../../src/shared/schemas';
import { parseWorktreeListPorcelain } from '../../src/main/git/driver';
import type { GitDriver } from '../../src/main/git/driver';
import type {
  GitFileChange,
  GitStatusResult,
  GitWorktreeDiffResult,
  GitWorktreeRemoveResult,
  GitWorktreeStatusResult,
  GitWorktreeMergePreviewResult,
  GitWorktreeMergeResult,
  ProjectRow,
  SessionRow,
} from '../../src/shared/types';

// Season 37 (Worktree-Support): Tests fuer
//  1. den Porcelain-Parser (Pure-Logik)
//  2. die zwei sicherheitsrelevanten IPC-Handler (worktree-diff Gating,
//     worktree-remove Dirty-Schutz) — inline repliziert wie git-ipc.test.ts
//  3. die Schema-Erweiterung von pty:create (worktree, Terminal-Ausschluss)

// ---------------------------------------------------------------- Parser

describe('parseWorktreeListPorcelain', () => {
  it('parst Haupt-Checkout + Linked-Worktrees', () => {
    const raw = [
      'worktree /repo/main',
      'HEAD aaa111',
      'branch refs/heads/main',
      '',
      'worktree /repo-worktrees/feature-foo',
      'HEAD bbb222',
      'branch refs/heads/feature/foo',
      '',
    ].join('\n');
    const result = parseWorktreeListPorcelain(raw);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ path: '/repo/main', branch: 'main', isMain: true });
    expect(result[1]).toEqual({
      path: '/repo-worktrees/feature-foo',
      branch: 'feature/foo',
      isMain: false,
    });
  });

  it('markiert detached Worktrees mit branch=null', () => {
    const raw = ['worktree /repo/main', 'HEAD aaa111', 'detached', ''].join('\n');
    const result = parseWorktreeListPorcelain(raw);
    expect(result).toHaveLength(1);
    expect(result[0]?.branch).toBeNull();
    expect(result[0]?.isMain).toBe(true);
  });

  it('liefert leeres Array bei leerem Input', () => {
    expect(parseWorktreeListPorcelain('')).toEqual([]);
  });
});

// ---------------------------------------------------------------- Fixtures

interface ProjectsLike {
  getById(id: string): ProjectRow | null;
}
interface SessionsLike {
  findById(id: string): SessionRow | null;
}

function buildProject(overrides: Partial<ProjectRow> = {}): ProjectRow {
  return {
    id: 'p1',
    name: 'Demo',
    path: 'D:\\Projekte\\Demo',
    added_manually: 0,
    has_git: 1,
    next_season_number: 1,
    created_at: 0,
    session_count: 0,
    ...overrides,
  };
}

function buildSession(overrides: Partial<SessionRow> = {}): SessionRow {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    project_id: 'p1',
    title: 'WT',
    type: 'feature',
    season_number: null,
    status: 'running',
    current_model: 'claude-sonnet-4-6',
    worktree_branch: null,
    notes_md: '',
    cwd: 'D:\\Projekte\\Demo',
    started_at: 1000,
    ended_at: null,
    claude_session_id: null,
    custom_type_label: null,
    jsonl_path: null,
    start_commit_sha: null,
    worktree_path: null,
    ...overrides,
  };
}

class FakeProjects implements ProjectsLike {
  private rows = new Map<string, ProjectRow>();
  add(r: ProjectRow) {
    this.rows.set(r.id, r);
  }
  getById(id: string) {
    return this.rows.get(id) ?? null;
  }
}
class FakeSessions implements SessionsLike {
  private rows = new Map<string, SessionRow>();
  add(r: SessionRow) {
    this.rows.set(r.id, r);
  }
  findById(id: string) {
    return this.rows.get(id) ?? null;
  }
}

function makeDriver(): GitDriver {
  return {
    status: vi.fn(),
    diff: vi.fn(),
    showFile: vi.fn(),
    revParse: vi.fn(),
    showStagedFile: vi.fn(),
    changedFilesAgainst: vi
      .fn<(repoPath: string, baselineRef: string) => Promise<GitFileChange[]>>()
      .mockResolvedValue([]),
    listBranches: vi.fn().mockResolvedValue({ current: 'main', branches: [] }),
    listWorktrees: vi.fn().mockResolvedValue([]),
    addWorktree: vi.fn().mockResolvedValue(undefined),
    removeWorktree: vi.fn().mockResolvedValue(undefined),
    worktreeDirtyState: vi.fn().mockResolvedValue({ uncommittedCount: 0, ahead: 0 }),
    resolveBaseBranchRef: vi.fn().mockResolvedValue('main'),
    mergePreview: vi
      .fn()
      .mockResolvedValue({ mainCurrentBranch: 'main', mainClean: true, ahead: 2, behind: 0 }),
    mergeBranch: vi
      .fn()
      .mockResolvedValue({ status: 'merged', mergeCommitSha: 'newsha', conflictFiles: [] }),
    deleteBranch: vi.fn().mockResolvedValue(undefined),
  } as unknown as GitDriver;
}

// Inline-Replik des git:worktree-diff-Handlers (git.ts) — ipcMain ist ohne
// Electron-Env nicht aufrufbar (Pattern wie git-ipc.test.ts).
function worktreeDiffHandler(deps: {
  projects: ProjectsLike;
  sessions: SessionsLike;
  driver: GitDriver;
}) {
  return async (payload: unknown) => {
    try {
      const input = GitWorktreeDiffInputSchema.parse(payload);
      const session = deps.sessions.findById(input.sessionId);
      if (!session) return err('not found', 'SESSION_NOT_FOUND');
      const project = deps.projects.getById(session.project_id);
      if (!project) return err('no project', 'PROJECT_NOT_FOUND');
      if (
        project.has_git === 0 ||
        session.worktree_path === null ||
        session.worktree_branch === null
      ) {
        const r: GitWorktreeDiffResult = {
          hasWorktree: false,
          branch: '',
          baseRef: '',
          files: [],
        };
        return ok(r);
      }
      const baseRef = await deps.driver.resolveBaseBranchRef(project.path);
      const files = await deps.driver.changedFilesAgainst(session.worktree_path, baseRef);
      const r: GitWorktreeDiffResult = {
        hasWorktree: true,
        branch: session.worktree_branch,
        baseRef,
        files,
      };
      return ok(r);
    } catch (e) {
      return errFromUnknown(e, 'GIT_WORKTREE_DIFF');
    }
  };
}

// Inline-Replik des git:worktree-remove-Handlers (Dirty-Schutz).
function worktreeRemoveHandler(deps: {
  projects: ProjectsLike;
  sessions: SessionsLike;
  driver: GitDriver;
}) {
  return async (payload: unknown) => {
    try {
      const input = GitWorktreeRemoveInputSchema.parse(payload);
      const session = deps.sessions.findById(input.sessionId);
      if (!session) return err('not found', 'SESSION_NOT_FOUND');
      const noop: GitWorktreeRemoveResult = {
        removed: false,
        dirty: false,
        uncommittedCount: 0,
        ahead: 0,
      };
      if (session.worktree_path === null) return ok(noop);
      const project = deps.projects.getById(session.project_id);
      if (!project) return err('no project', 'PROJECT_NOT_FOUND');
      if (project.has_git === 0) return ok(noop);
      const force = input.force ?? false;
      if (!force) {
        const dirty = await deps.driver.worktreeDirtyState(session.worktree_path);
        if (dirty.uncommittedCount > 0 || dirty.ahead > 0) {
          const r: GitWorktreeRemoveResult = {
            removed: false,
            dirty: true,
            uncommittedCount: dirty.uncommittedCount,
            ahead: dirty.ahead,
          };
          return ok(r);
        }
      }
      await deps.driver.removeWorktree(project.path, session.worktree_path, force);
      return ok({ removed: true, dirty: false, uncommittedCount: 0, ahead: 0 });
    } catch (e) {
      return errFromUnknown(e, 'GIT_WORKTREE_REMOVE');
    }
  };
}

// Inline-Replik des git:worktree-status-Handlers (Pre-Commit-Panel).
function worktreeStatusHandler(deps: {
  projects: ProjectsLike;
  sessions: SessionsLike;
  driver: GitDriver;
}) {
  return async (payload: unknown) => {
    try {
      const input = GitWorktreeStatusInputSchema.parse(payload);
      const session = deps.sessions.findById(input.sessionId);
      if (!session) return err('not found', 'SESSION_NOT_FOUND');
      if (session.worktree_path === null) {
        const r: GitWorktreeStatusResult = { hasWorktree: false, hasGit: true, status: null };
        return ok(r);
      }
      const project = deps.projects.getById(session.project_id);
      if (!project) return err('no project', 'PROJECT_NOT_FOUND');
      if (project.has_git === 0) {
        const r: GitWorktreeStatusResult = { hasWorktree: true, hasGit: false, status: null };
        return ok(r);
      }
      const status = await deps.driver.status(session.worktree_path);
      const r: GitWorktreeStatusResult = { hasWorktree: true, hasGit: true, status };
      return ok(r);
    } catch (e) {
      return errFromUnknown(e, 'GIT_WORKTREE_STATUS');
    }
  };
}

const WT_SESSION_ID = '11111111-1111-4111-8111-111111111111';

describe('git:worktree-diff Handler', () => {
  let projects: FakeProjects;
  let sessions: FakeSessions;
  let driver: GitDriver;
  let handler: ReturnType<typeof worktreeDiffHandler>;

  beforeEach(() => {
    projects = new FakeProjects();
    sessions = new FakeSessions();
    driver = makeDriver();
    handler = worktreeDiffHandler({ projects, sessions, driver });
  });

  it('hasWorktree=false, wenn die Session keinen Worktree hat', async () => {
    projects.add(buildProject());
    sessions.add(buildSession({ worktree_path: null }));
    const result = await handler({ sessionId: WT_SESSION_ID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.hasWorktree).toBe(false);
    expect(driver.changedFilesAgainst).not.toHaveBeenCalled();
  });

  it('liefert Files gegen den Basis-Ref, wenn ein Worktree existiert', async () => {
    projects.add(buildProject({ path: 'C:\\repo' }));
    sessions.add(
      buildSession({
        worktree_path: 'C:\\repo-worktrees\\exp',
        worktree_branch: 'exp',
      }),
    );
    (driver.changedFilesAgainst as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { path: 'a.ts', worktreeStatus: 'modified', indexStatus: 'unchanged', insertions: 1, deletions: 0 },
    ]);
    const result = await handler({ sessionId: WT_SESSION_ID });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hasWorktree).toBe(true);
      expect(result.data.branch).toBe('exp');
      expect(result.data.baseRef).toBe('main');
      expect(result.data.files).toHaveLength(1);
    }
    expect(driver.changedFilesAgainst).toHaveBeenCalledWith('C:\\repo-worktrees\\exp', 'main');
  });
});

describe('git:worktree-remove Handler', () => {
  let projects: FakeProjects;
  let sessions: FakeSessions;
  let driver: GitDriver;
  let handler: ReturnType<typeof worktreeRemoveHandler>;

  beforeEach(() => {
    projects = new FakeProjects();
    sessions = new FakeSessions();
    driver = makeDriver();
    handler = worktreeRemoveHandler({ projects, sessions, driver });
  });

  it('No-op (removed=false) fuer Sessions ohne Worktree', async () => {
    sessions.add(buildSession({ worktree_path: null }));
    const result = await handler({ sessionId: WT_SESSION_ID });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.removed).toBe(false);
      expect(result.data.dirty).toBe(false);
    }
    expect(driver.removeWorktree).not.toHaveBeenCalled();
  });

  it('entfernt einen sauberen Worktree ohne force', async () => {
    projects.add(buildProject({ path: 'C:\\repo' }));
    sessions.add(buildSession({ worktree_path: 'C:\\repo-worktrees\\exp', worktree_branch: 'exp' }));
    const result = await handler({ sessionId: WT_SESSION_ID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.removed).toBe(true);
    expect(driver.removeWorktree).toHaveBeenCalledWith('C:\\repo', 'C:\\repo-worktrees\\exp', false);
  });

  it('schuetzt dirty Worktree ohne force (dirty=true, nicht entfernt)', async () => {
    projects.add(buildProject({ path: 'C:\\repo' }));
    sessions.add(buildSession({ worktree_path: 'C:\\repo-worktrees\\exp', worktree_branch: 'exp' }));
    (driver.worktreeDirtyState as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uncommittedCount: 3,
      ahead: 1,
    });
    const result = await handler({ sessionId: WT_SESSION_ID });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.removed).toBe(false);
      expect(result.data.dirty).toBe(true);
      expect(result.data.uncommittedCount).toBe(3);
      expect(result.data.ahead).toBe(1);
    }
    expect(driver.removeWorktree).not.toHaveBeenCalled();
  });

  it('entfernt dirty Worktree mit force=true', async () => {
    projects.add(buildProject({ path: 'C:\\repo' }));
    sessions.add(buildSession({ worktree_path: 'C:\\repo-worktrees\\exp', worktree_branch: 'exp' }));
    (driver.worktreeDirtyState as ReturnType<typeof vi.fn>).mockResolvedValue({
      uncommittedCount: 3,
      ahead: 0,
    });
    const result = await handler({ sessionId: WT_SESSION_ID, force: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.removed).toBe(true);
    expect(driver.worktreeDirtyState).not.toHaveBeenCalled();
    expect(driver.removeWorktree).toHaveBeenCalledWith('C:\\repo', 'C:\\repo-worktrees\\exp', true);
  });
});

describe('git:worktree-status Handler', () => {
  let projects: FakeProjects;
  let sessions: FakeSessions;
  let driver: GitDriver;
  let handler: ReturnType<typeof worktreeStatusHandler>;

  beforeEach(() => {
    projects = new FakeProjects();
    sessions = new FakeSessions();
    driver = makeDriver();
    handler = worktreeStatusHandler({ projects, sessions, driver });
  });

  it('hasWorktree=false fuer normale Sessions (Fallback auf Projekt-Status)', async () => {
    projects.add(buildProject());
    sessions.add(buildSession({ worktree_path: null }));
    const result = await handler({ sessionId: WT_SESSION_ID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.hasWorktree).toBe(false);
    expect(driver.status).not.toHaveBeenCalled();
  });

  it('liefert den Working-Tree-Status DES Worktrees', async () => {
    projects.add(buildProject({ path: 'C:\\repo' }));
    sessions.add(
      buildSession({ worktree_path: 'C:\\repo-worktrees\\exp', worktree_branch: 'exp' }),
    );
    const wtStatus: GitStatusResult = {
      branch: 'exp',
      files: [
        { path: 'x.ts', worktreeStatus: 'modified', indexStatus: 'unchanged', insertions: 2, deletions: 1 },
      ],
      ahead: 0,
      behind: 0,
    };
    (driver.status as ReturnType<typeof vi.fn>).mockResolvedValueOnce(wtStatus);
    const result = await handler({ sessionId: WT_SESSION_ID });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hasWorktree).toBe(true);
      expect(result.data.status?.branch).toBe('exp');
      expect(result.data.status?.files).toHaveLength(1);
    }
    expect(driver.status).toHaveBeenCalledWith('C:\\repo-worktrees\\exp');
  });
});

// ------------------------------------------------------- Merge (Phase 3)

// Inline-Replik des git:worktree-merge-preview-Handlers.
function worktreeMergePreviewHandler(deps: {
  projects: ProjectsLike;
  sessions: SessionsLike;
  driver: GitDriver;
}) {
  return async (payload: unknown) => {
    try {
      const input = GitWorktreeMergePreviewInputSchema.parse(payload);
      const session = deps.sessions.findById(input.sessionId);
      if (!session) return err('not found', 'SESSION_NOT_FOUND');
      const project = deps.projects.getById(session.project_id);
      if (!project) return err('no project', 'PROJECT_NOT_FOUND');
      if (
        project.has_git === 0 ||
        session.worktree_path === null ||
        session.worktree_branch === null
      ) {
        const r: GitWorktreeMergePreviewResult = {
          hasWorktree: false,
          branch: '',
          baseRef: '',
          mainCurrentBranch: '',
          mainClean: false,
          worktreeUncommittedCount: 0,
          ahead: 0,
          behind: 0,
        };
        return ok(r);
      }
      const baseRef = await deps.driver.resolveBaseBranchRef(project.path);
      const [preview, dirty] = await Promise.all([
        deps.driver.mergePreview(project.path, session.worktree_branch, baseRef),
        deps.driver.worktreeDirtyState(session.worktree_path),
      ]);
      const r: GitWorktreeMergePreviewResult = {
        hasWorktree: true,
        branch: session.worktree_branch,
        baseRef,
        mainCurrentBranch: preview.mainCurrentBranch,
        mainClean: preview.mainClean,
        worktreeUncommittedCount: dirty.uncommittedCount,
        ahead: preview.ahead,
        behind: preview.behind,
      };
      return ok(r);
    } catch (e) {
      return errFromUnknown(e, 'GIT_WORKTREE_MERGE_PREVIEW');
    }
  };
}

// Inline-Replik des git:worktree-merge-Handlers (Vorbedingungen + Cleanup).
function worktreeMergeHandler(deps: {
  projects: ProjectsLike;
  sessions: SessionsLike;
  driver: GitDriver;
}) {
  return async (payload: unknown) => {
    try {
      const input = GitWorktreeMergeInputSchema.parse(payload);
      const session = deps.sessions.findById(input.sessionId);
      if (!session) return err('not found', 'SESSION_NOT_FOUND');
      if (session.worktree_path === null || session.worktree_branch === null) {
        return err('no worktree', 'NO_WORKTREE');
      }
      const project = deps.projects.getById(session.project_id);
      if (!project) return err('no project', 'PROJECT_NOT_FOUND');
      if (project.has_git === 0) return err('not git', 'NOT_A_GIT_REPO');
      const branch = session.worktree_branch;
      const worktreePath = session.worktree_path;
      const baseRef = await deps.driver.resolveBaseBranchRef(project.path);
      const preview = await deps.driver.mergePreview(project.path, branch, baseRef);
      if (preview.mainCurrentBranch !== baseRef) {
        return err('base not checked out', 'MERGE_BASE_NOT_CHECKED_OUT');
      }
      if (!preview.mainClean) {
        return err('main dirty', 'MERGE_MAIN_DIRTY');
      }
      const outcome = await deps.driver.mergeBranch(project.path, branch, {
        strategy: input.strategy,
        commitMessage: input.commitMessage,
      });
      if (outcome.status === 'conflict') {
        const r: GitWorktreeMergeResult = {
          merged: false,
          conflicted: true,
          ffFailed: false,
          conflictFiles: outcome.conflictFiles,
          mergeCommitSha: null,
          worktreeRemoved: false,
          branchDeleted: false,
        };
        return ok(r);
      }
      if (outcome.status === 'ff-failed') {
        const r: GitWorktreeMergeResult = {
          merged: false,
          conflicted: false,
          ffFailed: true,
          conflictFiles: [],
          mergeCommitSha: null,
          worktreeRemoved: false,
          branchDeleted: false,
        };
        return ok(r);
      }
      let worktreeRemoved = false;
      let branchDeleted = false;
      if (input.removeWorktree) {
        try {
          await deps.driver.removeWorktree(project.path, worktreePath, true);
          worktreeRemoved = true;
        } catch {
          // Cleanup-Fehler ist nicht fatal — der Merge stand.
        }
      }
      if (input.deleteBranch) {
        try {
          await deps.driver.deleteBranch(project.path, branch, input.strategy === 'squash');
          branchDeleted = true;
        } catch {
          // dito.
        }
      }
      const r: GitWorktreeMergeResult = {
        merged: true,
        conflicted: false,
        ffFailed: false,
        conflictFiles: [],
        mergeCommitSha: outcome.mergeCommitSha,
        worktreeRemoved,
        branchDeleted,
      };
      return ok(r);
    } catch (e) {
      return errFromUnknown(e, 'GIT_WORKTREE_MERGE');
    }
  };
}

describe('git:worktree-merge-preview Handler', () => {
  let projects: FakeProjects;
  let sessions: FakeSessions;
  let driver: GitDriver;
  let handler: ReturnType<typeof worktreeMergePreviewHandler>;

  beforeEach(() => {
    projects = new FakeProjects();
    sessions = new FakeSessions();
    driver = makeDriver();
    handler = worktreeMergePreviewHandler({ projects, sessions, driver });
  });

  it('hasWorktree=false fuer Sessions ohne Worktree', async () => {
    projects.add(buildProject());
    sessions.add(buildSession({ worktree_path: null }));
    const result = await handler({ sessionId: WT_SESSION_ID });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.hasWorktree).toBe(false);
    expect(driver.mergePreview).not.toHaveBeenCalled();
  });

  it('liefert Branch/Basis + ahead/behind + Dirty-Count fuer einen Worktree', async () => {
    projects.add(buildProject({ path: 'C:\\repo' }));
    sessions.add(buildSession({ worktree_path: 'C:\\repo-worktrees\\exp', worktree_branch: 'exp' }));
    (driver.mergePreview as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      mainCurrentBranch: 'main',
      mainClean: true,
      ahead: 3,
      behind: 1,
    });
    (driver.worktreeDirtyState as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      uncommittedCount: 2,
      ahead: 0,
    });
    const result = await handler({ sessionId: WT_SESSION_ID });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hasWorktree).toBe(true);
      expect(result.data.branch).toBe('exp');
      expect(result.data.baseRef).toBe('main');
      expect(result.data.mainCurrentBranch).toBe('main');
      expect(result.data.ahead).toBe(3);
      expect(result.data.behind).toBe(1);
      expect(result.data.worktreeUncommittedCount).toBe(2);
    }
  });
});

describe('git:worktree-merge Handler', () => {
  let projects: FakeProjects;
  let sessions: FakeSessions;
  let driver: GitDriver;
  let handler: ReturnType<typeof worktreeMergeHandler>;

  const wtSession = () =>
    buildSession({ worktree_path: 'C:\\repo-worktrees\\exp', worktree_branch: 'exp' });

  beforeEach(() => {
    projects = new FakeProjects();
    sessions = new FakeSessions();
    driver = makeDriver();
    handler = worktreeMergeHandler({ projects, sessions, driver });
    projects.add(buildProject({ path: 'C:\\repo' }));
  });

  const mergeInput = (over: Partial<Record<string, unknown>> = {}) => ({
    sessionId: WT_SESSION_ID,
    strategy: 'merge-commit',
    removeWorktree: true,
    deleteBranch: true,
    ...over,
  });

  it('NO_WORKTREE fuer Sessions ohne Worktree', async () => {
    sessions.add(buildSession({ worktree_path: null }));
    const result = await handler(mergeInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NO_WORKTREE');
    expect(driver.mergeBranch).not.toHaveBeenCalled();
  });

  it('MERGE_BASE_NOT_CHECKED_OUT, wenn der Haupt-Checkout nicht auf dem Basis-Ref steht', async () => {
    sessions.add(wtSession());
    (driver.mergePreview as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      mainCurrentBranch: 'feature-x',
      mainClean: true,
      ahead: 2,
      behind: 0,
    });
    const result = await handler(mergeInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MERGE_BASE_NOT_CHECKED_OUT');
    expect(driver.mergeBranch).not.toHaveBeenCalled();
  });

  it('MERGE_MAIN_DIRTY, wenn der Haupt-Checkout uncommittete Aenderungen hat', async () => {
    sessions.add(wtSession());
    (driver.mergePreview as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      mainCurrentBranch: 'main',
      mainClean: false,
      ahead: 2,
      behind: 0,
    });
    const result = await handler(mergeInput());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('MERGE_MAIN_DIRTY');
    expect(driver.mergeBranch).not.toHaveBeenCalled();
  });

  it('mergt erfolgreich und raeumt Worktree + Branch auf (merge-commit)', async () => {
    sessions.add(wtSession());
    const result = await handler(mergeInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.merged).toBe(true);
      expect(result.data.mergeCommitSha).toBe('newsha');
      expect(result.data.worktreeRemoved).toBe(true);
      expect(result.data.branchDeleted).toBe(true);
    }
    expect(driver.removeWorktree).toHaveBeenCalledWith('C:\\repo', 'C:\\repo-worktrees\\exp', true);
    // merge-commit → safe delete (force=false).
    expect(driver.deleteBranch).toHaveBeenCalledWith('C:\\repo', 'exp', false);
  });

  it('loescht den Branch bei squash mit force=true', async () => {
    sessions.add(wtSession());
    const result = await handler(mergeInput({ strategy: 'squash' }));
    expect(result.ok).toBe(true);
    expect(driver.deleteBranch).toHaveBeenCalledWith('C:\\repo', 'exp', true);
  });

  it('fuehrt keinen Cleanup aus, wenn die Flags aus sind', async () => {
    sessions.add(wtSession());
    const result = await handler(mergeInput({ removeWorktree: false, deleteBranch: false }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.worktreeRemoved).toBe(false);
      expect(result.data.branchDeleted).toBe(false);
    }
    expect(driver.removeWorktree).not.toHaveBeenCalled();
    expect(driver.deleteBranch).not.toHaveBeenCalled();
  });

  it('meldet Konflikt ohne Cleanup', async () => {
    sessions.add(wtSession());
    (driver.mergeBranch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 'conflict',
      mergeCommitSha: null,
      conflictFiles: ['src/a.ts', 'src/b.ts'],
    });
    const result = await handler(mergeInput());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.merged).toBe(false);
      expect(result.data.conflicted).toBe(true);
      expect(result.data.conflictFiles).toEqual(['src/a.ts', 'src/b.ts']);
    }
    expect(driver.removeWorktree).not.toHaveBeenCalled();
    expect(driver.deleteBranch).not.toHaveBeenCalled();
  });

  it('meldet ff-failed (divergierter Basis-Branch)', async () => {
    sessions.add(wtSession());
    (driver.mergeBranch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 'ff-failed',
      mergeCommitSha: null,
      conflictFiles: [],
    });
    const result = await handler(mergeInput({ strategy: 'ff-only' }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.merged).toBe(false);
      expect(result.data.ffFailed).toBe(true);
    }
    expect(driver.removeWorktree).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- Schema

describe('PtyCreateInputSchema worktree', () => {
  const base = {
    sessionId: '11111111-1111-4111-8111-111111111111',
    projectId: 'p1',
    title: 'T',
    model: 'claude-sonnet-4-6',
    cols: 80,
    rows: 24,
  };

  it('akzeptiert eine gueltige Worktree-Option', () => {
    const parsed = PtyCreateInputSchema.safeParse({
      ...base,
      type: 'feature',
      worktree: { branch: 'experiment/foo', mode: 'new' },
    });
    expect(parsed.success).toBe(true);
  });

  it('akzeptiert das Weglassen von worktree (normale Session)', () => {
    const parsed = PtyCreateInputSchema.safeParse({ ...base, type: 'feature' });
    expect(parsed.success).toBe(true);
  });

  it('lehnt worktree fuer type=terminal ab', () => {
    const parsed = PtyCreateInputSchema.safeParse({
      ...base,
      type: 'terminal',
      worktree: { branch: 'x', mode: 'new' },
    });
    expect(parsed.success).toBe(false);
  });

  it('lehnt einen leeren Branch-Namen ab', () => {
    const parsed = PtyCreateInputSchema.safeParse({
      ...base,
      type: 'feature',
      worktree: { branch: '', mode: 'existing' },
    });
    expect(parsed.success).toBe(false);
  });
});
