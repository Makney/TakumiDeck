import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { GitStatusResult } from '../../src/shared/types';

// Bereich-PANELS-Review 2.2 (Variante A) — Tests fuer den gemeinsamen
// git:status-Store. Der Store fetcht via window.api.git.status und haelt das
// Ergebnis pro Projekt. Getestet werden:
//   - ok-Result → status gefuellt, hasGit=true
//   - NOT_A_GIT_REPO → status=null, hasGit=false (kein loadError)
//   - sonstiger Fehler → status=null, hasGit=true, loadError gesetzt
//   - hartes Promise-Reject → loadError aus der Exception, hasGit=true
//   - loading=true waehrend der IPC in flight ist
//   - Per-Projekt-Seq-Guard: eine veraltete (frueher gestartete) Antwort darf
//     eine neuere nicht ueberschreiben

// Minimaler GitStatusResult-Builder — nur das Feld, ueber das wir die zwei
// konkurrierenden Antworten im Seq-Test unterscheiden.
function mkStatus(branch: string): GitStatusResult {
  return { branch, files: [] } as unknown as GitStatusResult;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useGitStatusStore', () => {
  let statusFn: ReturnType<typeof vi.fn>;
  // Fresh Module pro Test, damit weder der Zustand-Store noch der modul-lokale
  // seqByProject-Zaehler zwischen Tests leakt (Zustand cached global).
  let store: typeof import('../../src/renderer/stores/gitStatus').useGitStatusStore;

  beforeEach(async () => {
    vi.resetModules();
    statusFn = vi.fn();
    (globalThis as unknown as { window: { api: unknown } }).window = {
      api: { git: { status: statusFn } },
    };
    const mod = await import('../../src/renderer/stores/gitStatus');
    store = mod.useGitStatusStore;
  });

  it('ok-Result fuellt status und setzt hasGit=true', async () => {
    statusFn.mockResolvedValue({ ok: true, data: mkStatus('main') });
    await store.getState().refresh('p1');
    const entry = store.getState().byProject.p1!;
    expect(entry.status).not.toBeNull();
    expect(entry.status!.branch).toBe('main');
    expect(entry.hasGit).toBe(true);
    expect(entry.loading).toBe(false);
    expect(entry.loadError).toBeNull();
  });

  it('NOT_A_GIT_REPO → status=null, hasGit=false, kein loadError', async () => {
    statusFn.mockResolvedValue({ ok: false, code: 'NOT_A_GIT_REPO', error: 'kein repo' });
    await store.getState().refresh('p1');
    const entry = store.getState().byProject.p1!;
    expect(entry.status).toBeNull();
    expect(entry.hasGit).toBe(false);
    expect(entry.loadError).toBeNull();
    expect(entry.loading).toBe(false);
  });

  it('sonstiger Fehler → status=null, hasGit=true, loadError gesetzt', async () => {
    statusFn.mockResolvedValue({ ok: false, code: 'GIT_FAILED', error: 'boom' });
    await store.getState().refresh('p1');
    const entry = store.getState().byProject.p1!;
    expect(entry.status).toBeNull();
    expect(entry.hasGit).toBe(true);
    expect(entry.loadError).toBe('boom');
    expect(entry.loading).toBe(false);
  });

  it('hartes Promise-Reject landet als loadError, hasGit bleibt true', async () => {
    statusFn.mockRejectedValue(new Error('IPC weg'));
    await store.getState().refresh('p1');
    const entry = store.getState().byProject.p1!;
    expect(entry.status).toBeNull();
    expect(entry.hasGit).toBe(true);
    expect(entry.loadError).toBe('IPC weg');
    expect(entry.loading).toBe(false);
  });

  it('setzt loading=true waehrend der IPC in flight ist', async () => {
    const d = deferred<{ ok: true; data: GitStatusResult }>();
    statusFn.mockReturnValue(d.promise);
    const pending = store.getState().refresh('p1');
    // Vor dem Resolve: loading muss true sein.
    expect(store.getState().byProject.p1!.loading).toBe(true);
    d.resolve({ ok: true, data: mkStatus('main') });
    await pending;
    expect(store.getState().byProject.p1!.loading).toBe(false);
  });

  it('Seq-Guard: veraltete Antwort ueberschreibt eine neuere nicht', async () => {
    const dOld = deferred<{ ok: true; data: GitStatusResult }>();
    const dNew = deferred<{ ok: true; data: GitStatusResult }>();
    statusFn.mockReturnValueOnce(dOld.promise).mockReturnValueOnce(dNew.promise);

    // Zwei refreshes fuers selbe Projekt — der zweite ist der juengste.
    const pOld = store.getState().refresh('p1');
    const pNew = store.getState().refresh('p1');

    // Der juengste Fetch antwortet zuerst und gewinnt.
    dNew.resolve({ ok: true, data: mkStatus('neuer-branch') });
    await pNew;
    expect(store.getState().byProject.p1!.status!.branch).toBe('neuer-branch');

    // Der veraltete Fetch antwortet danach — darf den State NICHT ueberschreiben.
    dOld.resolve({ ok: true, data: mkStatus('alter-branch') });
    await pOld;
    expect(store.getState().byProject.p1!.status!.branch).toBe('neuer-branch');
  });

  it('haelt Eintraege pro Projekt getrennt', async () => {
    statusFn.mockImplementation(({ projectId }: { projectId: string }) =>
      Promise.resolve({ ok: true, data: mkStatus(`branch-${projectId}`) }),
    );
    await store.getState().refresh('p1');
    await store.getState().refresh('p2');
    expect(store.getState().byProject.p1!.status!.branch).toBe('branch-p1');
    expect(store.getState().byProject.p2!.status!.branch).toBe('branch-p2');
  });
});
