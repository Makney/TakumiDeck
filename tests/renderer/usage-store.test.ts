import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { UsageContextResult } from '../../src/shared/types';

// W1/V3-Tests (STORES-Review 2026-05-31): contextBySession darf nicht ueber die
// App-Lebenszeit mit Eintraegen geschlossener Sessions zuwachsen. Getestet:
//   - refreshContext schreibt den Per-Session-Eintrag
//   - pruneContext entfernt ihn wieder (W1)
//   - pruneContext auf unbekannte id ist ein referenz-stabiler No-op
//   - Seq-Guard: ein in-flight refreshContext, danach pruneContext, dann Resolve
//     → der verspaetete Write re-erzeugt KEINEN toten Eintrag (V3)
//   - Integration: sessions.closeTab ruft pruneContext fuer die geschlossene Session

// Minimaler UsageContextResult-Builder — nur ein Feld, das wir brauchen, um die
// Praesenz eines Eintrags zu pruefen.
function mkCtx(pct: number): UsageContextResult {
  return { percent: pct } as unknown as UsageContextResult;
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

describe('useUsageStore — contextBySession Cleanup', () => {
  let contextFn: ReturnType<typeof vi.fn>;
  // Fresh Module pro Test, damit weder der Zustand-Store noch die modul-lokale
  // contextSeqBySession-Map zwischen Tests leakt (Zustand cached global).
  let usage: typeof import('../../src/renderer/stores/usage');
  let sessions: typeof import('../../src/renderer/stores/sessions');

  beforeEach(async () => {
    vi.resetModules();
    contextFn = vi.fn();
    (globalThis as unknown as { window: { api: unknown } }).window = {
      api: { usage: { context: contextFn } },
    };
    usage = await import('../../src/renderer/stores/usage');
    sessions = await import('../../src/renderer/stores/sessions');
  });

  it('refreshContext schreibt den Per-Session-Eintrag', async () => {
    contextFn.mockResolvedValue({ ok: true, data: mkCtx(42) });
    await usage.useUsageStore.getState().refreshContext('s1');
    expect(usage.useUsageStore.getState().contextBySession.s1).toBeDefined();
  });

  it('pruneContext entfernt den Eintrag wieder', async () => {
    contextFn.mockResolvedValue({ ok: true, data: mkCtx(42) });
    await usage.useUsageStore.getState().refreshContext('s1');
    usage.useUsageStore.getState().pruneContext('s1');
    expect(usage.useUsageStore.getState().contextBySession.s1).toBeUndefined();
  });

  it('pruneContext auf unbekannte id ist ein referenz-stabiler No-op', () => {
    const before = usage.useUsageStore.getState().contextBySession;
    usage.useUsageStore.getState().pruneContext('does-not-exist');
    // Kein State-Write, wenn nichts zu entfernen war — die Map-Referenz bleibt gleich.
    expect(usage.useUsageStore.getState().contextBySession).toBe(before);
  });

  it('Seq-Guard: pruneContext invalidiert einen in-flight refreshContext', async () => {
    const d = deferred<{ ok: true; data: UsageContextResult }>();
    contextFn.mockReturnValue(d.promise);
    const pending = usage.useUsageStore.getState().refreshContext('s1');
    // Tab wird geschlossen, waehrend der context-IPC noch laeuft.
    usage.useUsageStore.getState().pruneContext('s1');
    // Verspaetete Antwort trifft ein — darf KEINEN Eintrag re-erzeugen.
    d.resolve({ ok: true, data: mkCtx(99) });
    await pending;
    expect(usage.useUsageStore.getState().contextBySession.s1).toBeUndefined();
  });

  it('sessions.closeTab ruft pruneContext fuer die geschlossene Session', async () => {
    contextFn.mockResolvedValue({ ok: true, data: mkCtx(42) });
    const tab = sessions.useSessionStore.getState().addTab({
      sessionId: 's1',
      projectId: 'p1',
      title: 'T',
      type: 'feature',
      model: 'claude-sonnet-4-6',
    });
    await usage.useUsageStore.getState().refreshContext('s1');
    expect(usage.useUsageStore.getState().contextBySession.s1).toBeDefined();

    sessions.useSessionStore.getState().closeTab(tab.sessionId);
    expect(usage.useUsageStore.getState().contextBySession.s1).toBeUndefined();
  });
});
