import { create } from 'zustand';
import type { ProjectRow } from '@shared/types';

// Project-Store (Sprint 4).
//
// Hält die flache Liste der Projekte aus der DB; dient der LeftSidebar als Datenquelle.
// `projects` ist sortiert wie vom Repo zurückgegeben (Default-Project immer am Ende,
// echte Projects alphabetisch).
//
// reload() ruft project:list und ersetzt die Liste komplett. add() öffnet im Main den
// Datei-Dialog, der das hinzugefügte Project per Result zurückliefert (oder null bei
// Cancel) — der Store dispatcht ein reload() bei Erfolg, damit die finale, sortierte
// Liste aus der DB die Wahrheit bleibt.

interface ProjectStoreState {
  projects: ProjectRow[];
  loading: boolean;
  error: string | null;

  reload: () => Promise<void>;
  addViaDialog: () => Promise<ProjectRow | null>;
  scanWorkspace: () => Promise<void>;
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,

  reload: async () => {
    set({ loading: true, error: null });
    const result = await window.api.projects.list();
    if (result.ok) {
      set({ projects: result.data, loading: false });
    } else {
      set({ error: result.error, loading: false });
    }
  },

  addViaDialog: async () => {
    const result = await window.api.projects.add();
    if (!result.ok) {
      set({ error: result.error });
      return null;
    }
    if (result.data === null) return null; // Dialog abgebrochen
    await get().reload();
    return result.data;
  },

  scanWorkspace: async () => {
    set({ loading: true, error: null });
    const result = await window.api.projects.scanWorkspace();
    if (result.ok) {
      set({ projects: result.data, loading: false });
    } else {
      set({ error: result.error, loading: false });
    }
  },
}));
