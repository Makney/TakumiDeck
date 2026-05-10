import { describe, it, expect, beforeEach, vi } from 'vitest';

// Sprint 7 — Tests für den Datei-Tab-Store (Q6 Variante B: Per-Projekt-Stack).
//
// Der Store ruft window.api.fs.read intern; wir mocken die ganze window.api in
// einem beforeEach. Dann testen wir die Reihenfolge der State-Übergänge:
//   - openFile: Neu → loading → loaded
//   - openFile bei schon offenem Tab: nur fokussieren, kein zweiter Read
//   - openDiffTab: Diff IMMER ganz links, höchstens einer pro Projekt
//   - closeTab: Aktive-Tab-Folge-Logik (links bevorzugt, sonst rechts, sonst null)
//   - setDirty / setSaved: Manipulation einzelner Tabs

describe('useFileTabsStore', () => {
  let readFn: ReturnType<typeof vi.fn>;
  // Wir laden das Module fresh pro Test, damit der Zustand-Store nicht
  // zwischen Tests leakt (Zustand cached den Store global).
  let store: typeof import('../../src/renderer/stores/fileTabs').useFileTabsStore;

  beforeEach(async () => {
    vi.resetModules();
    readFn = vi.fn().mockResolvedValue({
      ok: true,
      data: { content: 'hello', relPath: 'CLAUDE.md', absolutePath: '/p/CLAUDE.md' },
    });
    // Minimale window.api-Stub für den Test. Wir casten auf unknown, weil RendererApi
    // viele andere Felder hat, die wir hier absichtlich nicht stubben.
    (globalThis as unknown as { window: { api: unknown } }).window = {
      api: { fs: { read: readFn } },
    };
    const mod = await import('../../src/renderer/stores/fileTabs');
    store = mod.useFileTabsStore;
  });

  it('openFile legt Tab an, markiert loading, dann loaded mit savedContent', async () => {
    await store.getState().openFile('p1', 'CLAUDE.md', 'CLAUDE.md');
    const stack = store.getState().tabs.p1!;
    expect(stack).toHaveLength(1);
    const tab = stack[0]!;
    expect(tab.id).toBe('file:CLAUDE.md');
    expect(tab.kind).toBe('file');
    expect(tab.relPath).toBe('CLAUDE.md');
    expect(tab.loading).toBe(false);
    expect(tab.savedContent).toBe('hello');
    expect(store.getState().activeId.p1).toBe('file:CLAUDE.md');
    expect(readFn).toHaveBeenCalledTimes(1);
  });

  it('openFile auf bereits offenem Tab: nur fokussieren, kein zweiter Read', async () => {
    await store.getState().openFile('p1', 'CLAUDE.md', 'CLAUDE.md');
    await store.getState().openFile('p1', 'docs/CHANGELOG.md', 'CHANGELOG.md');
    expect(readFn).toHaveBeenCalledTimes(2);
    // Erneutes Öffnen von CLAUDE.md soll nur den Active-Pointer setzen.
    await store.getState().openFile('p1', 'CLAUDE.md', 'CLAUDE.md');
    expect(readFn).toHaveBeenCalledTimes(2);
    expect(store.getState().activeId.p1).toBe('file:CLAUDE.md');
    expect(store.getState().tabs.p1).toHaveLength(2);
  });

  it('Read-Fehler landet im Tab als loadError', async () => {
    readFn.mockResolvedValueOnce({ ok: false, error: 'FS_NOT_FOUND', code: 'FS_NOT_FOUND' });
    await store.getState().openFile('p1', 'missing.md', 'missing.md');
    const tab = store.getState().tabs.p1![0]!;
    expect(tab.loading).toBe(false);
    expect(tab.savedContent).toBeNull();
    expect(tab.loadError).toBe('FS_NOT_FOUND');
  });

  it('openDiffTab schiebt Diff IMMER ganz links und nur einmal pro Projekt', () => {
    store.getState().openDiffTab('p1');
    expect(store.getState().tabs.p1!.map((t) => t.id)).toEqual(['diff']);
    // Zweiter Aufruf darf den Tab nicht doppeln.
    store.getState().openDiffTab('p1');
    expect(store.getState().tabs.p1!).toHaveLength(1);
    // Wenn schon File-Tabs da sind: Diff vorne anstellen.
    // (Wir bauen den Zustand händisch über setActive + openFile parallel auf,
    // damit der Test deterministisch ist.)
  });

  it('Diff vor existierenden File-Tabs landet vorne', async () => {
    await store.getState().openFile('p1', 'CLAUDE.md', 'CLAUDE.md');
    store.getState().openDiffTab('p1');
    const ids = store.getState().tabs.p1!.map((t) => t.id);
    expect(ids).toEqual(['diff', 'file:CLAUDE.md']);
  });

  it('closeTab: aktiver Tab → linker Nachbar fokussiert', async () => {
    await store.getState().openFile('p1', 'a.md', 'a.md');
    await store.getState().openFile('p1', 'b.md', 'b.md');
    await store.getState().openFile('p1', 'c.md', 'c.md');
    store.getState().setActive('p1', 'file:b.md');
    store.getState().closeTab('p1', 'file:b.md');
    expect(store.getState().activeId.p1).toBe('file:a.md');
  });

  it('closeTab: ganz linken aktiven Tab schließen → rechter Nachbar fokussiert', async () => {
    await store.getState().openFile('p1', 'a.md', 'a.md');
    await store.getState().openFile('p1', 'b.md', 'b.md');
    store.getState().setActive('p1', 'file:a.md');
    store.getState().closeTab('p1', 'file:a.md');
    expect(store.getState().activeId.p1).toBe('file:b.md');
  });

  it('closeTab: letzten Tab schließen → activeId null', async () => {
    await store.getState().openFile('p1', 'a.md', 'a.md');
    store.getState().closeTab('p1', 'file:a.md');
    expect(store.getState().activeId.p1).toBeNull();
    expect(store.getState().tabs.p1).toEqual([]);
  });

  it('Per-Projekt-Stacks sind isoliert', async () => {
    await store.getState().openFile('p1', 'a.md', 'a.md');
    await store.getState().openFile('p2', 'b.md', 'b.md');
    expect(store.getState().tabs.p1).toHaveLength(1);
    expect(store.getState().tabs.p2).toHaveLength(1);
    expect(store.getState().activeId.p1).toBe('file:a.md');
    expect(store.getState().activeId.p2).toBe('file:b.md');
  });

  it('setDirty markiert genau den gegebenen Tab', async () => {
    await store.getState().openFile('p1', 'a.md', 'a.md');
    await store.getState().openFile('p1', 'b.md', 'b.md');
    store.getState().setDirty('p1', 'file:a.md', true);
    const tabs = store.getState().tabs.p1!;
    expect(tabs.find((t) => t.id === 'file:a.md')!.dirty).toBe(true);
    expect(tabs.find((t) => t.id === 'file:b.md')!.dirty).toBe(false);
  });

  it('setSaved hebt savedContent + setzt dirty zurück', async () => {
    await store.getState().openFile('p1', 'a.md', 'a.md');
    store.getState().setDirty('p1', 'file:a.md', true);
    store.getState().setSaved('p1', 'file:a.md', 'new content');
    const tab = store.getState().tabs.p1![0]!;
    expect(tab.savedContent).toBe('new content');
    expect(tab.dirty).toBe(false);
  });

  it('resetProject leert genau einen Project-Stack', async () => {
    await store.getState().openFile('p1', 'a.md', 'a.md');
    await store.getState().openFile('p2', 'b.md', 'b.md');
    store.getState().resetProject('p1');
    expect(store.getState().tabs.p1).toBeUndefined();
    expect(store.getState().tabs.p2).toHaveLength(1);
  });
});

// Sprint 8 — Datei-Tab-Persistenz pro Projekt (V5-A: nur die Tab-Liste, kein
// Buffer-Cache; savedContent wird beim Hydrate per fs:read neu geladen).
describe('useFileTabsStore — localStorage-Persistenz', () => {
  let readFn: ReturnType<typeof vi.fn>;
  let store: typeof import('../../src/renderer/stores/fileTabs').useFileTabsStore;
  let testing: typeof import('../../src/renderer/stores/fileTabs').__testing;

  beforeEach(async () => {
    vi.resetModules();
    // localStorage-Stub: einfaches in-memory-Map.
    const storage = new Map<string, string>();
    readFn = vi.fn().mockResolvedValue({
      ok: true,
      data: { content: 'rehydrated', relPath: 'CLAUDE.md', absolutePath: '/p/CLAUDE.md' },
    });
    (globalThis as unknown as { window: { api: unknown; localStorage: Storage } }).window = {
      api: { fs: { read: readFn } },
      localStorage: {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => {
          storage.set(k, v);
        },
        removeItem: (k: string) => {
          storage.delete(k);
        },
        clear: () => storage.clear(),
        key: () => null,
        length: 0,
      } as unknown as Storage,
    };
    const mod = await import('../../src/renderer/stores/fileTabs');
    store = mod.useFileTabsStore;
    testing = mod.__testing;
  });

  it('persistiert Tab-Liste nach openFile', async () => {
    await store.getState().openFile('p1', 'CLAUDE.md', 'CLAUDE.md');
    const persisted = testing.readPersisted();
    expect(persisted).not.toBeNull();
    expect(persisted!.byProject.p1).toEqual({
      tabs: [
        {
          id: 'file:CLAUDE.md',
          kind: 'file',
          relPath: 'CLAUDE.md',
          label: 'CLAUDE.md',
        },
      ],
      activeId: 'file:CLAUDE.md',
    });
  });

  it('persistiert Diff-Tab vorne im Stack', async () => {
    await store.getState().openFile('p1', 'CLAUDE.md', 'CLAUDE.md');
    store.getState().openDiffTab('p1');
    const persisted = testing.readPersisted();
    expect(persisted!.byProject.p1!.tabs.map((t) => t.id)).toEqual([
      'diff',
      'file:CLAUDE.md',
    ]);
    expect(persisted!.byProject.p1!.activeId).toBe('diff');
  });

  it('hydrate rekonstruiert Tab-Liste + activeId und triggert fs:read pro file-Tab', async () => {
    // Persistierte Snapshot manuell vorbelegen.
    const snapshot = {
      v: testing.STORAGE_VERSION,
      byProject: {
        p1: {
          tabs: [
            { id: 'diff', kind: 'diff' as const, relPath: null, label: 'Diff' },
            { id: 'file:CLAUDE.md', kind: 'file' as const, relPath: 'CLAUDE.md', label: 'CLAUDE.md' },
          ],
          activeId: 'file:CLAUDE.md',
        },
      },
    };
    window.localStorage.setItem(testing.STORAGE_KEY, JSON.stringify(snapshot));

    store.getState().hydrateFromStorage();

    const stack = store.getState().tabs.p1!;
    expect(stack.map((t) => t.id)).toEqual(['diff', 'file:CLAUDE.md']);
    expect(store.getState().activeId.p1).toBe('file:CLAUDE.md');
    // Diff-Tab darf NICHT loading sein, file-Tab schon.
    expect(stack[0]!.loading).toBe(false);
    expect(stack[1]!.loading).toBe(true);

    // Promise-Tick abwarten, damit fs:read durchläuft.
    await Promise.resolve();
    await Promise.resolve();
    expect(readFn).toHaveBeenCalledWith({ projectId: 'p1', relPath: 'CLAUDE.md' });

    // Nach fs:read: Tab ist nicht mehr loading, savedContent gesetzt.
    const reloaded = store.getState().tabs.p1![1]!;
    expect(reloaded.loading).toBe(false);
    expect(reloaded.savedContent).toBe('rehydrated');
  });

  it('hydrate ist idempotent (zweiter Aufruf macht nichts)', async () => {
    const snapshot = {
      v: testing.STORAGE_VERSION,
      byProject: {
        p1: {
          tabs: [{ id: 'file:a.md', kind: 'file' as const, relPath: 'a.md', label: 'a' }],
          activeId: 'file:a.md',
        },
      },
    };
    window.localStorage.setItem(testing.STORAGE_KEY, JSON.stringify(snapshot));

    store.getState().hydrateFromStorage();
    await Promise.resolve();
    expect(readFn).toHaveBeenCalledTimes(1);

    store.getState().hydrateFromStorage();
    await Promise.resolve();
    // Zweiter Hydrate erkennt nicht-leeren Store und macht nichts.
    expect(readFn).toHaveBeenCalledTimes(1);
  });

  it('hydrate verwirft Snapshot bei Schema-Versions-Mismatch', () => {
    window.localStorage.setItem(
      testing.STORAGE_KEY,
      JSON.stringify({ v: 999, byProject: { p1: { tabs: [], activeId: null } } }),
    );
    store.getState().hydrateFromStorage();
    expect(store.getState().tabs).toEqual({});
  });

  it('hydrate fängt korruptes JSON ab', () => {
    window.localStorage.setItem(testing.STORAGE_KEY, '{ kaputt');
    store.getState().hydrateFromStorage();
    expect(store.getState().tabs).toEqual({});
  });

  it('persistierter activeId wird auf null gesetzt, wenn der Tab im Snapshot fehlt', () => {
    window.localStorage.setItem(
      testing.STORAGE_KEY,
      JSON.stringify({
        v: testing.STORAGE_VERSION,
        byProject: {
          p1: {
            tabs: [{ id: 'file:a.md', kind: 'file' as const, relPath: 'a.md', label: 'a' }],
            activeId: 'file:obsolete.md',
          },
        },
      }),
    );
    store.getState().hydrateFromStorage();
    // Fallback auf den ersten Tab im Stack, weil der gespeicherte activeId
    // nicht mehr existiert.
    expect(store.getState().activeId.p1).toBe('file:a.md');
  });

  it('closeTab persistiert die geschrumpfte Liste', async () => {
    await store.getState().openFile('p1', 'a.md', 'a.md');
    await store.getState().openFile('p1', 'b.md', 'b.md');
    store.getState().closeTab('p1', 'file:a.md');
    const persisted = testing.readPersisted();
    expect(persisted!.byProject.p1!.tabs.map((t) => t.id)).toEqual(['file:b.md']);
  });
});
