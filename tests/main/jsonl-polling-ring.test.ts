import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  JsonlPollingRing,
  type JsonlStatDriver,
} from '../../src/main/jsonl/polling-ring';
import type { Logger } from '../../src/main/logger';

// Phase-2 Season-15 — Per-Session-Polling fuer Live-Token-Updates.
//
// Tests faden den setInterval/clearInterval-Hook ein und steuern die Ticks per
// Hand; der stat-Driver ist ebenfalls injiziert. Damit ist die Tick-Logik ohne
// echte Filesystem-Beruehrung und ohne Real-Time-Wait testbar.

interface FakeTimerEnv {
  setIntervalFn: typeof setInterval;
  clearIntervalFn: typeof clearInterval;
  tickAll(): Promise<void>;
  activeTimerCount(): number;
}

function makeFakeTimers(): FakeTimerEnv {
  let nextHandleId = 1;
  const handles = new Map<number, () => void>();
  const setIntervalFn = ((cb: () => void) => {
    const id = nextHandleId++;
    handles.set(id, cb);
    return id as unknown as ReturnType<typeof setInterval>;
  }) as unknown as typeof setInterval;
  const clearIntervalFn = ((handle: ReturnType<typeof setInterval>) => {
    handles.delete(handle as unknown as number);
  }) as unknown as typeof clearInterval;
  return {
    setIntervalFn,
    clearIntervalFn,
    async tickAll() {
      // Kopie ziehen, damit ein Callback, der waehrend des Ticks detach()
      // ruft, den darauf folgenden Callback nicht in der gleichen Runde
      // beeinflusst.
      const snapshot = Array.from(handles.values());
      for (const cb of snapshot) cb();
      // Tick-Bodys sind async (`void this.tick(...)`); ein Mikrotask reicht,
      // damit die Promise-Ketten innerhalb von tick() abgearbeitet sind.
      await Promise.resolve();
      await Promise.resolve();
    },
    activeTimerCount() {
      return handles.size;
    },
  };
}

interface FakeStatDriver extends JsonlStatDriver {
  setStat(filePath: string, stat: { mtimeMs: number; size: number } | null): void;
  setError(filePath: string, err: NodeJS.ErrnoException): void;
}

function makeFakeStat(): FakeStatDriver {
  const stats = new Map<string, { mtimeMs: number; size: number }>();
  const errors = new Map<string, NodeJS.ErrnoException>();
  return {
    async stat(filePath) {
      const e = errors.get(filePath);
      if (e) throw e;
      const s = stats.get(filePath);
      if (!s) {
        const err = new Error('ENOENT') as NodeJS.ErrnoException;
        err.code = 'ENOENT';
        throw err;
      }
      return s;
    },
    setStat(filePath, stat) {
      if (stat === null) stats.delete(filePath);
      else stats.set(filePath, stat);
    },
    setError(filePath, err) {
      errors.set(filePath, err);
    },
  };
}

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
}

describe('JsonlPollingRing', () => {
  let timers: FakeTimerEnv;
  let stat: FakeStatDriver;
  let onChange: ReturnType<typeof vi.fn>;
  let log: Logger;

  beforeEach(() => {
    timers = makeFakeTimers();
    stat = makeFakeStat();
    onChange = vi.fn();
    log = makeLogger();
  });

  function makeRing(intervalMs = 250): JsonlPollingRing {
    return new JsonlPollingRing({
      onChange,
      intervalMs,
      stat,
      log,
      setIntervalFn: timers.setIntervalFn,
      clearIntervalFn: timers.clearIntervalFn,
    });
  }

  it('attach legt einen Timer pro Session an', () => {
    const ring = makeRing();
    expect(timers.activeTimerCount()).toBe(0);
    ring.attach('sess-a', '/a.jsonl');
    expect(timers.activeTimerCount()).toBe(1);
    ring.attach('sess-b', '/b.jsonl');
    expect(timers.activeTimerCount()).toBe(2);
    expect(ring.attachedSessions().sort()).toEqual(['sess-a', 'sess-b']);
  });

  it('attach mit gleichem Pfad ist No-op (kein zweiter Timer)', () => {
    const ring = makeRing();
    ring.attach('sess-a', '/a.jsonl');
    ring.attach('sess-a', '/a.jsonl');
    expect(timers.activeTimerCount()).toBe(1);
  });

  it('attach mit neuem Pfad killt den alten Timer und startet einen neuen', () => {
    const ring = makeRing();
    ring.attach('sess-a', '/old.jsonl');
    ring.attach('sess-a', '/new.jsonl');
    // Genau 1 Timer (alter killed, neuer drin)
    expect(timers.activeTimerCount()).toBe(1);
    expect(ring.isAttached('sess-a')).toBe(true);
  });

  it('detach killt den Timer und vergisst die Session', () => {
    const ring = makeRing();
    ring.attach('sess-a', '/a.jsonl');
    ring.detach('sess-a');
    expect(timers.activeTimerCount()).toBe(0);
    expect(ring.isAttached('sess-a')).toBe(false);
  });

  it('detach einer nie attached Session ist No-op', () => {
    const ring = makeRing();
    ring.detach('ghost');
    expect(timers.activeTimerCount()).toBe(0);
  });

  it('stopAll killt alle Timer', () => {
    const ring = makeRing();
    ring.attach('a', '/a.jsonl');
    ring.attach('b', '/b.jsonl');
    ring.attach('c', '/c.jsonl');
    ring.stopAll();
    expect(timers.activeTimerCount()).toBe(0);
    expect(ring.attachedSessions()).toEqual([]);
  });

  it('tick ohne stat-Daten (ENOENT) ruft onChange NICHT', async () => {
    const ring = makeRing();
    ring.attach('sess-a', '/missing.jsonl');
    await timers.tickAll();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tick mit unveraenderter Datei (mtime + size gleich) ruft onChange genau einmal', async () => {
    const ring = makeRing();
    stat.setStat('/a.jsonl', { mtimeMs: 1000, size: 500 });
    ring.attach('sess-a', '/a.jsonl');
    // Erster Tick: lastMtimeMs/lastSize sind beide null → "changed", onChange feuert.
    await timers.tickAll();
    expect(onChange).toHaveBeenCalledTimes(1);
    // Zweiter Tick: Werte identisch → kein onChange-Call.
    await timers.tickAll();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('tick mit mtime-Aenderung feuert onChange erneut', async () => {
    const ring = makeRing();
    stat.setStat('/a.jsonl', { mtimeMs: 1000, size: 500 });
    ring.attach('sess-a', '/a.jsonl');
    await timers.tickAll();
    expect(onChange).toHaveBeenCalledTimes(1);
    stat.setStat('/a.jsonl', { mtimeMs: 2000, size: 500 });
    await timers.tickAll();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('tick mit size-Aenderung (Tail-Append, mtime hier identisch im Fake) feuert onChange', async () => {
    const ring = makeRing();
    stat.setStat('/a.jsonl', { mtimeMs: 1000, size: 500 });
    ring.attach('sess-a', '/a.jsonl');
    await timers.tickAll();
    stat.setStat('/a.jsonl', { mtimeMs: 1000, size: 800 });
    await timers.tickAll();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('tick passt den onChange-Pfad an den jsonlPath der Session an', async () => {
    const ring = makeRing();
    stat.setStat('/sess-a.jsonl', { mtimeMs: 1000, size: 100 });
    stat.setStat('/sess-b.jsonl', { mtimeMs: 1000, size: 100 });
    ring.attach('sess-a', '/sess-a.jsonl');
    ring.attach('sess-b', '/sess-b.jsonl');
    await timers.tickAll();
    expect(onChange.mock.calls.map((c) => c[0]).sort()).toEqual([
      '/sess-a.jsonl',
      '/sess-b.jsonl',
    ]);
  });

  it('andere stat-Fehler (z.B. EACCES) loggen, ohne onChange zu feuern', async () => {
    const ring = makeRing();
    const err = new Error('access denied') as NodeJS.ErrnoException;
    err.code = 'EACCES';
    stat.setError('/locked.jsonl', err);
    ring.attach('sess-a', '/locked.jsonl');
    await timers.tickAll();
    expect(onChange).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });

  it('detach zwischen zwei Ticks stoppt die Polling-Sequenz', async () => {
    const ring = makeRing();
    stat.setStat('/a.jsonl', { mtimeMs: 1000, size: 100 });
    ring.attach('sess-a', '/a.jsonl');
    await timers.tickAll();
    expect(onChange).toHaveBeenCalledTimes(1);
    ring.detach('sess-a');
    stat.setStat('/a.jsonl', { mtimeMs: 2000, size: 100 });
    await timers.tickAll();
    // Kein neuer Call — Timer wurde geclear'd.
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
