import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  useSessionStore,
  selectTabsForProject,
} from '../../src/renderer/stores/sessions';

// Vor jedem Test den Store auf den Default-State zurücksetzen — Zustand persistiert
// sonst zwischen Tests innerhalb derselben Datei (Modul-State).
beforeEach(() => {
  useSessionStore.setState({ tabs: [], activeId: null });
});

const PROJ = 'proj-test';

const baseInput = {
  projectId: PROJ,
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

  it('persistiert die projectId am Tab', () => {
    const tab = useSessionStore.getState().addTab(baseInput);
    expect(tab.projectId).toBe(PROJ);
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
    expect(useSessionStore.getState().activeId).toBe(c.sessionId);
    useSessionStore.getState().closeTab(c.sessionId);
    expect(useSessionStore.getState().activeId).toBe(b.sessionId);
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
    useSessionStore.getState().closeTab(a.sessionId);
    expect(useSessionStore.getState().activeId).toBe(b.sessionId);
  });

  it('setzt activeId auf null, wenn der letzte Tab geschlossen wird', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().closeTab(a.sessionId);
    expect(useSessionStore.getState().tabs).toHaveLength(0);
    expect(useSessionStore.getState().activeId).toBeNull();
  });

  it('rotiert beim Close nur innerhalb des Projekts (kein Sprung in fremdes Projekt)', () => {
    // Sprint-4-Verhalten: Tab in Projekt A schließen darf nicht versehentlich
    // einen Tab in Projekt B aktivieren.
    const a1 = useSessionStore.getState().addTab({ ...baseInput, projectId: 'A' });
    useSessionStore.getState().addTab({ ...baseInput, projectId: 'B' });
    useSessionStore.getState().setActive(a1.sessionId);
    useSessionStore.getState().closeTab(a1.sessionId);
    // Projekt A hat keinen Nachbarn → activeId muss null sein, nicht der B-Tab.
    expect(useSessionStore.getState().activeId).toBeNull();
  });
});

describe('useSessionStore Tab-Navigation', () => {
  it('nextTab rotiert ans Listenende und zurück', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    const b = useSessionStore.getState().addTab(baseInput);
    const c = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().setActive(a.sessionId);
    useSessionStore.getState().nextTab(PROJ);
    expect(useSessionStore.getState().activeId).toBe(b.sessionId);
    useSessionStore.getState().nextTab(PROJ);
    expect(useSessionStore.getState().activeId).toBe(c.sessionId);
    useSessionStore.getState().nextTab(PROJ);
    expect(useSessionStore.getState().activeId).toBe(a.sessionId);
  });

  it('prevTab rotiert ans Listenanfang und zurück', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().addTab(baseInput);
    const c = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().setActive(a.sessionId);
    useSessionStore.getState().prevTab(PROJ);
    expect(useSessionStore.getState().activeId).toBe(c.sessionId);
  });

  it('Navigation ist No-op bei einem oder null Tabs', () => {
    expect(() => useSessionStore.getState().nextTab(PROJ)).not.toThrow();
    const a = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().nextTab(PROJ);
    expect(useSessionStore.getState().activeId).toBe(a.sessionId);
  });

  it('nextTab navigiert nur innerhalb des angegebenen Projekts', () => {
    const a1 = useSessionStore.getState().addTab({ ...baseInput, projectId: 'A' });
    useSessionStore.getState().addTab({ ...baseInput, projectId: 'B' });
    const a2 = useSessionStore.getState().addTab({ ...baseInput, projectId: 'A' });
    useSessionStore.getState().setActive(a1.sessionId);
    useSessionStore.getState().nextTab('A');
    // Erwartet: a1 → a2 (B-Tab wird übersprungen).
    expect(useSessionStore.getState().activeId).toBe(a2.sessionId);
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

  it('akzeptiert null und räumt activeId auf', () => {
    useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().setActive(null);
    expect(useSessionStore.getState().activeId).toBeNull();
  });
});

describe('selectTabsForProject', () => {
  it('liefert nur Tabs des angegebenen Projekts', () => {
    useSessionStore.getState().addTab({ ...baseInput, projectId: 'A', title: 'a1' });
    useSessionStore.getState().addTab({ ...baseInput, projectId: 'B', title: 'b1' });
    useSessionStore.getState().addTab({ ...baseInput, projectId: 'A', title: 'a2' });
    const tabs = useSessionStore.getState().tabs;
    const aTabs = selectTabsForProject(tabs, 'A');
    expect(aTabs.map((t) => t.title)).toEqual(['a1', 'a2']);
  });

  it('liefert leere Liste, wenn das Projekt keine Tabs hat', () => {
    useSessionStore.getState().addTab({ ...baseInput, projectId: 'A' });
    const tabs = useSessionStore.getState().tabs;
    expect(selectTabsForProject(tabs, 'B')).toEqual([]);
  });
});

it('crypto.randomUUID ist im Test-Environment verfügbar', () => {
  expect(typeof crypto.randomUUID).toBe('function');
  vi.useRealTimers();
});

// Phase-2 Season-28: Bell-Marker fuer inaktive Tabs mit PTY-BEL-Output.
describe('useSessionStore Bell-Marker', () => {
  it('setBell(true) markiert nur den passenden Tab', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    const b = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().setBell(b.sessionId, true);
    const tabs = useSessionStore.getState().tabs;
    expect(tabs.find((t) => t.sessionId === a.sessionId)?.hasBell).toBe(false);
    expect(tabs.find((t) => t.sessionId === b.sessionId)?.hasBell).toBe(true);
  });

  it('setBell ist idempotent — gleicher Wert produziert keinen neuen State', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    const before = useSessionStore.getState().tabs;
    useSessionStore.getState().setBell(a.sessionId, false);
    const after = useSessionStore.getState().tabs;
    // Referenz-Gleichheit als Beleg, dass Zustand kein Re-Render triggert.
    expect(after).toBe(before);
  });

  it('setActive loescht den Bell-Marker des aktivierten Tabs automatisch', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    const b = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().setActive(a.sessionId);
    useSessionStore.getState().setBell(b.sessionId, true);
    expect(
      useSessionStore.getState().tabs.find((t) => t.sessionId === b.sessionId)?.hasBell,
    ).toBe(true);
    useSessionStore.getState().setActive(b.sessionId);
    expect(
      useSessionStore.getState().tabs.find((t) => t.sessionId === b.sessionId)?.hasBell,
    ).toBe(false);
  });

  it('setActive laesst Bell-Marker anderer Tabs in Ruhe', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    const b = useSessionStore.getState().addTab(baseInput);
    useSessionStore.getState().setBell(a.sessionId, true);
    useSessionStore.getState().setBell(b.sessionId, true);
    useSessionStore.getState().setActive(b.sessionId);
    expect(
      useSessionStore.getState().tabs.find((t) => t.sessionId === a.sessionId)?.hasBell,
    ).toBe(true);
  });

  it('neuer Tab startet mit hasBell=false', () => {
    const a = useSessionStore.getState().addTab(baseInput);
    expect(a.hasBell).toBe(false);
  });
});
