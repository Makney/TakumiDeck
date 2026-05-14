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
  // Phase-2 Season-8: Projekt aus der Liste entfernen. Sessions des Projekts
  // wandern serverseitig auf den Default-Bucket; der Store ersetzt die Liste
  // mit dem aus dem IPC-Result zurückgelieferten Stand. true = entfernt,
  // false = abgelehnt (z. B. Default-Bucket oder Fehler — Details in state.error).
  remove: (projectId: string) => Promise<boolean>;
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

  remove: async (projectId: string) => {
    set({ loading: true, error: null });
    const result = await window.api.projects.remove({ projectId });
    if (result.ok) {
      set({ projects: result.data, loading: false });
      return true;
    }
    set({ error: result.error, loading: false });
    return false;
  },
}));
