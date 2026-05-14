import { create } from 'zustand';
import type {
  StatsHeatmapResult,
  StatsHeatmapWeeks,
  StatsModelsResult,
  StatsOverviewResult,
  StatsRange,
} from '@shared/types';

// useStatsStore (Phase-2 Season-12 + Season-13 + Season-14).
//
// Haelt das letzte IPC-Ergebnis fuer die Stats-Cards plus die UI-Toggles
// Scope (aktives Projekt vs. global) und Range (Alle / 30d / 7d). Beide
// Toggles werden in localStorage persistiert, damit der zuletzt gewaehlte
// Filter den App-Restart ueberlebt — analog zur Projekt-Persistenz im
// useUiStore.
//
// Season 13 ergaenzt die Heatmap-Daten plus den Wochen-Toggle (30W/52W).
// Der Range-Toggle (Alle/30d/7d) wirkt bewusst NICHT auf die Heatmap —
// ein 7-Tage-Fenster wuerde die Grid-Logik trivialisieren.
//
// Season 14 ergaenzt den Models-Slot fuer die Per-Modell-Aufschluesselung.
// Scope + Range werden geteilt mit den Cards (PHASE2.md-Zeile „Zeitfilter
// analog zu Uebersicht"), kein eigener Toggle. Der Refresh laeuft im
// ModelsView-Effekt, damit der Cards-Tick die GROUP-BY-Models-Query nicht
// ungefragt mit ausloest.
//
// `refresh` ist idempotent: rufen, wann immer etwas relevantes geandert hat
// (Projekt-Wechsel, Toggle, usage:update-Push). Race-Schutz uebernimmt der
// Aufrufer (debounce + ref-guard).

export type StatsScope = 'project' | 'global';

const SCOPE_STORAGE_KEY = 'td.statsScope';
const RANGE_STORAGE_KEY = 'td.statsRange';
const HEATMAP_WEEKS_STORAGE_KEY = 'td.heatmapWeeks';

function readPersisted<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return fallback;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (raw && (allowed as readonly string[]).includes(raw)) return raw as T;
  } catch {
    // localStorage in seltenen Edge-Cases unverfuegbar — Default greift.
  }
  return fallback;
}

function writePersisted(key: string, value: string): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // siehe readPersisted.
  }
}

interface StatsStoreState {
  scope: StatsScope;
  range: StatsRange;
  heatmapWeeks: StatsHeatmapWeeks;
  overview: StatsOverviewResult | null;
  heatmap: StatsHeatmapResult | null;
  models: StatsModelsResult | null;
  loading: boolean;
  error: string | null;
  heatmapError: string | null;
  modelsError: string | null;

  setScope: (scope: StatsScope) => void;
  setRange: (range: StatsRange) => void;
  setHeatmapWeeks: (weeks: StatsHeatmapWeeks) => void;
  refresh: (projectId: string | null) => Promise<void>;
  refreshHeatmap: (projectId: string | null) => Promise<void>;
  refreshModels: (projectId: string | null) => Promise<void>;
}

function readHeatmapWeeks(): StatsHeatmapWeeks {
  // localStorage haelt Strings, daher nicht ueber readPersisted (das prueft
  // auf ein String-Enum). Werte ausserhalb {30,52} werden auf 30 zurueckgesetzt.
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return 30;
  }
  try {
    const raw = window.localStorage.getItem(HEATMAP_WEEKS_STORAGE_KEY);
    if (raw === '52') return 52;
    if (raw === '30') return 30;
  } catch {
    // siehe readPersisted.
  }
  return 30;
}

export const useStatsStore = create<StatsStoreState>((set, get) => ({
  scope: readPersisted<StatsScope>(SCOPE_STORAGE_KEY, ['project', 'global'], 'project'),
  range: readPersisted<StatsRange>(RANGE_STORAGE_KEY, ['all', '30d', '7d'], 'all'),
  heatmapWeeks: readHeatmapWeeks(),
  overview: null,
  heatmap: null,
  models: null,
  loading: false,
  error: null,
  heatmapError: null,
  modelsError: null,

  setScope: (scope) => {
    if (get().scope === scope) return;
    set({ scope });
    writePersisted(SCOPE_STORAGE_KEY, scope);
  },

  setRange: (range) => {
    if (get().range === range) return;
    set({ range });
    writePersisted(RANGE_STORAGE_KEY, range);
  },

  setHeatmapWeeks: (weeks) => {
    if (get().heatmapWeeks === weeks) return;
    set({ heatmapWeeks: weeks });
    writePersisted(HEATMAP_WEEKS_STORAGE_KEY, String(weeks));
  },

  refresh: async (projectId: string | null) => {
    const state = get();
    // Im Global-Scope ignorieren wir die projectId — wir wollen explizit alles
    // sehen, nicht das gerade aktive Projekt einschraenken.
    const effectiveProjectId = state.scope === 'global' ? null : projectId;
    set({ loading: true, error: null });
    try {
      const result = await window.api.stats.overview({
        projectId: effectiveProjectId,
        range: state.range,
      });
      if (result.ok) {
        set({ overview: result.data, loading: false });
      } else {
        set({ error: result.error, loading: false });
      }
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  },

  refreshHeatmap: async (projectId: string | null) => {
    const state = get();
    const effectiveProjectId = state.scope === 'global' ? null : projectId;
    set({ heatmapError: null });
    try {
      const result = await window.api.stats.heatmap({
        projectId: effectiveProjectId,
        weeks: state.heatmapWeeks,
      });
      if (result.ok) {
        set({ heatmap: result.data });
      } else {
        set({ heatmapError: result.error });
      }
    } catch (e) {
      set({ heatmapError: e instanceof Error ? e.message : String(e) });
    }
  },

  refreshModels: async (projectId: string | null) => {
    const state = get();
    const effectiveProjectId = state.scope === 'global' ? null : projectId;
    set({ modelsError: null });
    try {
      const result = await window.api.stats.models({
        projectId: effectiveProjectId,
        range: state.range,
      });
      if (result.ok) {
        set({ models: result.data });
      } else {
        set({ modelsError: result.error });
      }
    } catch (e) {
      set({ modelsError: e instanceof Error ? e.message : String(e) });
    }
  },
}));
