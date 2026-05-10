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
