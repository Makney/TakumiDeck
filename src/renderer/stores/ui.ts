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

// Sprint 6 (Q4 Variante A): Hauptansicht des Tab-Slots — entweder die laufenden
// Tabs (Default) oder der Verlauf-Replace-View des aktiven Projekts. Modal-Ansatz
// hätte die Tabelle gequetscht; Replace-View nutzt die volle Bildschirmbreite.
export type MainView = 'terminals' | 'history';

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
  // Sprint 6: Hauptansicht-Toggle. Wechsel via setActiveProject('p', 'history')
  // oder explizit über setMainView. Tabs laufen im Hintergrund weiter (Sprint-3-
  // Pattern: alle xterm dauerhaft mounted, nur CSS-Toggle), kein Buffer-Verlust.
  mainView: MainView;
  // Sprint-6-UI-Fix: Sidebar kann eine bestimmte Verlauf-Session vorauswählen.
  // Klick auf einen Verlauf-Eintrag in der Sidebar setzt diese ID + mainView=history;
  // HistoryPane synchronisiert seinen lokalen selectedId-State daraus.
  historySelectedId: string | null;
  // Globale Modal-Sichtbarkeit (Sprint-6-Fix): NewSessionModal kann jetzt aus der
  // Sidebar (+ Neue Session) UND aus dem TabContainer (+ in der Tab-Bar / Ctrl+N)
  // geöffnet werden — also gehört der Zustand in einen gemeinsamen Store.
  showNewSessionModal: boolean;
  showTemplatesModal: boolean;
  // Sprint-7-Phase-8: PreCommitModal wird aus der commit-Pill in der Action-Bar
  // geöffnet. Globaler Zustand wie die anderen Modals — falls in Phase 8+
  // weitere Trigger dazukommen (z.B. Sidebar-Footer-Action), öffnen sie alle
  // denselben Zustand.
  showPreCommitModal: boolean;
  // Sprint 8 (Architektur 6.9): Settings-Modal-Trigger via Ctrl+K oder
  // Settings-Icon im neuen Header. Globaler Zustand wie die anderen Modals.
  showSettingsModal: boolean;

  setActiveProject: (projectId: string | null, view?: MainView) => void;
  setMainView: (view: MainView) => void;
  setHistorySelected: (sessionId: string | null) => void;
  setShowNewSessionModal: (show: boolean) => void;
  setShowTemplatesModal: (show: boolean) => void;
  setShowPreCommitModal: (show: boolean) => void;
  setShowSettingsModal: (show: boolean) => void;
  hydrateFromStorage: () => void;
  loadActiveProjectFrontmatter: (projectId: string) => Promise<void>;
  setDashboardDetailBar: (barId: string | null) => void;
}

export const useUiStore = create<UiStoreState>((set, get) => ({
  activeProjectId: null,
  activeProjectFrontmatter: null,
  activeProjectFrontmatterError: null,
  dashboardDetailBarId: null,
  mainView: 'terminals',
  historySelectedId: null,
  showNewSessionModal: false,
  showTemplatesModal: false,
  showPreCommitModal: false,
  showSettingsModal: false,

  setActiveProject: (projectId, view) => {
    const state = get();
    const sameProject = state.activeProjectId === projectId;
    const targetView = view ?? state.mainView;
    if (sameProject && state.mainView === targetView) return;
    if (sameProject) {
      set({ mainView: targetView });
      return;
    }
    set({
      activeProjectId: projectId,
      mainView: targetView,
      // Frontmatter wird beim Wechsel ungültig — der Renderer zieht das neue Projekt
      // über loadActiveProjectFrontmatter mit ref-guard nach.
      activeProjectFrontmatter: null,
      activeProjectFrontmatterError: null,
      // History-Selektion war auf das alte Projekt bezogen — leeren, damit der
      // HistoryPane beim Project-Wechsel nicht eine fremde Session zeigt.
      historySelectedId: null,
    });
    writePersistedActiveProject(projectId);
  },

  setMainView: (view) => {
    if (get().mainView === view) return;
    set({ mainView: view });
  },

  setHistorySelected: (sessionId) => {
    if (get().historySelectedId === sessionId) return;
    set({ historySelectedId: sessionId });
  },

  setShowNewSessionModal: (show) => {
    if (get().showNewSessionModal === show) return;
    set({ showNewSessionModal: show });
  },

  setShowTemplatesModal: (show) => {
    if (get().showTemplatesModal === show) return;
    set({ showTemplatesModal: show });
  },

  setShowPreCommitModal: (show) => {
    if (get().showPreCommitModal === show) return;
    set({ showPreCommitModal: show });
  },

  setShowSettingsModal: (show) => {
    if (get().showSettingsModal === show) return;
    set({ showSettingsModal: show });
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
