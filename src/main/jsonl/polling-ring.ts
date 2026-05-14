// JSONL-Polling-Ring (Phase 2 Season 15, Variante A: Per-Session-Timer).
//
// Zweck: Live-Token-Updates fuer Token-Bars und Per-Session-Kontext-Bar,
// waehrend claude noch generiert. Chokidars `awaitWriteFinish: 100 ms` haelt
// `change`-Events solange zurueck, bis die JSONL 100 ms ruhig ist — bei einer
// laufenden Antwort heisst das: Updates erst am Antwort-Ende, nicht pro Stream-
// Chunk. Der Polling-Ring laeuft parallel zur bestehenden chokidar-Pipeline
// und reicht die gleichen handleFile-Hooks an. `add`-Events fuer initial
// entdeckte Dateien bleiben Chokidar — wir polln nur, was wir per
// `attach(sessionId, jsonlPath)` explizit kennen.
//
// Architektur:
// - Pro aktiver Session ein `setInterval(intervalMs)`, der `fs.stat`-t und
//   bei mtime/size-Aenderung den HandleFile-Callback feuert.
// - `attach` ist idempotent: zweiter Aufruf mit derselben Session ueberschreibt
//   den Pfad und setzt den Timer neu auf (z.B. Resume mit gleicher Datei).
// - `detach` clearInterval-t und vergisst die letzte stat-Marke; ein erneuter
//   `attach` liest die Datei wieder ab dem persistierten jsonl_offsets-Offset
//   (Pipeline kennt den Tail-Anker, nicht das hier).
// - `stopAll` ist der App-Quit-Pfad: alle Timer killen, Map leeren.
//
// Diff-Erkennung: wir vergleichen `mtimeMs` (Float, Sub-ms-Aufloesung auf NTFS)
// und `size`. Nur wenn sich beides nicht geaendert hat, ist der Tick ein
// No-op. Bei Truncate-Recovery (claude rotiert nie, aber Tests koennen das)
// faellt der size-Vergleich auf "kleiner als vorher" und wir feuern handle —
// die Pipeline (parseJsonlSegment + jsonl_offsets) erkennt das selbst und
// resettet den Offset.
//
// Tests fahren `fs.stat` per injizierten StatDriver und steuern die Zeit per
// `setInterval`-Override (vitest fake timers reichen). Production nutzt den
// realen `fs.promises.stat`.

import type { Stats } from 'node:fs';
import { promises as fs } from 'node:fs';
import type { Logger } from '../logger';

// Schmaler stat-Driver fuer Tests. Production faehrt `realStatDriver` weiter
// unten ein.
export interface JsonlStatDriver {
  stat(filePath: string): Promise<Pick<Stats, 'mtimeMs' | 'size'>>;
}

export const realStatDriver: JsonlStatDriver = {
  async stat(filePath: string) {
    return fs.stat(filePath);
  },
};

export interface JsonlPollingRingDeps {
  // Wird pro detektierter Aenderung gerufen. Implementierung: der bestehende
  // `JsonlWatcher.handleFile`-Pfad (ueber `scheduleHandle`, damit die Anti-
  // Reentrancy-Logik der bestehenden Pipeline mitlaeuft).
  onChange: (filePath: string) => void;
  // Default 250 ms — Trade-off aus Updates-Per-Sekunde vs. fs.stat-CPU. Tests
  // setzen den Wert auf 0 + Fake-Timer.
  intervalMs?: number;
  stat?: JsonlStatDriver;
  log: Logger;
  // Test-Hook, damit Vitest setInterval/clearInterval-Stubs einklinken kann.
  // Default = global setInterval/clearInterval.
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
}

interface SessionWatch {
  jsonlPath: string;
  timer: ReturnType<typeof setInterval>;
  // Letzte beobachtete Werte; null = noch nie erfolgreich gestat-t (frischer
  // attach oder Datei existiert noch nicht).
  lastMtimeMs: number | null;
  lastSize: number | null;
  // Anti-Reentrancy: ueberlappende stat-Calls verhindern, wenn ein Tick noch
  // wartet. Pro-Session-Granularitaet reicht — verschiedene Sessions duerfen
  // parallel.
  inFlight: boolean;
}

export class JsonlPollingRing {
  private readonly intervalMs: number;
  private readonly stat: JsonlStatDriver;
  private readonly log: Logger;
  private readonly onChange: (filePath: string) => void;
  private readonly setIntervalFn: typeof setInterval;
  private readonly clearIntervalFn: typeof clearInterval;
  private readonly watches = new Map<string, SessionWatch>();

  constructor(deps: JsonlPollingRingDeps) {
    this.onChange = deps.onChange;
    this.intervalMs = deps.intervalMs ?? 250;
    this.stat = deps.stat ?? realStatDriver;
    this.log = deps.log;
    this.setIntervalFn = deps.setIntervalFn ?? setInterval;
    this.clearIntervalFn = deps.clearIntervalFn ?? clearInterval;
  }

  // Polling fuer eine Session starten. Idempotent — ein zweiter Aufruf mit
  // gleicher sessionId killt den alten Timer (falls jsonlPath sich geaendert
  // hat, z.B. theoretischer claude-UUID-Reuse) und startet einen neuen.
  attach(sessionId: string, jsonlPath: string): void {
    const existing = this.watches.get(sessionId);
    if (existing && existing.jsonlPath === jsonlPath) {
      // Same path — nichts zu tun. Timer laeuft weiter.
      return;
    }
    if (existing) {
      this.clearIntervalFn(existing.timer);
    }
    const watch: SessionWatch = {
      jsonlPath,
      lastMtimeMs: null,
      lastSize: null,
      inFlight: false,
      // Wird gleich ueberschrieben, aber TS verlangt einen Wert.
      timer: 0 as unknown as ReturnType<typeof setInterval>,
    };
    watch.timer = this.setIntervalFn(() => {
      void this.tick(sessionId);
    }, this.intervalMs);
    this.watches.set(sessionId, watch);
  }

  detach(sessionId: string): void {
    const existing = this.watches.get(sessionId);
    if (!existing) return;
    this.clearIntervalFn(existing.timer);
    this.watches.delete(sessionId);
  }

  stopAll(): void {
    for (const watch of this.watches.values()) {
      this.clearIntervalFn(watch.timer);
    }
    this.watches.clear();
  }

  // Test-Hook: liste der aktuell attached Session-IDs (fuer Assertions).
  attachedSessions(): string[] {
    return Array.from(this.watches.keys());
  }

  // Test-Hook: ist diese Session aktuell attached?
  isAttached(sessionId: string): boolean {
    return this.watches.has(sessionId);
  }

  private async tick(sessionId: string): Promise<void> {
    const watch = this.watches.get(sessionId);
    if (!watch) return;
    if (watch.inFlight) return; // letzter stat-Call laeuft noch
    watch.inFlight = true;
    try {
      let stats: Pick<Stats, 'mtimeMs' | 'size'>;
      try {
        stats = await this.stat.stat(watch.jsonlPath);
      } catch (e) {
        // Datei existiert (noch) nicht — claude legt sie erst nach dem ersten
        // Response-Frame an. Stiller no-op, naechster Tick versucht es nochmal.
        // ENOENT ist hier der haeufige Fall; andere Fehler (EACCES etc.) loggen
        // wir, damit sie nicht still verloren gehen.
        const code = (e as NodeJS.ErrnoException).code;
        if (code !== 'ENOENT') {
          this.log.warn(
            `[jsonl-polling] stat fehlgeschlagen sessionId=${sessionId.slice(0, 8)} path=${watch.jsonlPath}: ${e}`,
          );
        }
        return;
      }
      const mtimeChanged =
        watch.lastMtimeMs === null || stats.mtimeMs !== watch.lastMtimeMs;
      const sizeChanged = watch.lastSize === null || stats.size !== watch.lastSize;
      if (!mtimeChanged && !sizeChanged) {
        return;
      }
      watch.lastMtimeMs = stats.mtimeMs;
      watch.lastSize = stats.size;
      this.onChange(watch.jsonlPath);
    } finally {
      // Map koennte zwischen await und finally weggekommen sein (detach im
      // Parallel-Tab). Aktuelle Watch nochmal holen, damit wir nicht den
      // inFlight-Flag eines zwischenzeitlich neuen Attach-Calls plattmachen.
      const current = this.watches.get(sessionId);
      if (current === watch) {
        watch.inFlight = false;
      }
    }
  }
}
