import { create } from 'zustand';
import type { ClaudeMdFrontmatter } from '@shared/types';

// Renderer-UI-State (Zustand-Store, Sprint 4 + Sprint-5-Erweiterungen).
//
// Sprint 4: aktives Projekt (`activeProjectId`).
// Sprint 5:
//   - localStorage-Hydrate, damit der User nach App-Restart wieder beim letzten
//     Projekt landet (Drive-by aus SEASON_LOG.md, Variante A).
//   - Frontmatter-Cache des aktiven Projekts. NewSessionModal zieht den
//     Per-Projekt-Default-Modell-Wert aus diesem Cache (Architektur 6.2:
//     „Default-Modell-Hierarchie: Per-Projekt > Global"). Cache wird beim
//     setActiveProject ungültig und vom Renderer per loadActiveProjectFrontmatter
//     mit ref-guard nachgezogen (Memory: StrictMode-Side-Effect-Guard).
//   - dashboardDetailBarId: welche limit_bar gerade im UsageDetailModal offen ist.

const STORAGE_KEY = 'td.activeProjectId';

function readPersistedActiveProject(): string | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw && raw.length > 0 ? raw : null;
  } catch {
    return null;
  }
}

function writePersistedActiveProject(id: string | null): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    if (id === null) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // localStorage kann in seltenen Edge-Cases failen (private browsing, quota) —
    // wir ignorieren still, weil die Persistenz Komfort, kein Korrektheits-Bedarf ist.
  }
}

interface UiStoreState {
  // null = kein Projekt aktiv (Initial-State, bevor der Store das erste Mal hydriert).
  // Beim ersten Laden der Project-Liste setzt der Renderer das aktive Projekt
  // implizit auf das erste Element (oder null, falls die Liste leer ist).
  activeProjectId: string | null;
  // Frontmatter-Cache: nach erfolgreichem project:read-claude-md hier abgelegt.
  // Wird beim setActiveProject geleert (verhindert Cross-Project-Drift).
  activeProjectFrontmatter: ClaudeMdFrontmatter | null;
  activeProjectFrontmatterError: string | null;
  // Sprint 5 öffnet auf Klick einer limit_bar das UsageDetailModal — null = zu.
  dashboardDetailBarId: string | null;

  setActiveProject: (projectId: string | null) => void;
  hydrateFromStorage: () => void;
  loadActiveProjectFrontmatter: (projectId: string) => Promise<void>;
  setDashboardDetailBar: (barId: string | null) => void;
}

export const useUiStore = create<UiStoreState>((set, get) => ({
  activeProjectId: null,
  activeProjectFrontmatter: null,
  activeProjectFrontmatterError: null,
  dashboardDetailBarId: null,

  setActiveProject: (projectId) => {
    if (get().activeProjectId === projectId) return;
    set({
      activeProjectId: projectId,
      // Frontmatter wird beim Wechsel ungültig — der Renderer zieht das neue Projekt
      // über loadActiveProjectFrontmatter mit ref-guard nach.
      activeProjectFrontmatter: null,
      activeProjectFrontmatterError: null,
    });
    writePersistedActiveProject(projectId);
  },

  hydrateFromStorage: () => {
    // Hydrate-Semantik: nur das initial leere UI-State befüllen. Wenn schon eine
    // ID drinsteht (User-Click oder vorhergegangener Hydrate), nicht mehr anfassen.
    if (get().activeProjectId !== null) return;
    const persisted = readPersistedActiveProject();
    if (persisted === null) return;
    // Wir setzen direkt — der LeftSidebar-Auto-Select-Effekt prüft hinterher,
    // ob die ID noch existiert; bei toter Referenz fällt er auf das erste echte
    // Projekt zurück (siehe LeftSidebar.tsx).
    set({ activeProjectId: persisted });
  },

  loadActiveProjectFrontmatter: async (projectId) => {
    // Wenn das aktive Projekt zwischenzeitlich gewechselt hat, das Ergebnis verwerfen
    // (Race zwischen schnellem Klicks). State wird nur überschrieben, wenn die
    // Session-ID noch passt.
    const result = await window.api.projects.readClaudeMd({ projectId });
    if (get().activeProjectId !== projectId) return;
    if (result.ok) {
      set({
        activeProjectFrontmatter: result.data.frontmatter,
        activeProjectFrontmatterError: null,
      });
    } else {
      set({
        activeProjectFrontmatter: null,
        activeProjectFrontmatterError: result.error,
      });
    }
  },

  setDashboardDetailBar: (barId) => {
    set({ dashboardDetailBarId: barId });
  },
}));
