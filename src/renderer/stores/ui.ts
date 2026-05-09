import { create } from 'zustand';

// Renderer-UI-State (Zustand-Store, Sprint 4).
//
// Architektur 2 nennt useUiStore explizit als einen der vier Domain-Stores. Sprint 4
// macht ihn auf, weil die Sidebar-Auswahl des aktiven Projekts nirgendwo sonst sauber
// hingehört: useProjectStore enthält nur die *Daten* der erkannten Projekte (Liste),
// die Auswahl ist UI-State.
//
// Sprint 5 wird hier weitere Felder ergänzen (z.B. dashboardDetailOpen),
// Sprint 8 die Settings-Modal-Sichtbarkeit. Bis dahin nur das aktive Projekt.

interface UiStoreState {
  // null = kein Projekt aktiv (Initial-State, bevor der Store das erste Mal hydriert).
  // Beim ersten Laden der Project-Liste setzt der Renderer das aktive Projekt
  // implizit auf das erste Element (oder null, falls die Liste leer ist).
  activeProjectId: string | null;

  setActiveProject: (projectId: string | null) => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  activeProjectId: null,

  setActiveProject: (projectId) => {
    set({ activeProjectId: projectId });
  },
}));
