import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createDebouncedSaver,
  type SettingsApi,
  type SaveOutcome,
} from '../../src/renderer/components/settingsAutoSave';

// Sprint 8 — Tests für den Debounced-Saver der Settings-Form-Inputs (V2-A).
//
// Wir nutzen einen Manual-Scheduler statt vi.useFakeTimers(), damit die Tests
// deterministisch und unabhängig von Vitest's Timer-Mocks bleiben. Der Scheduler
// hat eine flushNow()-Methode, mit der wir gezielt den nächsten Timer feuern.

interface ManualScheduler {
  set: (cb: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
  flushNext: () => void;
  pending: () => number;
}

function makeManualScheduler(): ManualScheduler {
  // Simuliert eine setTimeout-Queue mit cancel-Semantik. Ein cancelter Timer
  // wird auf null markiert und beim flushNext übersprungen — sonst würde der
  // Test-Code (queue-mehrfach + flushNext) den ersten markierten no-op shiften
  // und nichts auslösen, obwohl der echte Timer noch in der Queue steht.
  const cbs: Array<(() => void) | null> = [];
  return {
    set(cb) {
      cbs.push(cb);
      return cbs.length - 1;
    },
    clear(handle) {
      const idx = handle as number;
      cbs[idx] = null;
    },
    flushNext() {
      while (cbs.length > 0) {
        const cb = cbs.shift();
        if (cb) {
          cb();
          return;
        }
      }
    },
    pending() {
      return cbs.filter((c) => c !== null).length;
    },
  };
}

describe('createDebouncedSaver', () => {
  let api: SettingsApi & { set: ReturnType<typeof vi.fn> };
  let scheduler: ManualScheduler;

  beforeEach(() => {
    api = {
      set: vi.fn().mockResolvedValue({
        ok: true,
        data: { terminal_font_size: 14 } as never,
      }),
    };
    scheduler = makeManualScheduler();
  });

  it('queue debounced einen Field-Patch und feuert nach Timer', async () => {
    const saver = createDebouncedSaver(api, { scheduler });
    saver.queue('terminal_font_size', 14);
    expect(api.set).not.toHaveBeenCalled();
    expect(scheduler.pending()).toBe(1);

    scheduler.flushNext();
    await Promise.resolve();
    await Promise.resolve();
    expect(api.set).toHaveBeenCalledWith({ terminal_font_size: 14 });
  });

  it('mehrere queue-Calls auf dasselbe Field koalieren — letzter Wert gewinnt', async () => {
    const saver = createDebouncedSaver(api, { scheduler });
    saver.queue('terminal_font_size', 12);
    saver.queue('terminal_font_size', 13);
    saver.queue('terminal_font_size', 14);
    scheduler.flushNext();
    await Promise.resolve();
    await Promise.resolve();
    expect(api.set).toHaveBeenCalledTimes(1);
    expect(api.set).toHaveBeenCalledWith({ terminal_font_size: 14 });
  });

  it('mehrere Felder werden in EINEM Patch gebündelt', async () => {
    const saver = createDebouncedSaver(api, { scheduler });
    saver.queue('terminal_font_size', 14);
    saver.queue('p90_window_hours', 168);
    saver.queue('default_model', 'claude-opus-4-7');
    scheduler.flushNext();
    await Promise.resolve();
    await Promise.resolve();
    expect(api.set).toHaveBeenCalledTimes(1);
    expect(api.set).toHaveBeenCalledWith({
      terminal_font_size: 14,
      p90_window_hours: 168,
      default_model: 'claude-opus-4-7',
    });
  });

  it('flush triggert sofortigen Patch (für Modal-Close)', async () => {
    const saver = createDebouncedSaver(api, { scheduler });
    saver.queue('terminal_font_size', 14);
    const outcome = await saver.flush();
    expect(api.set).toHaveBeenCalledWith({ terminal_font_size: 14 });
    expect(outcome?.status).toBe('saved');
  });

  it('flush ohne pending-Patches gibt null zurück', async () => {
    const saver = createDebouncedSaver(api, { scheduler });
    const outcome = await saver.flush();
    expect(outcome).toBeNull();
    expect(api.set).not.toHaveBeenCalled();
  });

  it('onOutcome wird mit saved-Outcome aufgerufen', async () => {
    const saver = createDebouncedSaver(api, { scheduler });
    const outcomes: SaveOutcome[] = [];
    saver.onOutcome((o) => outcomes.push(o));
    saver.queue('terminal_font_size', 14);
    scheduler.flushNext();
    await Promise.resolve();
    await Promise.resolve();
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.status).toBe('saved');
    expect(outcomes[0]!.fields).toEqual(['terminal_font_size']);
  });

  it('onOutcome wird mit error-Outcome aufgerufen, wenn die API fehlschlägt', async () => {
    api.set.mockResolvedValueOnce({ ok: false, error: 'SETTINGS_WRITE' });
    const saver = createDebouncedSaver(api, { scheduler });
    const outcomes: SaveOutcome[] = [];
    saver.onOutcome((o) => outcomes.push(o));
    saver.queue('terminal_font_size', 14);
    scheduler.flushNext();
    await Promise.resolve();
    await Promise.resolve();
    expect(outcomes[0]!.status).toBe('error');
    expect(outcomes[0]!.error).toBe('SETTINGS_WRITE');
  });

  it('lokale Schema-Validation kickt ungültige Patches ab — kein API-Call', async () => {
    const saver = createDebouncedSaver(api, { scheduler });
    // terminal_font_size MUSS positive sein — 0 wird vom Schema abgelehnt.
    saver.queue('terminal_font_size', 0);
    const outcome = await saver.flush();
    expect(api.set).not.toHaveBeenCalled();
    expect(outcome?.status).toBe('error');
  });

  it('Outcome-Subscription kann unsubscribed werden', async () => {
    const saver = createDebouncedSaver(api, { scheduler });
    const handler = vi.fn();
    const unsub = saver.onOutcome(handler);
    unsub();
    saver.queue('terminal_font_size', 14);
    scheduler.flushNext();
    await Promise.resolve();
    await Promise.resolve();
    expect(handler).not.toHaveBeenCalled();
  });

  it('pendingForTest enthält queued Felder vor Flush, leer nach Flush', async () => {
    const saver = createDebouncedSaver(api, { scheduler });
    saver.queue('terminal_font_size', 14);
    expect(saver.pendingForTest()).toEqual({ terminal_font_size: 14 });
    await saver.flush();
    expect(saver.pendingForTest()).toEqual({});
  });
});
