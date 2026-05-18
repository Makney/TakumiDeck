import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GitDriver } from '../../src/main/git/driver';
import type { GitFileChange, GitStatusResult, ProjectRow, SessionRow } from '../../src/shared/types';
import { InMemorySessionDriver, SessionRepository } from '../../src/main/db/repos/sessions';
import {
  isSkippedPath,
  toRelativePath,
  PROJECT_WATCH_SKIP_DIRS,
} from '../../src/main/fs/project-watcher';
import {
  GitShowStagedInputSchema,
  GitSessionDiffInputSchema,
} from '../../src/shared/schemas';
import { ok, err, errFromUnknown } from '../../src/shared/result';

// Phase-2 Season-29 Multi-Tab-Diff — Tests fuer die neuen Pfade.
//
// Scope laut Working Rule #4: nur die in dieser Season hinzugekommenen Pfade.
// Bestehende Working-Tree-Diff-Pfade haben weiterhin ihre Tests in git-ipc.test.ts;
// hier kommen nur:
//   1. SessionRepository.setStartCommitSha — idempotenter UPDATE
//   2. git:show-staged IPC-Handler — Schema + Driver-Roundtrip + Error-Pfade
//   3. git:session-diff IPC-Handler — Session-Lookup, Baseline-NULL-Pfad,
//      Driver-Roundtrip, Errors
//   4. ProjectFilesWatcher pure Helpers (isSkippedPath, toRelativePath)

// ============================================================ test fixtures

const baseSession: SessionRow = {
  id: 'sess-1',
  project_id: 'p1',
  title: 'Test',
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
};

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

interface ProjectsLike {
  getById(id: string): ProjectRow | null;
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

interface SessionsLike {
  findById(id: string): SessionRow | null;
}

class FakeSessionRepo implements SessionsLike {
  private readonly rows = new Map<string, SessionRow>();
  add(row: SessionRow): void {
    this.rows.set(row.id, row);
  }
  findById(id: string): SessionRow | null {
    return this.rows.get(id) ?? null;
  }
}

// Minimaler GitDriver-Fake mit allen Methoden, die Season 29 anfasst.
class FakeGitDriver implements GitDriver {
  statusFn = vi.fn<(repoPath: string) => Promise<GitStatusResult>>().mockResolvedValue({
    branch: 'main',
    files: [],
    ahead: 0,
    behind: 0,
  });
  diffFn = vi.fn<(repoPath: string, filePath?: string) => Promise<string>>().mockResolvedValue('');
  showFn = vi
    .fn<(repoPath: string, relPath: string, ref?: string) => Promise<string>>()
    .mockResolvedValue('');
  revParseFn = vi
    .fn<(repoPath: string, ref: string) => Promise<string | null>>()
    .mockResolvedValue('abc123');
  showStagedFn = vi
    .fn<(repoPath: string, relPath: string) => Promise<string>>()
    .mockResolvedValue('staged content');
  changedFilesAgainstFn = vi
    .fn<(repoPath: string, baselineRef: string) => Promise<GitFileChange[]>>()
    .mockResolvedValue([]);

  status(repoPath: string) {
    return this.statusFn(repoPath);
  }
  diff(repoPath: string, filePath?: string) {
    return this.diffFn(repoPath, filePath);
  }
  showFile(repoPath: string, relPath: string, ref?: string) {
    return this.showFn(repoPath, relPath, ref);
  }
  revParse(repoPath: string, ref: string) {
    return this.revParseFn(repoPath, ref);
  }
  showStagedFile(repoPath: string, relPath: string) {
    return this.showStagedFn(repoPath, relPath);
  }
  changedFilesAgainst(repoPath: string, baselineRef: string) {
    return this.changedFilesAgainstFn(repoPath, baselineRef);
  }
}

// Die git-ipc.ts-Handler nutzen ipcMain.handle, das ohne Electron-Env nicht
// aufrufbar ist. Wir replizieren die Logik der zwei neuen Handler hier
// inline — exakt wie die git-ipc.test.ts es seit Sprint 7 macht.

function gitShowStagedHandler(deps: { projects: ProjectsLike; driver: GitDriver }) {
  return async (payload: unknown) => {
    try {
      const input = GitShowStagedInputSchema.parse(payload);
      const project = deps.projects.getById(input.projectId);
      if (!project) {
        return err(`Projekt ${input.projectId} nicht gefunden`, 'PROJECT_NOT_FOUND');
      }
      if (project.has_git === 0) {
        return ok({ content: '', hasGit: false });
      }
      try {
        const content = await deps.driver.showStagedFile(project.path, input.relPath);
        return ok({ content, hasGit: true });
      } catch (e) {
        return errFromUnknown(e, 'GIT_SHOW_STAGED_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_SHOW_STAGED');
    }
  };
}

function gitSessionDiffHandler(deps: {
  projects: ProjectsLike;
  sessions: SessionsLike;
  driver: GitDriver;
}) {
  return async (payload: unknown) => {
    try {
      const input = GitSessionDiffInputSchema.parse(payload);
      const session = deps.sessions.findById(input.sessionId);
      if (!session) {
        return err(`Session ${input.sessionId} nicht gefunden`, 'SESSION_NOT_FOUND');
      }
      const project = deps.projects.getById(session.project_id);
      if (!project) {
        return err(`Projekt ${session.project_id} nicht gefunden`, 'PROJECT_NOT_FOUND');
      }
      if (project.has_git === 0 || session.start_commit_sha === null) {
        return ok({
          hasBaseline: false,
          baselineSha: null,
          branch: '',
          files: [] as GitFileChange[],
        });
      }
      try {
        const status = await deps.driver.status(project.path);
        const files = await deps.driver.changedFilesAgainst(
          project.path,
          session.start_commit_sha,
        );
        return ok({
          hasBaseline: true,
          baselineSha: session.start_commit_sha,
          branch: status.branch,
          files,
        });
      } catch (e) {
        return errFromUnknown(e, 'GIT_SESSION_DIFF_FAILED');
      }
    } catch (e) {
      return errFromUnknown(e, 'GIT_SESSION_DIFF');
    }
  };
}

// ============================================================ tests

describe('SessionRepository.setStartCommitSha — Phase-2 Season-29', () => {
  function makeRepo(): { repo: SessionRepository; driver: InMemorySessionDriver } {
    const driver = new InMemorySessionDriver();
    return { repo: new SessionRepository(driver), driver };
  }

  it('setzt den SHA, wenn die Spalte aktuell null ist', () => {
    const { repo, driver } = makeRepo();
    driver.insert({ ...baseSession });
    expect(repo.setStartCommitSha('sess-1', 'abc123')).toBe(true);
    expect(driver.findById('sess-1')?.start_commit_sha).toBe('abc123');
  });

  it('ueberschreibt NICHT, wenn der SHA schon gesetzt ist (Idempotenz)', () => {
    const { repo, driver } = makeRepo();
    driver.insert({ ...baseSession, start_commit_sha: 'first-sha' });
    expect(repo.setStartCommitSha('sess-1', 'second-sha')).toBe(false);
    expect(driver.findById('sess-1')?.start_commit_sha).toBe('first-sha');
  });

  it('returnt false bei nicht-existenter Session', () => {
    const { repo } = makeRepo();
    expect(repo.setStartCommitSha('ghost', 'abc')).toBe(false);
  });
});

describe('git:show-staged IPC-Pfad — Phase-2 Season-29', () => {
  let projects: FakeProjectRepo;
  let driver: FakeGitDriver;
  let handler: ReturnType<typeof gitShowStagedHandler>;

  beforeEach(() => {
    projects = new FakeProjectRepo();
    driver = new FakeGitDriver();
    handler = gitShowStagedHandler({ projects, driver });
  });

  it('Schema lehnt fehlende Felder ab', async () => {
    const result = await handler({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('GIT_SHOW_STAGED');
  });

  it('PROJECT_NOT_FOUND, wenn ID unbekannt', async () => {
    const result = await handler({ projectId: 'ghost', relPath: 'a.md' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('PROJECT_NOT_FOUND');
  });

  it('hasGit=false bei has_git=0 (kein Driver-Call)', async () => {
    projects.add(buildProject({ has_git: 0 }));
    const result = await handler({ projectId: 'p1', relPath: 'a.md' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hasGit).toBe(false);
      expect(result.data.content).toBe('');
    }
    expect(driver.showStagedFn).not.toHaveBeenCalled();
  });

  it('liefert Index-Inhalt durch, wenn Driver erfolgreich antwortet', async () => {
    projects.add(buildProject({ path: 'C:\\repos\\demo' }));
    driver.showStagedFn.mockResolvedValueOnce('# staged version');
    const result = await handler({ projectId: 'p1', relPath: 'README.md' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.content).toBe('# staged version');
      expect(result.data.hasGit).toBe(true);
    }
    expect(driver.showStagedFn).toHaveBeenCalledWith('C:\\repos\\demo', 'README.md');
  });

  it('Driver-Throw → GIT_SHOW_STAGED_FAILED', async () => {
    projects.add(buildProject());
    driver.showStagedFn.mockRejectedValueOnce(new Error('boom'));
    const result = await handler({ projectId: 'p1', relPath: 'a.md' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('GIT_SHOW_STAGED_FAILED');
  });
});

describe('git:session-diff IPC-Pfad — Phase-2 Season-29', () => {
  let projects: FakeProjectRepo;
  let sessions: FakeSessionRepo;
  let driver: FakeGitDriver;
  let handler: ReturnType<typeof gitSessionDiffHandler>;

  beforeEach(() => {
    projects = new FakeProjectRepo();
    sessions = new FakeSessionRepo();
    driver = new FakeGitDriver();
    handler = gitSessionDiffHandler({ projects, sessions, driver });
  });

  it('SESSION_NOT_FOUND, wenn Session unbekannt', async () => {
    const result = await handler({ sessionId: 'ghost' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('SESSION_NOT_FOUND');
  });

  it('hasBaseline=false, wenn start_commit_sha null ist (Legacy)', async () => {
    sessions.add({ ...baseSession, start_commit_sha: null });
    projects.add(buildProject());
    const result = await handler({ sessionId: 'sess-1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hasBaseline).toBe(false);
      expect(result.data.baselineSha).toBeNull();
      expect(result.data.files).toEqual([]);
    }
    // Driver darf bei fehlender Baseline NICHT aufgerufen werden — sonst
    // wuerden Legacy-Sessions teure status()-Roundtrips ausloesen.
    expect(driver.changedFilesAgainstFn).not.toHaveBeenCalled();
    expect(driver.statusFn).not.toHaveBeenCalled();
  });

  it('hasBaseline=false bei has_git=0 (kein Driver-Call)', async () => {
    sessions.add({ ...baseSession, start_commit_sha: 'abc123' });
    projects.add(buildProject({ has_git: 0 }));
    const result = await handler({ sessionId: 'sess-1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hasBaseline).toBe(false);
    }
    expect(driver.changedFilesAgainstFn).not.toHaveBeenCalled();
  });

  it('liefert Branch + Files durch, wenn Baseline gesetzt ist', async () => {
    sessions.add({ ...baseSession, start_commit_sha: 'abc123' });
    projects.add(buildProject({ path: 'C:\\repos\\demo' }));
    driver.statusFn.mockResolvedValueOnce({
      branch: 'feature/multi-tab-diff',
      files: [],
      ahead: 0,
      behind: 0,
    });
    driver.changedFilesAgainstFn.mockResolvedValueOnce([
      {
        path: 'src/new-feature.ts',
        worktreeStatus: 'modified',
        indexStatus: 'unchanged',
        insertions: 42,
        deletions: 3,
      },
    ]);
    const result = await handler({ sessionId: 'sess-1' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.hasBaseline).toBe(true);
      expect(result.data.baselineSha).toBe('abc123');
      expect(result.data.branch).toBe('feature/multi-tab-diff');
      expect(result.data.files).toHaveLength(1);
      expect(result.data.files[0]?.path).toBe('src/new-feature.ts');
    }
    expect(driver.changedFilesAgainstFn).toHaveBeenCalledWith('C:\\repos\\demo', 'abc123');
  });

  it('Driver-Throw → GIT_SESSION_DIFF_FAILED', async () => {
    sessions.add({ ...baseSession, start_commit_sha: 'abc123' });
    projects.add(buildProject());
    driver.changedFilesAgainstFn.mockRejectedValueOnce(new Error('boom'));
    const result = await handler({ sessionId: 'sess-1' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('GIT_SESSION_DIFF_FAILED');
  });
});

describe('ProjectFilesWatcher — Skip-List + Pfad-Normalisierung', () => {
  const projectPath = 'D:\\Projekte\\Demo';

  it('isSkippedPath erkennt alle Standard-Skip-Verzeichnisse', () => {
    // Jeder Eintrag der Skip-Liste muss einen Treffer in beliebiger
    // Tiefe ergeben (Watcher iteriert die Pfad-Segmente).
    for (const dir of PROJECT_WATCH_SKIP_DIRS) {
      expect(isSkippedPath(`${projectPath}\\${dir}\\foo.ts`, projectPath)).toBe(true);
      expect(isSkippedPath(`${projectPath}\\src\\${dir}\\nested.json`, projectPath)).toBe(true);
    }
  });

  it('isSkippedPath laesst gewoehnliche Source-Files durch', () => {
    expect(isSkippedPath(`${projectPath}\\src\\index.ts`, projectPath)).toBe(false);
    expect(isSkippedPath(`${projectPath}\\docs\\CHANGELOG.md`, projectPath)).toBe(false);
    expect(isSkippedPath(`${projectPath}\\package.json`, projectPath)).toBe(false);
  });

  it('isSkippedPath erkennt Pfade ausserhalb des Roots als nicht-skippable', () => {
    // Defensiv: wenn chokidar irrtuemlich einen Pfad ausserhalb liefert
    // (Symlinks o.ae.), soll der Filter nicht falschlich blocken.
    expect(isSkippedPath('C:\\anders\\foo.ts', projectPath)).toBe(false);
  });

  it('toRelativePath liefert Forward-Slash-Notation projektrelativ', () => {
    expect(toRelativePath(`${projectPath}\\docs\\CHANGELOG.md`, projectPath)).toBe(
      'docs/CHANGELOG.md',
    );
    expect(toRelativePath(`${projectPath}\\package.json`, projectPath)).toBe('package.json');
  });
});
