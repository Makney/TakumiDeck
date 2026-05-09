import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PtyManager, type IPtyLike, type PtySpawn } from '../../src/main/pty/manager';
import type { PtyDataEvent, PtyExitEvent } from '../../src/shared/types';

// Fake-PTY analog zum Migration-Runner-Pattern: kein echter Subprozess, sondern eine
// Capture-Struktur mit emitData/emitExit, die der Test-Driver gegen den Manager fährt.
function makeFakePty() {
  let dataHandler: ((d: string) => void) | null = null;
  let exitHandler: ((e: { exitCode: number; signal?: number }) => void) | null = null;
  const writes: string[] = [];
  const resizes: { cols: number; rows: number }[] = [];
  let killCalls = 0;
  let killSignal: string | undefined;

  const pty: IPtyLike = {
    onData: (cb) => {
      dataHandler = cb;
      return undefined;
    },
    onExit: (cb) => {
      exitHandler = cb;
      return undefined;
    },
    write: (data) => {
      writes.push(data);
    },
    resize: (cols, rows) => {
      resizes.push({ cols, rows });
    },
    kill: (signal) => {
      killCalls += 1;
      killSignal = signal;
    },
  };

  return {
    pty,
    emitData: (d: string) => dataHandler?.(d),
    emitExit: (exitCode: number, signal?: number) => exitHandler?.({ exitCode, signal }),
    writes,
    resizes,
    get killCalls() {
      return killCalls;
    },
    get killSignal() {
      return killSignal;
    },
  };
}

interface Capture {
  manager: PtyManager;
  data: PtyDataEvent[];
  exit: PtyExitEvent[];
  ptys: ReturnType<typeof makeFakePty>[];
  spawn: PtySpawn;
}

function makeCapture(flushIntervalMs = 16): Capture {
  const ptys: ReturnType<typeof makeFakePty>[] = [];
  const spawn: PtySpawn = () => {
    const fake = makeFakePty();
    ptys.push(fake);
    return fake.pty;
  };
  const data: PtyDataEvent[] = [];
  const exit: PtyExitEvent[] = [];
  const manager = new PtyManager(spawn, flushIntervalMs);
  manager.setListeners({
    data: (e) => data.push(e),
    exit: (e) => exit.push(e),
  });
  return { manager, data, exit, ptys, spawn };
}

const opts = {
  shell: 'claude',
  args: ['--model', 'claude-sonnet-4-6'],
  cwd: '/tmp',
  cols: 80,
  rows: 24,
};

describe('PtyManager', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('create() legt Handle für sessionId an', () => {
    const cap = makeCapture();
    cap.manager.create('s1', opts);
    expect(cap.manager.has('s1')).toBe(true);
    expect(cap.manager.size()).toBe(1);
  });

  it('create() mit doppelter sessionId wirft', () => {
    const cap = makeCapture();
    cap.manager.create('s1', opts);
    expect(() => cap.manager.create('s1', opts)).toThrow(/existiert bereits/);
  });

  it('Daten werden gepuffert und nach flushIntervalMs als ein Event geflusht', () => {
    const cap = makeCapture(16);
    cap.manager.create('s1', opts);
    const fake = cap.ptys[0]!;

    fake.emitData('foo');
    fake.emitData('bar');
    expect(cap.data).toEqual([]);

    vi.advanceTimersByTime(16);
    expect(cap.data).toEqual([{ sessionId: 's1', data: 'foobar' }]);
  });

  it('zwei getrennte Bursts ergeben zwei Flushes', () => {
    const cap = makeCapture(16);
    cap.manager.create('s1', opts);
    const fake = cap.ptys[0]!;

    fake.emitData('A');
    vi.advanceTimersByTime(16);
    fake.emitData('B');
    vi.advanceTimersByTime(16);

    expect(cap.data).toEqual([
      { sessionId: 's1', data: 'A' },
      { sessionId: 's1', data: 'B' },
    ]);
  });

  it('Timer ist lazy: ohne Daten kein Flush', () => {
    const cap = makeCapture(16);
    cap.manager.create('s1', opts);
    vi.advanceTimersByTime(1000);
    expect(cap.data).toEqual([]);
  });

  it('Exit flusht Pending-Daten und emittet exit, danach Handle entfernt', () => {
    const cap = makeCapture(16);
    cap.manager.create('s1', opts);
    const fake = cap.ptys[0]!;

    fake.emitData('tail');
    fake.emitExit(0);

    expect(cap.data).toEqual([{ sessionId: 's1', data: 'tail' }]);
    expect(cap.exit).toEqual([{ sessionId: 's1', exitCode: 0, signal: undefined }]);
    expect(cap.manager.has('s1')).toBe(false);
  });

  it('write/resize/kill forwarden ans pty-Handle', () => {
    const cap = makeCapture();
    cap.manager.create('s1', opts);
    const fake = cap.ptys[0]!;

    cap.manager.write('s1', 'hello');
    cap.manager.resize('s1', 120, 30);
    cap.manager.kill('s1');

    expect(fake.writes).toEqual(['hello']);
    expect(fake.resizes).toEqual([{ cols: 120, rows: 30 }]);
    expect(fake.killCalls).toBe(1);
  });

  it('Operationen auf unbekannter sessionId werfen', () => {
    const cap = makeCapture();
    expect(() => cap.manager.write('ghost', 'x')).toThrow(/Keine PTY/);
    expect(() => cap.manager.resize('ghost', 80, 24)).toThrow(/Keine PTY/);
    expect(() => cap.manager.kill('ghost')).toThrow(/Keine PTY/);
  });

  it('killAll killt alle Handles', () => {
    const cap = makeCapture();
    cap.manager.create('s1', opts);
    cap.manager.create('s2', opts);
    cap.manager.killAll();
    expect(cap.ptys[0]!.killCalls).toBe(1);
    expect(cap.ptys[1]!.killCalls).toBe(1);
  });

  it('Daten nach Exit werden ignoriert (keine Geister-Flushes)', () => {
    const cap = makeCapture(16);
    cap.manager.create('s1', opts);
    const fake = cap.ptys[0]!;

    fake.emitExit(0);
    fake.emitData('zu spät');
    vi.advanceTimersByTime(50);

    // Nur die exit-Emission, kein data-Event.
    expect(cap.data).toEqual([]);
    expect(cap.exit).toHaveLength(1);
  });
});
