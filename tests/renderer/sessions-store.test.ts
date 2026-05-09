import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSessionStore } from '../../src/renderer/stores/sessions';

// Vor jedem Test den Store auf den Default-State zurücksetzen — Zustand persistiert
// sonst zwischen Tests innerhalb derselben Datei (Modul-State).
beforeEach(() => {
  useSessionStore.setState({ tabs: [], activeId: null });
});

const baseInput = {
  title: 'Tab',
  type: 'feature' as const,
  model: 'claude-sonnet-4-6',
  cwd: 'C:\\Test',
};

describe('useSessionStore.addTab', () => {
  it('generiert UUID, wenn keine sessionId mitgegeben wurde', () => {
    const tab = useSessionStore.getState().addTab(baseInput);
    expect(tab.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it('verwendet eine vorgegebene sessionId 1:1 (Resume-Pfad)', () => {
    const tab = useSessionStore.getState().addTab({ ...baseInput, sessionId: 'fixed-id' });
    expect(tab.sessionId).toBe('fixed-id');
  });

  it('aktiviert den neu hinzugefügten Tab', () => {
    const tab = useSessionStore.getState().addTab(baseInput);
    expect(useSessionStore.getState().activeId).toBe(tab.sessionId);
  });

  it('setzt status running und leere Notes als Default', () => {
    const tab = useSessionStore.getState().addTab(baseInput);
    expect(tab.status).toBe('running');
    expect(tab.notesDraft).toBe('');
    expect(tab.notesSaved).toBe('');
  });
});

describe('useSessionStore.closeTab', () => {
  it('entfernt den geschlossenen Tab aus der Liste', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    const b = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().closeTab(a.sessionId);
    const remaining = useSessionStore.getState().tabs.map((t) => t.sessionId);
    expect(remaining).toEqual([b.sessionId]);
  });

  it('rotiert activeId auf den linken Nachbarn, wenn der aktive Tab geschlossen wird', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    const b = useSessionStore.getState().addTab(baseInput);
    const c = useSessionStore.getState().addTab(baseInput);
    // c ist gerade aktiv. Schließen → b sollte aktiv werden.
    expect(useSessionStore.getState().activeId).toBe(c.sessionId);
    useSessionStore.getState().closeTab(c.sessionId);
    expect(useSessionStore.getState().activeId).toBe(b.sessionId);
    // Jetzt b schließen → a wird aktiv.
    useSessionStore.getState().closeTab(b.sessionId);
    expect(useSessionStore.getState().activeId).toBe(a.sessionId);
  });

  it('beim Schließen des linken Tabs wird der rechte Nachbar aktiv', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    const b = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().setActive(a.sessionId);
    useSessionStore.getState().closeTab(a.sessionId);
    expect(useSessionStore.getState().activeId).toBe(b.sessionId);
  });

  it('lässt activeId unangetastet, wenn ein nicht-aktiver Tab geschlossen wird', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    const b = useSessionStore.getState().addTab(baseInput);
    // b ist aktiv. a (nicht-aktiv) schließen → b bleibt aktiv.
    useSessionStore.getState().closeTab(a.sessionId);
    expect(useSessionStore.getState().activeId).toBe(b.sessionId);
  });

  it('setzt activeId auf null, wenn der letzte Tab geschlossen wird', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().closeTab(a.sessionId);
    expect(useSessionStore.getState().tabs).toHaveLength(0);
    expect(useSessionStore.getState().activeId).toBeNull();
  });
});

describe('useSessionStore Tab-Navigation', () => {
  it('nextTab rotiert ans Listenende und zurück', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    const b = useSessionStore.getState().addTab(baseInput);
    const c = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().setActive(a.sessionId);
    useSessionStore.getState().nextTab();
    expect(useSessionStore.getState().activeId).toBe(b.sessionId);
    useSessionStore.getState().nextTab();
    expect(useSessionStore.getState().activeId).toBe(c.sessionId);
    useSessionStore.getState().nextTab();
    expect(useSessionStore.getState().activeId).toBe(a.sessionId);
  });

  it('prevTab rotiert ans Listenanfang und zurück', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    const b = useSessionStore.getState().addTab(baseInput);
    const c = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().setActive(a.sessionId);
    useSessionStore.getState().prevTab();
    expect(useSessionStore.getState().activeId).toBe(c.sessionId);
  });

  it('Navigation ist No-op bei einem oder null Tabs', () => {
    expect(() => useSessionStore.getState().nextTab()).not.toThrow();
    const a = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().nextTab();
    expect(useSessionStore.getState().activeId).toBe(a.sessionId);
  });
});

describe('useSessionStore.setStatus / setModel / setNotes', () => {
  it('setStatus aktualisiert nur den passenden Tab', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    const b = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().setStatus(a.sessionId, 'completed');
    const tabs = useSessionStore.getState().tabs;
    expect(tabs.find((t) => t.sessionId === a.sessionId)?.status).toBe('completed');
    expect(tabs.find((t) => t.sessionId === b.sessionId)?.status).toBe('running');
  });

  it('setNotesDraft / setNotesSaved sind unabhängig', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().setNotesDraft(a.sessionId, 'getippt');
    useSessionStore.getState().setNotesSaved(a.sessionId, 'gespeichert');
    const tab = useSessionStore.getState().tabs[0];
    expect(tab?.notesDraft).toBe('getippt');
    expect(tab?.notesSaved).toBe('gespeichert');
  });
});

describe('useSessionStore.setActive', () => {
  it('ignoriert sessionIds, die nicht im Store existieren', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().setActive('ghost-id');
    expect(useSessionStore.getState().activeId).toBe(a.sessionId);
  });
});

// Smoke-Test: crypto.randomUUID muss in der Test-Umgebung verfügbar sein
// (Node 24 liefert es global). Vermeidet einen still-failing Test, falls die Runtime
// das Global mal nicht hätte.
it('crypto.randomUUID ist im Test-Environment verfügbar', () => {
  expect(typeof crypto.randomUUID).toBe('function');
  vi.useRealTimers();
});
