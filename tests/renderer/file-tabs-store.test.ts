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
