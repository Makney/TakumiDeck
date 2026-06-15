import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ok, err, errFromUnknown } from '../../src/shared/result';
import {
  GitBranchOverviewInputSchema,
  GitCheckoutInputSchema,
  GitFetchInputSchema,
  GitPullInputSchema,
} from '../../src/shared/schemas';
import {
  parseBranchTrackLine,
  parseBranchTrackLines,
  buildBranchOverview,
} from '../../src/main/git/branchOps';
import {
  describeCheckoutResult,
  describeFetchResult,
  describePullResult,
} from '../../src/renderer/components/branchOpMessages';
import type { GitDriver } from '../../src/main/git/driver';
import type {
  GitBranchOverviewResult,
  GitCheckoutResult,
  GitFetchResult,
  GitPullResult,
  GitWorktreeEntry,
  ProjectRow,
} from '../../src/shared/types';

// Season 38 (Pull/Fetch/Branch-Switch): Tests fuer
//  1. den for-each-ref-Parser + buildBranchOverview (Pure-Logik)
//  2. die Renderer-Message-Helper (Pure)
//  3. die vier IPC-Handler (branch-overview / checkout / fetch / pull) — inline
//     repliziert wie git-ipc.test.ts (ipcMain ist ohne Electron nicht aufrufbar)

// ---------------------------------------------------------------- Parser

describe('parseBranchTrackLine', () => {
  it('parst Branch mit ahead/behind', () => {
    expect(parseBranchTrackLine('dev\torigin/dev\t[ahead 2, behind 3]')).toEqual({
      name: 'dev',
      upstream: 'origin/dev',
      ahead: 2,
      behind: 3,
    });
  });

  it('parst Branch nur ahead', () => {
    expect(parseBranchTrackLine('main\torigin/main\t[ahead 1]')).toEqual({
      name: 'main',
      upstream: 'origin/main',
      ahead: 1,
      behind: 0,
    });
  });

  it('Branch ohne Upstream → upstream=null, 0/0', () => {
    expect(parseBranchTrackLine('feature/foo\t\t')).toEqual({
      name: 'feature/foo',
      upstream: null,
      ahead: 0,
      behind: 0,
    });
  });

  it('[gone] laesst Upstream gesetzt, ahead/behind 0', () => {
    expect(parseBranchTrackLine('old\torigin/old\t[gone]')).toEqual({
      name: 'old',
      upstream: 'origin/old',
      ahead: 0,
      behind: 0,
    });
  });

  it('Leerzeile / leerer Name → null', () => {
    expect(parseBranchTrackLine('')).toBeNull();
    expect(parseBranchTrackLine('   ')).toBeNull();
  });
});

describe('parseBranchTrackLines', () => {
  it('parst mehrere Zeilen, ueberspringt Leerzeilen', () => {
    const raw = [
      'main\torigin/main\t[ahead 1]',
      'dev\t\t',
      '',
      'feature/x\torigin/feature/x\t[behind 4]',
    ].join('\n');
    const result = parseBranchTrackLines(raw);
    expect(result).toHaveLength(3);
    expect(result.map((b) => b.name)).toEqual(['main', 'dev', 'feature/x']);
  });
});

// ---------------------------------------------------------------- buildBranchOverview

describe('buildBranchOverview', () => {
  const wt = (path: string, branch: string | null, isMain: boolean): GitWorktreeEntry => ({
    path,
    branch,
    isMain,
  });

  it('markiert current + Linked-Worktree-Branches, sortiert alphabetisch', () => {
    const result = buildBranchOverview({
      current: 'main',
      mainClean: true,
      hasRemote: true,
      track: [
        { name: 'main', upstream: 'origin/main', ahead: 0, behind: 0 },
        { name: 'feature/foo', upstream: null, ahead: 0, behind: 0 },
        { name: 'dev', upstream: 'origin/dev', ahead: 1, behind: 2 },
      ],
      worktrees: [
        wt('/repo', 'main', true),
        wt('/repo-worktrees/foo', 'feature/foo', false),
      ],
    });
    expect(result.hasGit).toBe(true);
    expect(result.detached).toBe(false);
    expect(result.branches.map((b) => b.name)).toEqual(['dev', 'feature/foo', 'main']);
    const main = result.branches.find((b) => b.name === 'main')!;
    expect(main.isCurrent).toBe(true);
    expect(main.checkedOutPath).toBeNull(); // Haupt-Checkout zaehlt nicht als „elsewhere"
    const foo = result.branches.find((b) => b.name === 'feature/foo')!;
    expect(foo.checkedOutPath).toBe('/repo-worktrees/foo');
    expect(foo.isCurrent).toBe(false);
  });

  it('detached=true, wenn current keinem Branch entspricht', () => {
    const result = buildBranchOverview({
      current: 'a1b2c3d',
      mainClean: false,
      hasRemote: false,
      track: [{ name: 'main', upstream: null, ahead: 0, behind: 0 }],
      worktrees: [],
    });
    expect(result.detached).toBe(true);
    expect(result.branches.every((b) => !b.isCurrent)).toBe(true);
  });
});

// ---------------------------------------------------------------- Message-Helper

describe('branchOpMessages', () => {
  it('describeCheckoutResult', () => {
    expect(
      describeCheckoutResult({ status: 'switched', branch: 'dev', stashed: false, checkedOutPath: null }),
    ).toBe('Auf „dev" gewechselt');
    expect(
      describeCheckoutResult({ status: 'switched', branch: 'dev', stashed: true, checkedOutPath: null }),
    ).toContain('gestasht');
    expect(
      describeCheckoutResult({
        status: 'checked-out-elsewhere',
        branch: 'dev',
        stashed: false,
        checkedOutPath: '/wt',
      }),
    ).toContain('anderen Worktree');
  });

  it('describeFetchResult', () => {
    expect(describeFetchResult({ status: 'fetched' })).toBe('Fetch abgeschlossen');
    expect(describeFetchResult({ status: 'no-remote' })).toContain('Kein Remote');
  });

  it('describePullResult', () => {
    expect(
      describePullResult({ status: 'pulled', conflictFiles: [], filesChanged: 3, insertions: 10, deletions: 2 }),
    ).toContain('3 Datei');
    expect(
      describePullResult({ status: 'up-to-date', conflictFiles: [], filesChanged: 0, insertions: 0, deletions: 0 }),
    ).toContain('Bereits aktuell');
    expect(
      describePullResult({ status: 'conflict', conflictFiles: ['a', 'b'], filesChanged: 0, insertions: 0, deletions: 0 }),
    ).toContain('2 Datei');
    expect(
      describePullResult({ status: 'no-upstream', conflictFiles: [], filesChanged: 0, insertions: 0, deletions: 0 }),
    ).toContain('Upstream');
  });
});

// ---------------------------------------------------------------- Fixtures

interface ProjectsLike {
  getById(id: string): ProjectRow | null;
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

class FakeProjects implements ProjectsLike {
  private rows = new Map<string, ProjectRow>();
  add(r: ProjectRow) {
    this.rows.set(r.id, r);
  }
  getById(id: string) {
    return this.rows.get(id) ?? null;
  }
}

function makeDriver(): GitDriver {
  return {
    status: vi
      .fn()
      .mockResolvedValue({ branch: 'main', files: [], ahead: 0, behind: 0 }),
    diff: vi.fn(),
    showFile: vi.fn(),
    revParse: vi.fn(),
    showStagedFile: vi.fn(),
    changedFilesAgainst: vi.fn().mockResolvedValue([]),
    listBranches: vi.fn().mockResolvedValue({ current: 'main', branches: [] }),
    listWorktrees: vi.fn().mockResolvedValue([]),
    addWorktree: vi.fn().mockResolvedValue(undefined),
    removeWorktree: vi.fn().mockResolvedValue(undefined),
    worktreeDirtyState: vi.fn().mockResolvedValue({ uncommittedCount: 0, ahead: 0 }),
    resolveBaseBranchRef: vi.fn().mockResolvedValue('main'),
    mergePreview: vi.fn(),
    mergeBranch: vi.fn(),
    deleteBranch: vi.fn().mockResolvedValue(undefined),
    branchTrackInfos: vi.fn().mockResolvedValue([]),
    hasRemote: vi.fn().mockResolvedValue(true),
    checkout: vi.fn().mockResolvedValue(undefined),
    stashPush: vi.fn().mockResolvedValue(true),
    fetch: vi.fn().mockResolvedValue(undefined),
    pull: vi
      .fn()
      .mockResolvedValue({ status: 'up-to-date', conflictFiles: [], filesChanged: 0, insertions: 0, deletions: 0 }),
  } as unknown as GitDriver;
}

// ---------------------------------------------------------------- Handler-Repliken

function branchOverviewHandler(deps: { projects: ProjectsLike; driver: GitDriver }) {
  return async (payload: unknown) => {
    try {
      const input = GitBranchOverviewInputSchema.parse(payload);
      const project = deps.projects.getById(input.projectId);
      if (!project) return err('not found', 'PROJECT_NOT_FOUND');
      if (project.has_git === 0) {
        const r: GitBranchOverviewResult = {
          hasGit: false,
          current: '',
          detached: false,
          mainClean: false,
          hasRemote: false,
          branches: [],
        };
        return ok(r);
      }
      const [status, track, worktrees, hasRemote] = await Promise.all([
        deps.driver.status(project.path),
        deps.driver.branchTrackInfos(project.path),
        deps.driver.listWorktrees(project.path),
        deps.driver.hasRemote(project.path),
      ]);
      return ok(
        buildBranchOverview({
          current: status.branch,
          mainClean: status.files.length === 0,
          hasRemote,
          track,
          worktrees,
        }),
      );
    } catch (e) {
      return errFromUnknown(e, 'GIT_BRANCH_OVERVIEW');
    }
  };
}

function checkoutHandler(deps: { projects: ProjectsLike; driver: GitDriver }) {
  return async (payload: unknown) => {
    try {
      const input = GitCheckoutInputSchema.parse(payload);
      const project = deps.projects.getById(input.projectId);
      if (!project) return err('not found', 'PROJECT_NOT_FOUND');
      if (project.has_git === 0) return err('no git', 'NOT_A_GIT_REPO');
      const worktrees = await deps.driver.listWorktrees(project.path);
      const elsewhere = worktrees.find((w) => !w.isMain && w.branch === input.branch);
      if (elsewhere) {
        const r: GitCheckoutResult = {
          status: 'checked-out-elsewhere',
          branch: input.branch,
          stashed: false,
          checkedOutPath: elsewhere.path,
        };
        return ok(r);
      }
      const status = await deps.driver.status(project.path);
      const dirty = status.files.length > 0;
      if (dirty && !input.autoStash) {
        const r: GitCheckoutResult = {
          status: 'dirty',
          branch: input.branch,
          stashed: false,
          checkedOutPath: null,
        };
        return ok(r);
      }
      let stashed = false;
      if (dirty && input.autoStash) {
        stashed = await deps.driver.stashPush(project.path, `x ${input.branch}`);
      }
      await deps.driver.checkout(project.path, input.branch);
      const r: GitCheckoutResult = {
        status: 'switched',
        branch: input.branch,
        stashed,
        checkedOutPath: null,
      };
      return ok(r);
    } catch (e) {
      return errFromUnknown(e, 'GIT_CHECKOUT');
    }
  };
}

function fetchHandler(deps: { projects: ProjectsLike; driver: GitDriver }) {
  return async (payload: unknown) => {
    try {
      const input = GitFetchInputSchema.parse(payload);
      const project = deps.projects.getById(input.projectId);
      if (!project) return err('not found', 'PROJECT_NOT_FOUND');
      if (project.has_git === 0) return err('no git', 'NOT_A_GIT_REPO');
      const hasRemote = await deps.driver.hasRemote(project.path);
      if (!hasRemote) return ok<GitFetchResult>({ status: 'no-remote' });
      await deps.driver.fetch(project.path);
      return ok<GitFetchResult>({ status: 'fetched' });
    } catch (e) {
      return errFromUnknown(e, 'GIT_FETCH');
    }
  };
}

function pullHandler(deps: { projects: ProjectsLike; driver: GitDriver }) {
  const zeros = { conflictFiles: [] as string[], filesChanged: 0, insertions: 0, deletions: 0 };
  return async (payload: unknown) => {
    try {
      const input = GitPullInputSchema.parse(payload);
      const project = deps.projects.getById(input.projectId);
      if (!project) return err('not found', 'PROJECT_NOT_FOUND');
      if (project.has_git === 0) return err('no git', 'NOT_A_GIT_REPO');
      const hasRemote = await deps.driver.hasRemote(project.path);
      if (!hasRemote) return ok<GitPullResult>({ status: 'no-remote', ...zeros });
      const status = await deps.driver.status(project.path);
      if (status.files.length > 0) return ok<GitPullResult>({ status: 'dirty', ...zeros });
      const track = await deps.driver.branchTrackInfos(project.path);
      const current = track.find((t) => t.name === status.branch);
      if (!current || current.upstream === null) {
        return ok<GitPullResult>({ status: 'no-upstream', ...zeros });
      }
      const outcome = await deps.driver.pull(project.path);
      return ok<GitPullResult>({
        status: outcome.status,
        conflictFiles: outcome.conflictFiles,
        filesChanged: outcome.filesChanged,
        insertions: outcome.insertions,
        deletions: outcome.deletions,
      });
    } catch (e) {
      return errFromUnknown(e, 'GIT_PULL');
    }
  };
}

// ---------------------------------------------------------------- IPC-Tests

describe('git:branch-overview Handler', () => {
  let projects: FakeProjects;
  let driver: GitDriver;
  let handler: ReturnType<typeof branchOverviewHandler>;

  beforeEach(() => {
    projects = new FakeProjects();
    projects.add(buildProject());
    driver = makeDriver();
    handler = branchOverviewHandler({ projects, driver });
  });

  it('liefert hasGit=false bei has_git=0', async () => {
    projects.add(buildProject({ id: 'p2', has_git: 0 }));
    const res = await handler({ projectId: 'p2' });
    expect(res.ok && res.data.hasGit).toBe(false);
  });

  it('aggregiert Branch-Liste mit Tracking + Worktree-Markierung', async () => {
    (driver.branchTrackInfos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: 'main', upstream: 'origin/main', ahead: 0, behind: 1 },
      { name: 'dev', upstream: null, ahead: 0, behind: 0 },
    ]);
    (driver.listWorktrees as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { path: '/repo', branch: 'main', isMain: true },
      { path: '/wt/dev', branch: 'dev', isMain: false },
    ]);
    const res = await handler({ projectId: 'p1' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.hasGit).toBe(true);
    expect(res.data.current).toBe('main');
    const dev = res.data.branches.find((b) => b.name === 'dev')!;
    expect(dev.checkedOutPath).toBe('/wt/dev');
  });
});

describe('git:checkout Handler', () => {
  let projects: FakeProjects;
  let driver: GitDriver;
  let handler: ReturnType<typeof checkoutHandler>;

  beforeEach(() => {
    projects = new FakeProjects();
    projects.add(buildProject());
    driver = makeDriver();
    handler = checkoutHandler({ projects, driver });
  });

  it('wechselt bei sauberem Tree', async () => {
    const res = await handler({ projectId: 'p1', branch: 'dev', autoStash: false });
    expect(res.ok && res.data.status).toBe('switched');
    expect(driver.checkout).toHaveBeenCalledWith('D:\\Projekte\\Demo', 'dev');
  });

  it('blockt bei dirty Tree ohne autoStash', async () => {
    (driver.status as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      branch: 'main',
      files: [{ path: 'a.ts', worktreeStatus: 'modified', indexStatus: 'unchanged', insertions: 1, deletions: 0 }],
      ahead: 0,
      behind: 0,
    });
    const res = await handler({ projectId: 'p1', branch: 'dev', autoStash: false });
    expect(res.ok && res.data.status).toBe('dirty');
    expect(driver.checkout).not.toHaveBeenCalled();
  });

  it('stasht + wechselt bei dirty Tree mit autoStash', async () => {
    (driver.status as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      branch: 'main',
      files: [{ path: 'a.ts', worktreeStatus: 'modified', indexStatus: 'unchanged', insertions: 1, deletions: 0 }],
      ahead: 0,
      behind: 0,
    });
    const res = await handler({ projectId: 'p1', branch: 'dev', autoStash: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe('switched');
    expect(res.data.stashed).toBe(true);
    expect(driver.stashPush).toHaveBeenCalled();
    expect(driver.checkout).toHaveBeenCalled();
  });

  it('lehnt Branch ab, der in einem Linked-Worktree belegt ist', async () => {
    (driver.listWorktrees as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { path: '/repo', branch: 'main', isMain: true },
      { path: '/wt/dev', branch: 'dev', isMain: false },
    ]);
    const res = await handler({ projectId: 'p1', branch: 'dev', autoStash: false });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe('checked-out-elsewhere');
    expect(res.data.checkedOutPath).toBe('/wt/dev');
    expect(driver.checkout).not.toHaveBeenCalled();
  });
});

describe('git:fetch Handler', () => {
  let projects: FakeProjects;
  let driver: GitDriver;

  beforeEach(() => {
    projects = new FakeProjects();
    projects.add(buildProject());
    driver = makeDriver();
  });

  it('fetcht bei vorhandenem Remote', async () => {
    const res = await fetchHandler({ projects, driver })({ projectId: 'p1' });
    expect(res.ok && res.data.status).toBe('fetched');
    expect(driver.fetch).toHaveBeenCalled();
  });

  it('liefert no-remote ohne Remote', async () => {
    (driver.hasRemote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const res = await fetchHandler({ projects, driver })({ projectId: 'p1' });
    expect(res.ok && res.data.status).toBe('no-remote');
    expect(driver.fetch).not.toHaveBeenCalled();
  });
});

describe('git:pull Handler', () => {
  let projects: FakeProjects;
  let driver: GitDriver;
  let handler: ReturnType<typeof pullHandler>;

  beforeEach(() => {
    projects = new FakeProjects();
    projects.add(buildProject());
    driver = makeDriver();
    handler = pullHandler({ projects, driver });
  });

  it('no-remote ohne Remote', async () => {
    (driver.hasRemote as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false);
    const res = await handler({ projectId: 'p1' });
    expect(res.ok && res.data.status).toBe('no-remote');
  });

  it('dirty bei uncommitteten Aenderungen', async () => {
    (driver.status as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      branch: 'main',
      files: [{ path: 'a.ts', worktreeStatus: 'modified', indexStatus: 'unchanged', insertions: 1, deletions: 0 }],
      ahead: 0,
      behind: 0,
    });
    const res = await handler({ projectId: 'p1' });
    expect(res.ok && res.data.status).toBe('dirty');
    expect(driver.pull).not.toHaveBeenCalled();
  });

  it('no-upstream, wenn aktueller Branch kein Tracking hat', async () => {
    (driver.branchTrackInfos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: 'main', upstream: null, ahead: 0, behind: 0 },
    ]);
    const res = await handler({ projectId: 'p1' });
    expect(res.ok && res.data.status).toBe('no-upstream');
    expect(driver.pull).not.toHaveBeenCalled();
  });

  it('pulled bei Upstream + sauberem Tree', async () => {
    (driver.branchTrackInfos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: 'main', upstream: 'origin/main', ahead: 0, behind: 2 },
    ]);
    (driver.pull as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 'pulled',
      conflictFiles: [],
      filesChanged: 2,
      insertions: 5,
      deletions: 1,
    });
    const res = await handler({ projectId: 'p1' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe('pulled');
    expect(res.data.filesChanged).toBe(2);
  });

  it('conflict reicht Konfliktdateien durch', async () => {
    (driver.branchTrackInfos as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { name: 'main', upstream: 'origin/main', ahead: 1, behind: 2 },
    ]);
    (driver.pull as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 'conflict',
      conflictFiles: ['src/a.ts', 'src/b.ts'],
      filesChanged: 0,
      insertions: 0,
      deletions: 0,
    });
    const res = await handler({ projectId: 'p1' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.status).toBe('conflict');
    expect(res.data.conflictFiles).toEqual(['src/a.ts', 'src/b.ts']);
  });
});
