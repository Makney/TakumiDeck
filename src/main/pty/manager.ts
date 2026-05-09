import type { PtyDataEvent, PtyExitEvent } from '@shared/types';

// PTY-Manager: hält pro sessionId ein PtyHandle (PTY + Output-Buffer + Flush-Timer)
// und drosselt den Output Richtung Renderer auf einen 16ms-Interval (Architektur K3).
// Spawnt nicht selbst — der Spawn-Driver wird per Konstruktor injiziert, damit
// Tests einen Fake-Driver einsetzen können (siehe Migration-Runner-Pattern).

// Minimal-Shape, die wir vom realen node-pty-IPty brauchen.
// Gibt unknown zurück, weil weder IDisposable noch return-value für unsere Logik relevant sind.
export interface IPtyLike {
  onData: (cb: (data: string) => void) => unknown;
  onExit: (cb: (e: { exitCode: number; signal?: number }) => void) => unknown;
  write: (data: string) => void;
  resize: (cols: number, rows: number) => void;
  kill: (signal?: string) => void;
}

export interface PtySpawnOptions {
  shell: string;
  args: string[];
  cwd: string;
  cols: number;
  rows: number;
  env?: Record<string, string | undefined>;
}

export type PtySpawn = (opts: PtySpawnOptions) => IPtyLike;

export type PtyDataListener = (event: PtyDataEvent) => void;
export type PtyExitListener = (event: PtyExitEvent) => void;

interface PtyHandle {
  sessionId: string;
  pty: IPtyLike;
  buffer: string;
  // Lazy-Timer: ist null, solange der Buffer leer ist; wird bei eingehenden Daten
  // gesetzt und nach dem Flush wieder genullt. Verhindert Idle-Last ohne Output.
  flushTimer: NodeJS.Timeout | null;
  exited: boolean;
}

export class PtyManager {
  private readonly handles = new Map<string, PtyHandle>();
  private dataListener: PtyDataListener = () => undefined;
  private exitListener: PtyExitListener = () => undefined;

  constructor(
    private readonly spawn: PtySpawn,
    private readonly flushIntervalMs = 16,
  ) {}

  // Wird einmal beim App-Start aufgerufen; der IPC-Bridge-Adapter forwarded
  // die Events ans webContents.send().
  setListeners(listeners: { data: PtyDataListener; exit: PtyExitListener }): void {
    this.dataListener = listeners.data;
    this.exitListener = listeners.exit;
  }

  has(sessionId: string): boolean {
    return this.handles.has(sessionId);
  }

  size(): number {
    return this.handles.size;
  }

  create(sessionId: string, options: PtySpawnOptions): void {
    if (this.handles.has(sessionId)) {
      throw new Error(`PTY für Session ${sessionId} existiert bereits`);
    }
    const pty = this.spawn(options);
    const handle: PtyHandle = {
      sessionId,
      pty,
      buffer: '',
      flushTimer: null,
      exited: false,
    };
    this.handles.set(sessionId, handle);

    pty.onData((data) => {
      // Auch nach Exit könnten noch Daten reinkommen — die ignorieren wir, damit
      // wir keinen Eintrag in eine bereits verschwundene Session schreiben.
      if (handle.exited) return;
      handle.buffer += data;
      this.scheduleFlush(handle);
    });

    pty.onExit(({ exitCode, signal }) => {
      handle.exited = true;
      // Pending-Daten noch durchreichen, bevor wir das Handle entfernen.
      this.flushNow(handle);
      this.handles.delete(sessionId);
      this.exitListener({ sessionId, exitCode, signal });
    });
  }

  write(sessionId: string, data: string): void {
    const handle = this.requireHandle(sessionId);
    handle.pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const handle = this.requireHandle(sessionId);
    handle.pty.resize(cols, rows);
  }

  kill(sessionId: string, signal?: string): void {
    const handle = this.requireHandle(sessionId);
    handle.pty.kill(signal);
    // Das eigentliche Handle-Cleanup macht der onExit-Callback.
  }

  // Beim App-Beenden: alle PTYs hart killen, damit keine claude-Subprozesse zurückbleiben.
  killAll(signal?: string): void {
    for (const handle of this.handles.values()) {
      try {
        handle.pty.kill(signal);
      } catch {
        // Bewusst geschluckt: eine bereits beendete PTY zu killen ist keine echte Panik.
      }
    }
  }

  private requireHandle(sessionId: string): PtyHandle {
    const handle = this.handles.get(sessionId);
    if (!handle) {
      throw new Error(`Keine PTY für Session ${sessionId}`);
    }
    return handle;
  }

  private scheduleFlush(handle: PtyHandle): void {
    if (handle.flushTimer !== null) return;
    handle.flushTimer = setTimeout(() => this.flushNow(handle), this.flushIntervalMs);
  }

  private flushNow(handle: PtyHandle): void {
    if (handle.flushTimer !== null) {
      clearTimeout(handle.flushTimer);
      handle.flushTimer = null;
    }
    if (handle.buffer.length === 0) return;
    const data = handle.buffer;
    handle.buffer = '';
    this.dataListener({ sessionId: handle.sessionId, data });
  }
}
