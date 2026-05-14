import type Database from 'better-sqlite3';
import type { MessageInsert, SessionModelAggregateEntry } from '@shared/types';

// MessageRepository (Sprint 5).
//
// Persistiert die einzelnen JSONL-Zeilen pro Session. Die Hourly-Aggregate
// werden parallel in usage_buckets geschrieben (siehe UsageRepository) — diese
// Tabelle ist für Per-Session-Detail (Verlauf-Panel Sprint 6, Detail-Modal jetzt)
// und für die State-Detection (Last-Event-Timestamp pro Session) zuständig.

export interface MessageDbDriver {
  insert(row: MessageInsert): void;
  // Letzter ts pro Session — wird vom State-Detection-Pfad und der Per-Session-
  // Kontext-Bar gelesen. Returnt null, wenn die Session noch keine messages hat.
  lastTimestampForSession(sessionId: string): number | null;
  // Rolle der letzten Message — wird vom State-Detection-Loop für die
  // `waiting`-Erkennung genutzt: last role = 'assistant' + stale timestamp
  // bedeutet Claude hat geantwortet und wartet auf User-Input.
  lastRoleForSession(sessionId: string): 'assistant' | 'user' | null;
  // Letzter usage-Stand der Session (für die Per-Session-Kontext-Bar). Liefert
  // tokens_in/tokens_out und ts der zuletzt eingelesenen Zeile, null wenn die
  // Session noch keine Messages hat. Modell-Info hängt nicht an `messages` (gehört
  // zu usage_buckets); der Caller liest sie aus session.current_model.
  lastUsageForSession(sessionId: string): LastUsageRow | null;
  // Phase-2 Season-10: Modell-Aggregat fuer den Detail-Pane des Verlauf-Panels.
  // Zaehlt messages.model pro Session, NULL-Modelle werden ausgeschlossen.
  // Sortierung: count DESC, model ASC (Tie-Break deterministisch fuer Tests).
  aggregateModelsForSession(sessionId: string): SessionModelAggregateEntry[];
  // Phase-2 Season-10: Bulk-Variante fuer das Verlauf-Panel — eine einzige
  // Query liefert die Aggregate fuer mehrere Sessions, gruppiert nach session_id.
  // Vermeidet den N+1-Aufruf beim History-Listing. Leeres Array → leere Map.
  aggregateModelsForSessions(sessionIds: string[]): Map<string, SessionModelAggregateEntry[]>;
}

export interface LastUsageRow {
  ts: number;
  tokens_in: number;
  tokens_out: number;
}

export class MessageRepository {
  constructor(private readonly driver: MessageDbDriver) {}

  insert(row: MessageInsert): void {
    this.driver.insert(row);
  }

  lastTimestampForSession(sessionId: string): number | null {
    return this.driver.lastTimestampForSession(sessionId);
  }

  lastRoleForSession(sessionId: string): 'assistant' | 'user' | null {
    return this.driver.lastRoleForSession(sessionId);
  }

  lastUsageForSession(sessionId: string): LastUsageRow | null {
    return this.driver.lastUsageForSession(sessionId);
  }

  aggregateModelsForSession(sessionId: string): SessionModelAggregateEntry[] {
    return this.driver.aggregateModelsForSession(sessionId);
  }

  aggregateModelsForSessions(sessionIds: string[]): Map<string, SessionModelAggregateEntry[]> {
    return this.driver.aggregateModelsForSessions(sessionIds);
  }
}

// --- SQLite-Driver --------------------------------------------------

export class SqliteMessageDriver implements MessageDbDriver {
  private readonly insertStmt: Database.Statement;
  private readonly lastTsStmt: Database.Statement<[string], { ts: number }>;
  private readonly lastRoleStmt: Database.Statement<[string], { role: string }>;
  private readonly lastUsageStmt: Database.Statement<[string], LastUsageRow>;
  private readonly modelAggregateStmt: Database.Statement<
    [string],
    { model: string; count: number }
  >;
  // Phase-2 Season-10: dynamisches IN(...)-Statement fuer die Bulk-Aggregation.
  // Statement-Cache analog zum sessionsHistory-Pattern — pro IN-Listen-Laenge
  // einmal compiled, weil better-sqlite3 keine variable-length-IN nativ kann.
  private readonly modelAggregateBulkCache = new Map<
    number,
    Database.Statement<unknown[], { session_id: string; model: string; count: number }>
  >();

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(
      `INSERT INTO messages (
        session_id, project_id, role, content, tokens_in, tokens_out, ts, model
      ) VALUES (
        @session_id, @project_id, @role, @content, @tokens_in, @tokens_out, @ts, @model
      )`,
    );
    this.lastTsStmt = db.prepare<[string], { ts: number }>(
      'SELECT ts FROM messages WHERE session_id = ? ORDER BY ts DESC LIMIT 1',
    );
    this.lastRoleStmt = db.prepare<[string], { role: string }>(
      'SELECT role FROM messages WHERE session_id = ? ORDER BY ts DESC LIMIT 1',
    );
    this.lastUsageStmt = db.prepare<[string], LastUsageRow>(
      'SELECT ts, tokens_in, tokens_out FROM messages WHERE session_id = ? ORDER BY ts DESC LIMIT 1',
    );
    this.modelAggregateStmt = db.prepare<[string], { model: string; count: number }>(
      `SELECT model, COUNT(*) AS count
       FROM messages
       WHERE session_id = ? AND model IS NOT NULL
       GROUP BY model
       ORDER BY count DESC, model ASC`,
    );
  }

  insert(row: MessageInsert): void {
    // better-sqlite3 weist `undefined`-Werte an Named-Binds zurueck — der
    // Watcher liefert `model` ab Season 10 immer, aber aeltere Test-Aufrufer
    // setzen das Feld nicht. Normalisiere `undefined → null`, damit die
    // Insert-Signatur tolerant bleibt.
    this.insertStmt.run({ ...row, model: row.model ?? null });
  }

  lastTimestampForSession(sessionId: string): number | null {
    const row = this.lastTsStmt.get(sessionId);
    return row ? row.ts : null;
  }

  lastRoleForSession(sessionId: string): 'assistant' | 'user' | null {
    const row = this.lastRoleStmt.get(sessionId);
    if (!row) return null;
    return row.role === 'assistant' ? 'assistant' : 'user';
  }

  lastUsageForSession(sessionId: string): LastUsageRow | null {
    return this.lastUsageStmt.get(sessionId) ?? null;
  }

  aggregateModelsForSession(sessionId: string): SessionModelAggregateEntry[] {
    return this.modelAggregateStmt.all(sessionId);
  }

  aggregateModelsForSessions(
    sessionIds: string[],
  ): Map<string, SessionModelAggregateEntry[]> {
    const out = new Map<string, SessionModelAggregateEntry[]>();
    if (sessionIds.length === 0) return out;
    let stmt = this.modelAggregateBulkCache.get(sessionIds.length);
    if (!stmt) {
      const placeholders = sessionIds.map(() => '?').join(', ');
      stmt = this.db.prepare<unknown[], { session_id: string; model: string; count: number }>(
        `SELECT session_id, model, COUNT(*) AS count
         FROM messages
         WHERE session_id IN (${placeholders}) AND model IS NOT NULL
         GROUP BY session_id, model
         ORDER BY session_id ASC, count DESC, model ASC`,
      );
      this.modelAggregateBulkCache.set(sessionIds.length, stmt);
    }
    const rows = stmt.all(sessionIds);
    for (const row of rows) {
      const bucket = out.get(row.session_id);
      const entry: SessionModelAggregateEntry = { model: row.model, count: row.count };
      if (bucket) {
        bucket.push(entry);
      } else {
        out.set(row.session_id, [entry]);
      }
    }
    return out;
  }
}

// --- In-Memory-Driver für Tests --------------------------------------

export class InMemoryMessageDriver implements MessageDbDriver {
  // Sortiert nach Insert-Reihenfolge; lastTimestampForSession sortiert zur Lesezeit.
  // `model` wird beim Insert auf null normalisiert, damit das Aggregat-Filter
  // sauber per `=== null` matcht und Tests, die das Feld weglassen, keine
  // `undefined`-Modelle ins Aggregat einschleusen.
  private readonly rows: MessageInsert[] = [];

  insert(row: MessageInsert): void {
    this.rows.push({ ...row, model: row.model ?? null });
  }

  lastTimestampForSession(sessionId: string): number | null {
    let last: number | null = null;
    for (const r of this.rows) {
      if (r.session_id !== sessionId) continue;
      if (last === null || r.ts > last) last = r.ts;
    }
    return last;
  }

  lastRoleForSession(sessionId: string): 'assistant' | 'user' | null {
    let candidate: MessageInsert | null = null;
    for (const r of this.rows) {
      if (r.session_id !== sessionId) continue;
      if (!candidate || r.ts > candidate.ts) candidate = r;
    }
    if (!candidate) return null;
    return candidate.role === 'assistant' ? 'assistant' : 'user';
  }

  lastUsageForSession(sessionId: string): LastUsageRow | null {
    let candidate: MessageInsert | null = null;
    for (const r of this.rows) {
      if (r.session_id !== sessionId) continue;
      if (!candidate || r.ts > candidate.ts) candidate = r;
    }
    if (!candidate) return null;
    return {
      ts: candidate.ts,
      tokens_in: candidate.tokens_in,
      tokens_out: candidate.tokens_out,
    };
  }

  aggregateModelsForSession(sessionId: string): SessionModelAggregateEntry[] {
    const counts = new Map<string, number>();
    for (const r of this.rows) {
      if (r.session_id !== sessionId) continue;
      if (r.model === null || r.model === undefined) continue;
      counts.set(r.model, (counts.get(r.model) ?? 0) + 1);
    }
    return sortModelAggregate(counts);
  }

  aggregateModelsForSessions(
    sessionIds: string[],
  ): Map<string, SessionModelAggregateEntry[]> {
    const out = new Map<string, SessionModelAggregateEntry[]>();
    if (sessionIds.length === 0) return out;
    const idSet = new Set(sessionIds);
    const perSession = new Map<string, Map<string, number>>();
    for (const r of this.rows) {
      if (!idSet.has(r.session_id)) continue;
      if (r.model === null || r.model === undefined) continue;
      let bucket = perSession.get(r.session_id);
      if (!bucket) {
        bucket = new Map<string, number>();
        perSession.set(r.session_id, bucket);
      }
      bucket.set(r.model, (bucket.get(r.model) ?? 0) + 1);
    }
    for (const [sessionId, counts] of perSession) {
      out.set(sessionId, sortModelAggregate(counts));
    }
    return out;
  }

  // Test-Helper: alle Inserts.
  all(): MessageInsert[] {
    return this.rows.map((r) => ({ ...r }));
  }
}

// Sortier-Helfer: count DESC, model ASC — gleiche Tie-Break-Regel wie der
// SQLite-Driver, damit Tests deterministisch sind.
function sortModelAggregate(counts: Map<string, number>): SessionModelAggregateEntry[] {
  return [...counts.entries()]
    .map(([model, count]) => ({ model, count }))
    .sort((a, b) => {
      if (a.count !== b.count) return b.count - a.count;
      return a.model < b.model ? -1 : a.model > b.model ? 1 : 0;
    });
}
