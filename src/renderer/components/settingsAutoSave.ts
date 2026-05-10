import type { AppSettings } from '@shared/types';
import { AppSettingsPatchSchema } from '@shared/schemas';

// Pure-Logik für Auto-Save (V2-A): debounced Field-Patches gegen settings:set.
//
// Aufruf-Pattern:
//   const saver = createDebouncedSaver(window.api.settings.set, { delayMs: 500 });
//   saver.queue('terminal_font_size', 14);
//   saver.queue('p90_window_hours', 192);
//   await saver.flush(); // optional, beim Modal-Close
//
// Mehrere queue-Calls auf dasselbe Field koalieren — der letzte Wert gewinnt.
// Mehrere Felder werden in EINEM Patch gebündelt, sobald die Debounce-Window
// abläuft. Das schont Disk-Writes und verhindert race-conditions im store.

export interface SettingsApi {
  set: (
    patch: Partial<AppSettings>,
  ) => Promise<{ ok: true; data: AppSettings } | { ok: false; error: string }>;
}

export interface SaveOutcome {
  status: 'saved' | 'error';
  // Bei error: Server-Message. Bei saved: undefined.
  error?: string;
  // Felder, die in diesem Flush mitgeschrieben wurden (für UI-Indikator).
  fields: string[];
  // Server-Antwort (frische Settings) bei saved.
  result?: AppSettings;
}

export interface DebouncedSaver {
  queue<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void;
  flush(): Promise<SaveOutcome | null>;
  // Subscription auf Save-Outcomes (UI-Indikator). Returnt Unsubscribe.
  onOutcome(handler: (outcome: SaveOutcome) => void): () => void;
  // Test-Helper: aktueller Patch-Buffer (was noch nicht gefeuert hat).
  pendingForTest(): Partial<AppSettings>;
}

export interface DebouncedSaverOptions {
  delayMs?: number;
  // Test-Hook für deterministische Timer.
  scheduler?: {
    set: (cb: () => void, ms: number) => unknown;
    clear: (handle: unknown) => void;
  };
}

export function createDebouncedSaver(
  api: SettingsApi,
  options: DebouncedSaverOptions = {},
): DebouncedSaver {
  const delayMs = options.delayMs ?? 500;
  const scheduler =
    options.scheduler ?? {
      set: (cb, ms) => setTimeout(cb, ms),
      clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    };

  let pending: Partial<AppSettings> = {};
  let timerHandle: unknown = null;
  const handlers = new Set<(outcome: SaveOutcome) => void>();

  const cancelTimer = (): void => {
    if (timerHandle !== null) {
      scheduler.clear(timerHandle);
      timerHandle = null;
    }
  };

  const fire = async (): Promise<SaveOutcome | null> => {
    cancelTimer();
    if (Object.keys(pending).length === 0) return null;
    const fieldsAtFire = Object.keys(pending);
    // Patch lokal validieren, BEVOR wir den IPC machen — falls invalid, melden
    // wir es als error-Outcome ohne den Server zu belasten.
    const parsed = AppSettingsPatchSchema.safeParse(pending);
    const snapshot = pending;
    pending = {};
    if (!parsed.success) {
      const outcome: SaveOutcome = {
        status: 'error',
        error: parsed.error.errors[0]?.message ?? 'Ungültiger Settings-Patch',
        fields: fieldsAtFire,
      };
      handlers.forEach((h) => h(outcome));
      return outcome;
    }
    try {
      const result = await api.set(snapshot);
      const outcome: SaveOutcome = result.ok
        ? { status: 'saved', fields: fieldsAtFire, result: result.data }
        : { status: 'error', error: result.error, fields: fieldsAtFire };
      handlers.forEach((h) => h(outcome));
      return outcome;
    } catch (e) {
      const outcome: SaveOutcome = {
        status: 'error',
        error: e instanceof Error ? e.message : String(e),
        fields: fieldsAtFire,
      };
      handlers.forEach((h) => h(outcome));
      return outcome;
    }
  };

  return {
    queue(key, value) {
      // Late-binding-Setter (typed). Object-Spread mit dynamischem Key.
      pending = { ...pending, [key]: value };
      cancelTimer();
      timerHandle = scheduler.set(() => {
        void fire();
      }, delayMs);
    },
    flush() {
      return fire();
    },
    onOutcome(handler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
    pendingForTest() {
      return { ...pending };
    },
  };
}
