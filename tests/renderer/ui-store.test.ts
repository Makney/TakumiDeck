import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useUiStore } from '../../src/renderer/stores/ui';

// Test-Storage: simuliert window.localStorage in Node-Vitest.
// Wird vor jedem Test frisch eingehängt.
class TestLocalStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  // Test-Helper.
  raw(): Record<string, string> {
    return Object.fromEntries(this.store);
  }
}

let storage: TestLocalStorage;

beforeEach(() => {
  storage = new TestLocalStorage();
  vi.stubGlobal('window', { localStorage: storage });
  useUiStore.setState({
    activeProjectId: null,
    activeProjectFrontmatter: null,
    activeProjectFrontmatterError: null,
    dashboardDetailBarId: null,
    mainView: 'terminals',
    historySelectedId: null,
    showNewSessionModal: false,
    showTemplatesModal: false,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useUiStore — Sprint-4-Basics', () => {
  it('initial activeProjectId=null', () => {
    expect(useUiStore.getState().activeProjectId).toBeNull();
  });

  it('setActiveProject persistiert eine ID', () => {
    useUiStore.getState().setActiveProject('proj-1');
    expect(useUiStore.getState().activeProjectId).toBe('proj-1');
  });

  it('setActiveProject(null) räumt auf', () => {
    useUiStore.getState().setActiveProject('proj-1');
    useUiStore.getState().setActiveProject(null);
    expect(useUiStore.getState().activeProjectId).toBeNull();
  });
});

describe('useUiStore — Sprint-5-localStorage-Hydrate', () => {
  it('schreibt setActiveProject in localStorage', () => {
    useUiStore.getState().setActiveProject('proj-42');
    expect(storage.getItem('td.activeProjectId')).toBe('proj-42');
  });

  it('löscht den Eintrag bei setActiveProject(null)', () => {
    useUiStore.getState().setActiveProject('proj-42');
    useUiStore.getState().setActiveProject(null);
    expect(storage.getItem('td.activeProjectId')).toBeNull();
  });

  it('hydrateFromStorage übernimmt eine persistierte ID, wenn der Store leer ist', () => {
    storage.setItem('td.activeProjectId', 'proj-saved');
    expect(useUiStore.getState().activeProjectId).toBeNull();
    useUiStore.getState().hydrateFromStorage();
    expect(useUiStore.getState().activeProjectId).toBe('proj-saved');
  });

  it('hydrateFromStorage tut nichts, wenn schon eine ID gesetzt ist', () => {
    useUiStore.setState({ activeProjectId: 'proj-current' });
    storage.setItem('td.activeProjectId', 'proj-old');
    useUiStore.getState().hydrateFromStorage();
    expect(useUiStore.getState().activeProjectId).toBe('proj-current');
  });

  it('hydrateFromStorage tut nichts ohne persistierten Wert', () => {
    useUiStore.getState().hydrateFromStorage();
    expect(useUiStore.getState().activeProjectId).toBeNull();
  });

  it('Frontmatter-Cache wird beim Project-Wechsel geleert', () => {
    useUiStore.setState({
      activeProjectId: 'proj-1',
      activeProjectFrontmatter: {
        workbench: {
          trigger_phrases: { docs_update: 'X', commit: 'Y' },
          default_model: 'claude-opus-4-7',
        },
      },
    });
    useUiStore.getState().setActiveProject('proj-2');
    expect(useUiStore.getState().activeProjectFrontmatter).toBeNull();
  });

  it('setActiveProject(sameId) hat keinen Effekt', () => {
    useUiStore.setState({
      activeProjectId: 'proj-1',
      activeProjectFrontmatter: {
        workbench: {
          trigger_phrases: { docs_update: 'X', commit: 'Y' },
          default_model: 'claude-opus-4-7',
        },
      },
    });
    useUiStore.getState().setActiveProject('proj-1');
    // Frontmatter bleibt erhalten, weil setActiveProject identische ID skippt.
    expect(useUiStore.getState().activeProjectFrontmatter).not.toBeNull();
  });
});

describe('useUiStore — Dashboard-Detail-Modal', () => {
  it('setDashboardDetailBar speichert die Bar-ID', () => {
    useUiStore.getState().setDashboardDetailBar('5h');
    expect(useUiStore.getState().dashboardDetailBarId).toBe('5h');
  });

  it('setDashboardDetailBar(null) schließt das Modal', () => {
    useUiStore.getState().setDashboardDetailBar('5h');
    useUiStore.getState().setDashboardDetailBar(null);
    expect(useUiStore.getState().dashboardDetailBarId).toBeNull();
  });
});

describe('useUiStore — Sprint-6-MainView-Toggle', () => {
  it('initial mainView=terminals', () => {
    expect(useUiStore.getState().mainView).toBe('terminals');
  });

  it('setMainView wechselt zur History-View und zurück', () => {
    useUiStore.getState().setMainView('history');
    expect(useUiStore.getState().mainView).toBe('history');
    useUiStore.getState().setMainView('terminals');
    expect(useUiStore.getState().mainView).toBe('terminals');
  });

  it('setActiveProject(id, "history") wechselt Projekt UND View', () => {
    useUiStore.getState().setActiveProject('proj-1', 'history');
    expect(useUiStore.getState().activeProjectId).toBe('proj-1');
    expect(useUiStore.getState().mainView).toBe('history');
  });

  it('setActiveProject(id, "terminals") setzt View zurück auf Tabs', () => {
    useUiStore.getState().setActiveProject('proj-1', 'history');
    useUiStore.getState().setActiveProject('proj-1', 'terminals');
    expect(useUiStore.getState().mainView).toBe('terminals');
  });

  it('setActiveProject(sameId, sameView) ist No-op (Frontmatter bleibt)', () => {
    useUiStore.setState({
      activeProjectId: 'proj-1',
      mainView: 'history',
      activeProjectFrontmatter: {
        workbench: {
          trigger_phrases: { docs_update: 'X', commit: 'Y' },
          default_model: 'claude-opus-4-7',
        },
      },
    });
    useUiStore.getState().setActiveProject('proj-1', 'history');
    expect(useUiStore.getState().activeProjectFrontmatter).not.toBeNull();
  });

  it('setActiveProject(sameId, otherView) wechselt nur die View, behält Frontmatter', () => {
    useUiStore.setState({
      activeProjectId: 'proj-1',
      mainView: 'terminals',
      activeProjectFrontmatter: {
        workbench: {
          trigger_phrases: { docs_update: 'X', commit: 'Y' },
        },
      },
    });
    useUiStore.getState().setActiveProject('proj-1', 'history');
    expect(useUiStore.getState().mainView).toBe('history');
    // Same project: Frontmatter darf NICHT geleert werden — sonst flackert die UI
    // beim Hin-und-Her-Wechseln zwischen Tabs und Verlauf.
    expect(useUiStore.getState().activeProjectFrontmatter).not.toBeNull();
  });
});

describe('useUiStore — Sprint-6-UI-Fix Sidebar-State', () => {
  it('setHistorySelected speichert die Session-ID', () => {
    useUiStore.getState().setHistorySelected('sess-42');
    expect(useUiStore.getState().historySelectedId).toBe('sess-42');
  });

  it('setHistorySelected(null) räumt auf', () => {
    useUiStore.getState().setHistorySelected('sess-42');
    useUiStore.getState().setHistorySelected(null);
    expect(useUiStore.getState().historySelectedId).toBeNull();
  });

  it('setActiveProject auf neues Projekt leert historySelectedId', () => {
    useUiStore.setState({ activeProjectId: 'proj-A', historySelectedId: 'sess-old' });
    useUiStore.getState().setActiveProject('proj-B');
    expect(useUiStore.getState().historySelectedId).toBeNull();
  });

  it('setShowNewSessionModal toggelt das Modal', () => {
    expect(useUiStore.getState().showNewSessionModal).toBe(false);
    useUiStore.getState().setShowNewSessionModal(true);
    expect(useUiStore.getState().showNewSessionModal).toBe(true);
    useUiStore.getState().setShowNewSessionModal(false);
    expect(useUiStore.getState().showNewSessionModal).toBe(false);
  });

  it('setShowTemplatesModal toggelt das Modal unabhängig vom NewSession', () => {
    useUiStore.getState().setShowTemplatesModal(true);
    expect(useUiStore.getState().showTemplatesModal).toBe(true);
    expect(useUiStore.getState().showNewSessionModal).toBe(false);
  });
});
