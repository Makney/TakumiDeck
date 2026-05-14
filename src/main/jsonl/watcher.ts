import chokidar, { type FSWatcher } from 'chokidar';
import path from 'node:path';
import os from 'node:os';
import type { Logger } from '../logger';
import type { UsageUpdateEvent, SessionRow } from '@shared/types';
import type { SessionRepository } from '../db/repos/sessions';
import type { MessageRepository } from '../db/repos/messages';
import type { UsageRepository } from '../db/repos/usage';
import type { JsonlOffsetRepository } from '../db/repos/jsonl-offsets';
import { parseJsonlSegment, type JsonlReadDriver } from './parser';
import { hourBucket } from '../db/repos/usage';
import { claudeUuidFromJsonlPath, encodeCwd, encodedCwdFromJsonlPath } from './cwd-encoding';

// JSONL-Watcher (Sprint 5).
//
// chokidar-Glob-Watch über ~/.claude/projects/**/*.jsonl — alle Sessions, die
// claude-code je geschrieben hat, werden mit `ignoreInitial: false` beim ersten
// Start als `add`-Events einlaufen und vom Watcher tail-gelesen. Persistierter
// Offset (jsonl_offsets-Tabelle) verhindert, dass die Historie bei jedem Start
// von vorn gelesen wird.
//
// Architektur-Punkte:
// - Per-Session-Push (kind:'context') sofort, weil immer nur eine Bar betroffen.
// - Globaler Push (kind:'global') debounced 500 ms (Architektur 6.4: max 2 UI-
//   Updates/Sek), damit Bursts die UI nicht stallen.
// - awaitWriteFinish stabilityThreshold 100 ms gegen partielle JSONL-Writes.
// - usePolling: false — native FS-Events reichen auf Windows 11.

export interface JsonlWatcherDeps {
  // Default = ~/.claude/projects. Tests/Settings können das überschreiben.
  watchPath: string;
  reader: JsonlReadDriver;
  offsets: JsonlOffsetRepository;
  messages: MessageRepository;
  usage: UsageRepository;
  sessions: SessionRepository;
  log: Logger;
  push: (event: UsageUpdateEvent) => void;
  now?: () => number;
  globalDebounceMs?: number;
}

export class JsonlWatcher {
  private chokidarWatcher: FSWatcher | null = null;
  private globalPushTimer: ReturnType<typeof setTimeout> | null = null;
  // Anti-Reentrancy pro Datei: chokidar kann mehrere change-Events sehr schnell
  // hintereinander auslösen, aber unsere handleFile-Logik ist async (file-IO + DB).
  // Wenn ein zweites Event reinläuft, während das erste noch arbeitet, würden wir
  // dieselben Bytes zweimal lesen. Eine Map<file, Promise> serialisiert das.
  private inFlight = new Map<string, Promise<void>>();
  private pending = new Set<string>();

  constructor(private readonly deps: JsonlWatcherDeps) {}

  async start(): Promise<void> {
    if (this.chokidarWatcher) return;
    // chokidar v5 hat den Glob-Support entfernt — wir watchen den Root-Pfad und
    // filtern Non-JSONL-Files via `ignored`-Predicate. Verzeichnisse werden nicht
    // ignoriert, damit chokidar Sub-Folder weiter erkennt.
    const watcher = chokidar.watch(this.deps.watchPath, {
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      usePolling: false,
      ignored: (p, stats) => {
        if (!stats) return false; // Verzeichnisse + Initialaufruf durchwinken
        if (stats.isDirectory()) return false;
        return !p.toLowerCase().endsWith('.jsonl');
      },
    });
    watcher.on('add', (p) => void this.scheduleHandle(p));
    watcher.on('change', (p) => void this.scheduleHandle(p));
    watcher.on('error', (e) =>
      this.deps.log.warn('[jsonl-watcher] chokidar-error', e),
    );
    watcher.on('ready', () => {
      const watched = watcher.getWatched();
      const fileCount = Object.values(watched).reduce((acc, list) => acc + list.length, 0);
      this.deps.log.info(
        `[jsonl-watcher] ready watchPath=${this.deps.watchPath} watchedEntries=${fileCount}`,
      );
    });
    this.chokidarWatcher = watcher;
    this.deps.log.info(`[jsonl-watcher] gestartet, Pfad=${this.deps.watchPath}`);
  }

  async stop(): Promise<void> {
    if (this.globalPushTimer) {
      clearTimeout(this.globalPushTimer);
      this.globalPushTimer = null;
    }
    // chokidar zuerst schließen, damit keine *neuen* Events mehr `scheduleHandle`
    // anstoßen. Bestehende inFlight-Promises laufen synchron weiter; wir warten
    // anschließend auf sie, bevor wir zurückkehren — sonst könnte ein noch
    // laufendes handleFile in eine bereits geschlossene DB schreiben (Race beim
    // App-Quit: jsonlWatcher.stop() → db.close()).
    await this.chokidarWatcher?.close();
    this.chokidarWatcher = null;
    // pending-Set leeren: weiteres Re-Schedulen für dieselbe Datei ist nicht mehr
    // gewünscht, der nächste Aufruf von scheduleHandle würde ohnehin auflaufen
    // ohne chokidarWatcher. Aber inFlight muss komplett zu Ende laufen.
    this.pending.clear();
    if (this.inFlight.size > 0) {
      await Promise.allSettled(this.inFlight.values());
    }
  }

  // Phase-2 Season-15: oeffentlicher Hook fuer den JsonlPollingRing. Der Ring
  // ruft die gleiche `scheduleHandle`-Logik wie chokidar, sodass die Anti-
  // Reentrancy-Map und der jsonl_offsets-Tail-Read aus einer Pipeline bedient
  // werden. Wenn der Watcher noch nicht `start()`-ed wurde (theoretisch
  // moeglich, wenn der Ring zuerst attach-ed), laufen die handleFile-Calls
  // trotzdem — chokidar ist nur fuer add-Events zustaendig, change-Events
  // dispatcht der Ring sowieso unabhaengig.
  notifyChanged(filePath: string): void {
    this.scheduleHandle(filePath);
  }

  // Serialisiert Aufrufe pro Datei: läuft schon eine handleFile, wird ein Re-Run
  // nach Abschluss eingeplant (per pending-Set), damit Mid-Read-Änderungen nicht
  // verloren gehen.
  private scheduleHandle(filePath: string): void {
    if (this.inFlight.has(filePath)) {
      this.pending.add(filePath);
      return;
    }
    const run = (async () => {
      try {
        await this.handleFile(filePath);
      } finally {
        this.inFlight.delete(filePath);
        if (this.pending.delete(filePath)) {
          this.scheduleHandle(filePath);
        }
      }
    })();
    this.inFlight.set(filePath, run);
  }

  private async handleFile(filePath: string): Promise<void> {
    try {
      // Schritt 1: TakumiDeck-Session finden, die zu dieser JSONL gehört.
      //
      // Sprint 5: encodeCwd-Match gegen running/idle-Sessions für Live-Tracking.
      // Sprint-6-Hotfix: zusätzlich Backfill-Pfad — claude-codes UUID aus dem
      // Filename in sessions.claude_session_id schreiben (idempotent, einmal pro
      // File-Tick), damit Resume nach Migration 0003 für Legacy-Sessions auch
      // ohne running-Status funktioniert.
      this.backfillClaudeSessionId(filePath);

      const knownSession = this.resolveTakumiSession(filePath);

      const prevOffset = this.deps.offsets.get(filePath);
      const fromOffset = prevOffset?.offset_bytes ?? 0;
      const { segment, truncated } = await this.deps.reader.readTail(filePath, fromOffset);
      // Truncate-Recovery: Datei wurde geschrumpft → Offset zurücksetzen, Segment ist
      // ab Offset 0 gelesen worden.
      const startOffset = truncated ? 0 : fromOffset;
      const { messages, consumedBytes, warnings } = parseJsonlSegment(segment);
      const newOffset = startOffset + consumedBytes;
      const now = (this.deps.now ?? Date.now)();

      let wroteContext = false;
      let wroteUsage = false;

      for (const msg of messages) {
        // messages-Tabelle: nur für Sessions, die TakumiDeck per cwd-Match auflösen
        // konnte. Externe claude-Sessions (z.B. ohne TakumiDeck gestartet) tragen
        // weiter zum globalen Token-Verbrauch bei (usage_buckets).
        if (knownSession) {
          this.deps.messages.insert({
            session_id: knownSession.id,
            project_id: knownSession.project_id,
            role: 'assistant',
            content: msg.rawLine,
            // tokens_in bleibt die Summe input + cache_creation + cache_read
            // (Backward-Compat fuer alle bestehenden Aggregate aus Season
            // 12/13/14). Phase-2 Season Flacsh ergaenzt die getrennten
            // Anteile in eigenen Spalten — damit kann die Cache-Hit-Rate
            // (cache_read / tokens_in) pro Modell berechnet werden, ohne
            // dass die existierenden Token-Aggregate sich verschieben.
            tokens_in: msg.totalTokens,
            tokens_out: msg.outputTokens,
            tokens_cache_creation: msg.cacheCreationInputTokens,
            tokens_cache_read: msg.cacheReadInputTokens,
            ts: msg.ts,
            // Phase-2 Season-10: per-Message-Modell mitschreiben. Der Parser
            // setzt das Feld auf null, wenn message.model fehlt; das landet 1:1
            // in der Spalte und wird vom Detail-Pane-Aggregat als „kein Modell"
            // gefiltert.
            model: msg.model,
          });
          wroteContext = true;
        }
        if (msg.model && msg.totalTokens > 0) {
          this.deps.usage.upsertBucket({
            bucket_start: hourBucket(msg.ts),
            model: msg.model,
            tokens: msg.totalTokens,
          });
          wroteUsage = true;
        }
      }

      // Offset persistieren — auch ohne neue Messages, damit wir nicht beim nächsten
      // Lauf wieder dieselben Leerzeilen / Schema-Reject-Zeilen erneut anfassen.
      if (consumedBytes > 0 || prevOffset === null) {
        this.deps.offsets.set(filePath, newOffset, now);
      }

      if (messages.length > 0) {
        this.deps.log.info(
          `[jsonl-watcher] ${path.basename(filePath)} parsed=${messages.length} bytes=${consumedBytes} session=${knownSession?.id.slice(0, 8) ?? 'extern'}`,
        );
      }
      if (warnings.length > 0) {
        this.deps.log.warn(
          `[jsonl-watcher] ${path.basename(filePath)} ${warnings.length} Warnings — erste: ${warnings[0]}`,
        );
      }

      if (wroteContext && knownSession) {
        this.deps.push({ kind: 'context', sessionId: knownSession.id });
      }
      if (wroteUsage) {
        this.scheduleGlobalPush();
      }
    } catch (e) {
      this.deps.log.warn(`[jsonl-watcher] handleFile fehlgeschlagen ${filePath}: ${e}`);
    }
  }

  // Mapping JSONL-Datei → TakumiDeck-Session (Phase-2 Season-15-Drei-Stufen).
  //
  // Drei orthogonale Stufen, jede deterministischer als die vorherige:
  // 1. `jsonl_path`-Match: pty:create persistiert den erwarteten Pfad sofort
  //    beim Spawn, der Boot-One-Shot-Backfill und der Watcher-Backfill unten
  //    halten ihn auch fuer Legacy-Sessions auf Stand. Eine Index-Lookup-Query.
  // 2. `claude_session_id`-Match (Season-9-Pfad): falls jsonl_path noch nicht
  //    gesetzt ist — z.B. erste Watcher-Sichtung einer Session, deren Spawn
  //    vor dem Season-15-Patch passierte und deren Boot-Backfill noch nicht
  //    gelaufen ist (~/.claude-Datei ist neuer als die DB).
  // 3. encodeCwd-Fallback fuer komplett externe Sessions (claude-Aufruf ohne
  //    TakumiDeck-Spawn), die weder Pfad noch UUID-Bindung haben.
  private resolveTakumiSession(filePath: string): SessionRow | null {
    return resolveJsonlToSession(filePath, {
      findByJsonlPath: (p) => this.deps.sessions.findByJsonlPath(p),
      findByClaudeSessionId: (uuid) => this.deps.sessions.findByClaudeSessionId(uuid),
      listByStatus: (status) => this.deps.sessions.listByStatus(status),
    });
  }

  // Sprint-6-Hotfix: rückwirkend claude_session_id für Sessions ohne UUID setzen.
  //
  // Status-agnostisch (running/idle/completed/interrupted/error/archived alle
  // Kandidaten), damit Legacy-Sessions aus Sprint 2/3 + pre-Hotfix-Sprint-6 nach
  // Migration 0003 resume-fähig werden, sobald der Watcher ihre JSONL einmal
  // gesehen hat. Bei mehreren Kandidaten im selben cwd gewinnt die jüngste —
  // gleiche Heuristik wie resolveTakumiSession (Mehrdeutigkeit ist als Limitation
  // in TECH_SCHULDEN.md festgehalten).
  //
  // Idempotent: setClaudeSessionId überschreibt nicht, daher ist ein erneuter
  // Aufruf für eine bereits befüllte Session ein No-op.
  //
  // Phase-2 Season-15: zusaetzlich `jsonl_path` mit-befuellen, sobald wir die
  // Session aufgeloest haben. Damit ist die Stufe-1-Lookup-Query beim naechsten
  // Tick deterministisch — der Backfill-Scan ueber `listMissingClaudeSessionId`
  // entfaellt fuer diese Datei.
  private backfillClaudeSessionId(filePath: string): void {
    const claudeUuid = claudeUuidFromJsonlPath(filePath);
    if (!claudeUuid) return;
    const folderEncoded = encodedCwdFromJsonlPath(filePath);
    if (!folderEncoded) return;
    const missing = this.deps.sessions.listMissingClaudeSessionId();
    let best: SessionRow | null = null;
    for (const session of missing) {
      if (encodeCwd(session.cwd) !== folderEncoded) continue;
      if (!best || session.started_at > best.started_at) best = session;
    }
    if (!best) return;
    const updated = this.deps.sessions.setClaudeSessionId(best.id, claudeUuid);
    if (updated) {
      this.deps.log.info(
        `[jsonl-watcher] claude_session_id backfilled session=${best.id.slice(0, 8)} → ${claudeUuid.slice(0, 8)} (status=${best.status})`,
      );
    }
    // Phase-2 Season-15: jsonl_path mitfuehren, auch wenn die UUID schon stand
    // (Pre-Patch-Sessions haben claude_session_id, aber jsonl_path NULL).
    if (best.jsonl_path === null) {
      this.deps.sessions.setJsonlPath(best.id, filePath);
    }
  }

  private scheduleGlobalPush(): void {
    const delay = this.deps.globalDebounceMs ?? 500;
    if (this.globalPushTimer) clearTimeout(this.globalPushTimer);
    this.globalPushTimer = setTimeout(() => {
      this.globalPushTimer = null;
      this.deps.push({ kind: 'global' });
    }, delay);
  }
}

// Default-Watch-Pfad. claude-code schreibt nach ~/.claude/projects/.
export function defaultClaudeProjectsPath(): string {
  return path.join(os.homedir(), '.claude', 'projects');
}

// Phase-2 Season-8: pure JSONL→Session-Resolver mit injizierten Repo-Methoden,
// damit Tests die Logik ohne kompletten JsonlWatcher-Aufbau pruefen koennen.
// Phase-2 Season-15: zusaetzliche erste Stufe `findByJsonlPath` vor der
// UUID-Aufloesung — sobald der Pfad persistiert ist, sparen wir die Filename-
// Parse-Runde plus den UUID-Index-Lookup.
export interface JsonlResolverDeps {
  findByJsonlPath: (jsonlPath: string) => SessionRow | null;
  findByClaudeSessionId: (uuid: string) => SessionRow | null;
  listByStatus: (status: SessionRow['status']) => SessionRow[];
}

export function resolveJsonlToSession(
  filePath: string,
  deps: JsonlResolverDeps,
): SessionRow | null {
  // 1. Path-First: deterministisch ueber den persistierten jsonl_path. Spawn-
  //    Pfad (Season 15) setzt ihn beim pty:create, der Boot-One-Shot-Backfill
  //    deckt Legacy-Bestaende ab, und der Watcher-Backfill unten holt alles
  //    nach, was bisher durch das Raster gefallen war.
  const direct = deps.findByJsonlPath(filePath);
  if (direct) return direct;
  // 2. UUID-Match (Season-9-Pfad): falls jsonl_path noch nicht gesetzt ist.
  const claudeUuid = claudeUuidFromJsonlPath(filePath);
  if (claudeUuid) {
    const viaUuid = deps.findByClaudeSessionId(claudeUuid);
    if (viaUuid) return viaUuid;
  }
  // 3. Fallback: cwd-Encoded-Match auf live-Sessions (Externe / Pre-Backfill).
  const folderEncoded = encodedCwdFromJsonlPath(filePath);
  if (!folderEncoded) return null;
  const candidates = [
    ...deps.listByStatus('running'),
    ...deps.listByStatus('idle'),
  ];
  let best: SessionRow | null = null;
  for (const session of candidates) {
    if (encodeCwd(session.cwd) !== folderEncoded) continue;
    if (!best || session.started_at > best.started_at) best = session;
  }
  return best;
}
