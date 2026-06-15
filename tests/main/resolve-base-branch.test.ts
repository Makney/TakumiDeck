import { describe, it, expect, beforeEach, vi } from 'vitest';

// Season 37 (Worktree-Support) — Regression fuer resolveBaseBranchRef.
//
// Scope laut Working Rule #4: nur der hier reparierte Pfad. Der Bug: simple-git
// wirft bei einem fehlenden Branch NICHT, sondern liefert wegen `--quiet` einen
// leeren String. Dadurch akzeptierte resolveBaseBranchRef faelschlich 'main',
// auch in reinen master-Repos — der Worktree-Diff verglich dann gegen ein nicht
// existierendes 'main', der git-diff schlug fehl, und nur Untracked-Files
// ueberlebten (geaenderte Bestandsdateien fielen aus der Liste).

// simple-git wird modulweit gemockt — wir steuern revparse/symbolic-ref pro Test
// ueber die Map unten.
const revparseImpl = { fn: vi.fn() };
const symbolicRefImpl = { fn: vi.fn() };

vi.mock('simple-git', () => ({
  simpleGit: () => ({
    revparse: (args: string[]) => revparseImpl.fn(args),
    raw: (args: string[]) => symbolicRefImpl.fn(args),
  }),
}));

// Erst nach vi.mock importieren, damit der Driver den Mock zieht.
const { realGitDriver } = await import('../../src/main/git/driver');

// Liefert die SHA zurueck, wenn `refs/heads/<branch>` in `existing` steht, sonst
// '' — exakt das Verhalten von `git rev-parse --verify --quiet` bei fehlendem
// Branch (Exit 1 ohne stderr, simple-git gibt '' zurueck statt zu werfen).
function existingBranches(existing: Record<string, string>) {
  return (args: string[]) => {
    const ref = args[args.length - 1] ?? '';
    const name = ref.replace(/^refs\/heads\//, '');
    return Promise.resolve(existing[name] ?? '');
  };
}

describe('realGitDriver.resolveBaseBranchRef', () => {
  beforeEach(() => {
    revparseImpl.fn.mockReset();
    symbolicRefImpl.fn.mockReset();
    symbolicRefImpl.fn.mockRejectedValue(new Error('no origin/HEAD'));
  });

  it('faellt auf master zurueck, wenn main NICHT existiert (Regression: leerer String != Treffer)', async () => {
    revparseImpl.fn.mockImplementation(
      existingBranches({ master: 'e047a8ee959dfb13dd761ff5cdf2c5bf326b03a9' }),
    );
    const ref = await realGitDriver.resolveBaseBranchRef('/repo');
    expect(ref).toBe('master');
  });

  it('bevorzugt main, wenn es existiert', async () => {
    revparseImpl.fn.mockImplementation(
      existingBranches({ main: 'aaa', master: 'bbb' }),
    );
    const ref = await realGitDriver.resolveBaseBranchRef('/repo');
    expect(ref).toBe('main');
  });

  it('faellt auf origin/HEAD zurueck, wenn weder main noch master existieren', async () => {
    revparseImpl.fn.mockImplementation(existingBranches({}));
    symbolicRefImpl.fn.mockResolvedValue('origin/develop\n');
    const ref = await realGitDriver.resolveBaseBranchRef('/repo');
    expect(ref).toBe('origin/develop');
  });

  it('liefert HEAD als letzten Fallback', async () => {
    revparseImpl.fn.mockImplementation(existingBranches({}));
    const ref = await realGitDriver.resolveBaseBranchRef('/repo');
    expect(ref).toBe('HEAD');
  });
});
