import { create } from 'zustand';
import type { StatsOverviewResult, StatsRange } from '@shared/types';

// useStatsStore (Phase-2 Season-12).
//
// Haelt das letzte IPC-Ergebnis fuer die Stats-Cards plus die UI-Toggles
// Scope (aktives Projekt vs. global) und Range (Alle / 30d / 7d). Beide
// Toggles werden in localStorage persistiert, damit der zuletzt gewaehlte
// Filter den App-Restart ueberlebt — analog zur Projekt-Persistenz im
// useUiStore.
//
// `refresh` ist idempotent: rufen, wann immer etwas relevantes geandert hat
// (Projekt-Wechsel, Toggle, usage:update-Push). Race-Schutz uebernimmt der
// Aufrufer (debounce + ref-guard).

export type StatsScope = 'project' | 'global';

const SCOPE_STORAGE_KEY = 'td.statsScope';
const RANGE_STORAGE_KEY = 'td.statsRange';

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
  overview: StatsOverviewResult | null;
  loading: boolean;
  error: string | null;

  setScope: (scope: StatsScope) => void;
  setRange: (range: StatsRange) => void;
  refresh: (projectId: string | null) => Promise<void>;
}

export const useStatsStore = create<StatsStoreState>((set, get) => ({
  scope: readPersisted<StatsScope>(SCOPE_STORAGE_KEY, ['project', 'global'], 'project'),
  range: readPersisted<StatsRange>(RANGE_STORAGE_KEY, ['all', '30d', '7d'], 'all'),
  overview: null,
  loading: false,
  error: null,

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
}));
