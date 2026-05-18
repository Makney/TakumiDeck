import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GitDriver } from '../../src/main/git/driver';
import type { GitStatusResult } from '../../src/shared/types';
import {
  GitStatusInputSchema,
  GitDiffInputSchema,
  GitShowInputSchema,
} from '../../src/shared/schemas';

// Sprint 7 — Tests für den Git-IPC-Pfad mit Driver-Injection.
//
// Wir testen die Pflicht-Pfade einzeln gegen Fake-Driver, ohne ipcMain-Roundtrip:
//   1. Schema-Validation
//   2. Project-Resolution (PROJECT_NOT_FOUND)
//   3. has_git=0 (NOT_A_GIT_REPO bei status, hasGit=false bei diff)
//   4. Erfolgreicher Driver-Aufruf
//   5. Driver-Throw → Result-Err mit Code
//
// Der ipcMain.handle-Wrapper wird NICHT getestet — er ist eine dünne Adapter-Schicht;
// die Logik liegt in der inneren Function, die wir hier direkt aufrufbar machen.

// Wir replizieren hier die Handler-Logik 1:1 als testbare Funktionen, weil
// ipcMain.handle ohne echtes Electron-Environment nicht aufrufbar ist. Das ist
// dasselbe Pattern wie in tests/main/template-reader.test.ts.

import { ok, err, errFromUnknown } from '../../src/shared/result';
import type { ProjectRow } from '../../src/shared/types';

interface ProjectsLike {
  getById(id: string): ProjectRow | null;
}

function gitStatusHandler(deps: { projects: ProjectsLike; driver: GitDriver }) {
  return async (payload: unknown) => {
    try {
      const input = GitStatusInputSchema.parse(payload);
      const project = deps.projects.getById(input.projectId);
      if (!project) {
        return err(`Projekt ${input.projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
      }
      if (project.has_git === 0) {
        return err(
          `Projekt „${project.name}" ist kein Git-Repository`,
          'NOT_A_GIT_REPO',
        );
      }
      try {
        const status = await deps.driver.status(project.path);
        return ok(status);
      } catch (e) {
        return errFromUnknown(e, 'GIT_STATUS_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_STATUS');
    }
  };
}

function gitShowHandler(deps: { projects: ProjectsLike; driver: GitDriver }) {
  return async (payload: unknown) => {
    try {
      const input = GitShowInputSchema.parse(payload);
      const project = deps.projects.getById(input.projectId);
      if (!project) {
        return err(`Projekt ${input.projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
      }
      if (project.has_git === 0) {
        return ok({ content: '', hasGit: false });
      }
      try {
        const content = await deps.driver.showFile(project.path, input.relPath, input.ref);
        return ok({ content, hasGit: true });
      } catch (e) {
        return errFromUnknown(e, 'GIT_SHOW_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_SHOW');
    }
  };
}

function gitDiffHandler(deps: { projects: ProjectsLike; driver: GitDriver }) {
  return async (payload: unknown) => {
    try {
      const input = GitDiffInputSchema.parse(payload);
      const project = deps.projects.getById(input.projectId);
      if (!project) {
        return err(`Projekt ${input.projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
      }
      if (project.has_git === 0) {
        return ok({ patch: '', hasGit: false });
      }
      try {
        const patch = await deps.driver.diff(project.path, input.filePath);
        return ok({ patch, hasGit: true });
      } catch (e) {
        return errFromUnknown(e, 'GIT_DIFF_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_DIFF');
    }
  };
}

class FakeProjectRepo implements ProjectsLike {
  private readonly rows = new Map<string, ProjectRow>();

  add(row: ProjectRow): void {
    this.rows.set(row.id, row);
  }

  getById(id: string): ProjectRow | null {
    return this.rows.get(id) ?? null;
  }
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

const cleanStatus: GitStatusResult = {
  branch: 'main',
  files: [],
  ahead: 0,
  behind: 0,
};

const dirtyStatus: GitStatusResult = {
  branch: 'feature/sprint-7',
  files: [
    { path: 'src/foo.ts', worktreeStatus: 'modified', indexStatus: 'unchanged', insertions: 12, deletions: 3 },
    { path: 'docs/new.md', worktreeStatus: 'untracked', indexStatus: 'unchanged', insertions: null, deletions: null },
    { path: 'package.json', worktreeStatus: 'unchanged', indexStatus: 'modified', insertions: 1, deletions: 0 },
  ],
  ahead: 1,
  behind: 0,
};

class FakeGitDriver implements GitDriver {
  statusFn = vi.fn<(repoPath: string) => Promise<GitStatusResult>>().mockResolvedValue(
    cleanStatus,
  );
  diffFn = vi.fn<(repoPath: string, filePath?: string) => Promise<string>>().mockResolvedValue(
    '',
  );
  showFn = vi
    .fn<(repoPath: string, relPath: string, ref?: string) => Promise<string>>()
    .mockResolvedValue('');
  // Phase-2 Season-29 (Multi-Tab-Diff): drei neue Methoden im GitDriver.
  // Defaults sind harmlos — Tests, die die Pfade pruefen, ueberschreiben sie
  // via mockResolvedValueOnce.
  revParseFn = vi
    .fn<(repoPath: string, ref: string) => Promise<string | null>>()
    .mockResolvedValue(null);
  showStagedFn = vi
    .fn<(repoPath: string, relPath: string) => Promise<string>>()
    .mockResolvedValue('');
  changedFilesAgainstFn = vi
    .fn<(repoPath: string, baselineRef: string) => Promise<import('../../src/shared/types').GitFileChange[]>>()
    .mockResolvedValue([]);

  status(repoPath: string): Promise<GitStatusResult> {
    return this.statusFn(repoPath);
  }

  diff(repoPath: string, filePath?: string): Promise<string> {
    return this.diffFn(repoPath, filePath);
  }

  showFile(repoPath: string, relPath: string, ref?: string): Promise<string> {
    return this.showFn(repoPath, relPath, ref);
  }

  revParse(repoPath: string, ref: string): Promise<string | null> {
    return this.revParseFn(repoPath, ref);
  }

  showStagedFile(repoPath: string, relPath: string): Promise<string> {
    return this.showStagedFn(repoPath, relPath);
  }

  changedFilesAgainst(
    repoPath: string,
    baselineRef: string,
  ): Promise<import('../../src/shared/types').GitFileChange[]> {
    return this.changedFilesAgainstFn(repoPath, baselineRef);
  }
}

describe('git:status IPC-Pfad', () => {
  let projects: FakeProjectRepo;
  let driver: FakeGitDriver;
  let handler: ReturnType<typeof gitStatusHandler>;

  beforeEach(() => {
    projects = new FakeProjectRepo();
    driver = new FakeGitDriver();
    handler = gitStatusHandler({ projects, driver });
  });

  it('Schema lehnt fehlende projectId ab', async () => {
    const result = await handler({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('GIT_STATUS');
  });

  it('PROJECT_NOT_FOUND, wenn ID nicht in DB', async () => {
    const result = await handler({ projectId: 'unknown' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROJECT_NOT_FOUND');
  });

  it('NOT_A_GIT_REPO, wenn has_git=0', async () => {
    projects.add(buildProject({ id: 'p1', has_git: 0 }));
    const result = await handler({ projectId: 'p1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('NOT_A_GIT_REPO');
    expect(driver.statusFn).not.toHaveBeenCalled();
  });

  it('liefert Driver-Status durch, wenn alles passt', async () => {
    projects.add(buildProject({ id: 'p1', path: 'C:\\repos\\demo' }));
    driver.statusFn.mockResolvedValueOnce(dirtyStatus);
    const result = await handler({ projectId: 'p1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.branch).toBe('feature/sprint-7');
      expect(result.data.files).toHaveLength(3);
      expect(result.data.ahead).toBe(1);
    }
    expect(driver.statusFn).toHaveBeenCalledWith('C:\\repos\\demo');
  });

  it('Driver-Throw → GIT_STATUS_FAILED, kein Crash', async () => {
    projects.add(buildProject({ id: 'p1' }));
    driver.statusFn.mockRejectedValueOnce(new Error('not a git repository'));
    const result = await handler({ projectId: 'p1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('GIT_STATUS_FAILED');
  });
});

describe('git:diff IPC-Pfad', () => {
  let projects: FakeProjectRepo;
  let driver: FakeGitDriver;
  let handler: ReturnType<typeof gitDiffHandler>;

  beforeEach(() => {
    projects = new FakeProjectRepo();
    driver = new FakeGitDriver();
    handler = gitDiffHandler({ projects, driver });
  });

  it('PROJECT_NOT_FOUND, wenn ID unbekannt', async () => {
    const result = await handler({ projectId: 'ghost' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROJECT_NOT_FOUND');
  });

  it('hasGit=false bei has_git=0 — kein Driver-Aufruf, leerer Patch', async () => {
    projects.add(buildProject({ id: 'p1', has_git: 0 }));
    const result = await handler({ projectId: 'p1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hasGit).toBe(false);
      expect(result.data.patch).toBe('');
    }
    expect(driver.diffFn).not.toHaveBeenCalled();
  });

  it('liefert Patch durch, wenn Driver erfolgreich antwortet', async () => {
    projects.add(buildProject({ id: 'p1', path: 'C:\\repos\\demo' }));
    driver.diffFn.mockResolvedValueOnce('diff --git a/x b/x\n+hello');
    const result = await handler({ projectId: 'p1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hasGit).toBe(true);
      expect(result.data.patch).toContain('diff --git');
    }
    expect(driver.diffFn).toHaveBeenCalledWith('C:\\repos\\demo', undefined);
  });

  it('reicht filePath an den Driver durch, wenn übergeben', async () => {
    projects.add(buildProject({ id: 'p1', path: 'C:\\repos\\demo' }));
    driver.diffFn.mockResolvedValueOnce('--- a/foo.ts\n+++ b/foo.ts');
    await handler({ projectId: 'p1', filePath: 'src/foo.ts' });
    expect(driver.diffFn).toHaveBeenCalledWith('C:\\repos\\demo', 'src/foo.ts');
  });

  it('Driver-Throw → GIT_DIFF_FAILED', async () => {
    projects.add(buildProject({ id: 'p1' }));
    driver.diffFn.mockRejectedValueOnce(new Error('boom'));
    const result = await handler({ projectId: 'p1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('GIT_DIFF_FAILED');
  });
});

describe('git:show IPC-Pfad (Phase 6)', () => {
  let projects: FakeProjectRepo;
  let driver: FakeGitDriver;
  let handler: ReturnType<typeof gitShowHandler>;

  beforeEach(() => {
    projects = new FakeProjectRepo();
    driver = new FakeGitDriver();
    handler = gitShowHandler({ projects, driver });
  });

  it('liefert HEAD-Inhalt durch, wenn alles passt', async () => {
    projects.add(buildProject({ id: 'p1', path: 'C:\\repos\\demo' }));
    driver.showFn.mockResolvedValueOnce('# Original');
    const result = await handler({ projectId: 'p1', relPath: 'README.md' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.content).toBe('# Original');
      expect(result.data.hasGit).toBe(true);
    }
    expect(driver.showFn).toHaveBeenCalledWith('C:\\repos\\demo', 'README.md', undefined);
  });

  it('akzeptiert optionalen ref-Parameter', async () => {
    projects.add(buildProject({ id: 'p1' }));
    driver.showFn.mockResolvedValueOnce('older content');
    await handler({ projectId: 'p1', relPath: 'a.md', ref: 'main~1' });
    expect(driver.showFn).toHaveBeenCalledWith(
      expect.any(String),
      'a.md',
      'main~1',
    );
  });

  it('hasGit=false bei has_git=0 (kein Driver-Call)', async () => {
    projects.add(buildProject({ id: 'p1', has_git: 0 }));
    const result = await handler({ projectId: 'p1', relPath: 'a.md' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hasGit).toBe(false);
      expect(result.data.content).toBe('');
    }
    expect(driver.showFn).not.toHaveBeenCalled();
  });

  it('Driver-Throw → GIT_SHOW_FAILED', async () => {
    projects.add(buildProject({ id: 'p1' }));
    driver.showFn.mockRejectedValueOnce(new Error('boom'));
    const result = await handler({ projectId: 'p1', relPath: 'a.md' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('GIT_SHOW_FAILED');
  });
});
