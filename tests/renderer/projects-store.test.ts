import { describe, it, expect, beforeEach, vi } from 'vitest';

// W2-Test (STORES-Review 2026-05-31): useProjectStore.remove() muss den
// Renderer-State des entfernten Projekts mit aufraeumen — sonst bleiben
// Datei-Tabs (useFileTabsStore) und Git-Status-Cache (useGitStatusStore) als
// verwaister State liegen und wuerden beim naechsten App-Start gegen ein nicht
// mehr existierendes Projekt hydriert. Getestet:
//   - Erfolgreiches remove → Datei-Tabs + Git-Status-Eintrag des Projekts weg
//   - Fehlgeschlagenes remove → State bleibt unangetastet, error gesetzt

describe('useProjectStore.remove — Cross-Store-Cleanup', () => {
  let removeFn: ReturnType<typeof vi.fn>;
  // Fresh Module pro Test: projects.ts importiert die anderen beiden Stores; nur
  // bei gemeinsamer Modul-Registry zeigen die Imports auf dieselben Instanzen,
  // die wir hier seeden und pruefen.
  let projects: typeof import('../../src/renderer/stores/projects');
  let fileTabs: typeof import('../../src/renderer/stores/fileTabs');
  let gitStatus: typeof import('../../src/renderer/stores/gitStatus');

  beforeEach(async () => {
    vi.resetModules();
    removeFn = vi.fn();
    // window ohne localStorage: writePersisted (in resetProject) greift dann ins
    // typeof-Guard-return, kein Throw.
    (globalThis as unknown as { window: { api: unknown } }).window = {
      api: { projects: { remove: removeFn } },
    };
    projects = await import('../../src/renderer/stores/projects');
    fileTabs = await import('../../src/renderer/stores/fileTabs');
    gitStatus = await import('../../src/renderer/stores/gitStatus');
  });

  function seedProjectState(projectId: string): void {
    fileTabs.useFileTabsStore.setState({
      tabs: {
        [projectId]: [
          {
            id: 'file:a.ts',
            kind: 'file',
            relPath: 'a.ts',
            label: 'a.ts',
            dirty: false,
            savedContent: null,
            loading: false,
            loadError: null,
          },
        ],
      },
      activeId: { [projectId]: 'file:a.ts' },
    });
    gitStatus.useGitStatusStore.setState({
      byProject: {
        [projectId]: { status: null, loading: false, loadError: null, hasGit: true },
      },
    });
  }

  it('raeumt Datei-Tabs und Git-Status des entfernten Projekts auf', async () => {
    seedProjectState('p1');
    removeFn.mockResolvedValue({ ok: true, data: [] });

    const ok = await projects.useProjectStore.getState().remove('p1');

    expect(ok).toBe(true);
    expect(fileTabs.useFileTabsStore.getState().tabs.p1).toBeUndefined();
    expect(gitStatus.useGitStatusStore.getState().byProject.p1).toBeUndefined();
  });

  it('laesst den State unberuehrt, wenn remove serverseitig fehlschlaegt', async () => {
    seedProjectState('p1');
    removeFn.mockResolvedValue({ ok: false, error: 'Default-Bucket' });

    const ok = await projects.useProjectStore.getState().remove('p1');

    expect(ok).toBe(false);
    // Kein Cleanup bei Fehlschlag — der State bleibt erhalten.
    expect(fileTabs.useFileTabsStore.getState().tabs.p1).toBeDefined();
    expect(gitStatus.useGitStatusStore.getState().byProject.p1).toBeDefined();
    expect(projects.useProjectStore.getState().error).toBe('Default-Bucket');
  });
});
