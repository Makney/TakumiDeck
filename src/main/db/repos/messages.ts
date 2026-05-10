import type Database from 'better-sqlite3';
import type { MessageInsert } from '@shared/types';

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
  // Letzter usage-Stand der Session (für die Per-Session-Kontext-Bar). Liefert
  // tokens_in/tokens_out, ts und das Modell, das in der letzten Zeile stand —
  // wenn keine Messages vorliegen, null.
  lastUsageForSession(sessionId: string): LastUsageRow | null;
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

  lastUsageForSession(sessionId: string): LastUsageRow | null {
    return this.driver.lastUsageForSession(sessionId);
  }
}

// --- SQLite-Driver --------------------------------------------------

export class SqliteMessageDriver implements MessageDbDriver {
  private readonly insertStmt: Database.Statement;
  private readonly lastTsStmt: Database.Statement<[string], { ts: number }>;
  private readonly lastUsageStmt: Database.Statement<[string], LastUsageRow>;

  constructor(db: Database.Database) {
    this.insertStmt = db.prepare(
      `INSERT INTO messages (
        session_id, project_id, role, content, tokens_in, tokens_out, ts
      ) VALUES (
        @session_id, @project_id, @role, @content, @tokens_in, @tokens_out, @ts
      )`,
    );
    this.lastTsStmt = db.prepare<[string], { ts: number }>(
      'SELECT ts FROM messages WHERE session_id = ? ORDER BY ts DESC LIMIT 1',
    );
    this.lastUsageStmt = db.prepare<[string], LastUsageRow>(
      'SELECT ts, tokens_in, tokens_out FROM messages WHERE session_id = ? ORDER BY ts DESC LIMIT 1',
    );
  }

  insert(row: MessageInsert): void {
    this.insertStmt.run(row);
  }

  lastTimestampForSession(sessionId: string): number | null {
    const row = this.lastTsStmt.get(sessionId);
    return row ? row.ts : null;
  }

  lastUsageForSession(sessionId: string): LastUsageRow | null {
    return this.lastUsageStmt.get(sessionId) ?? null;
  }
}

// --- In-Memory-Driver für Tests --------------------------------------

export class InMemoryMessageDriver implements MessageDbDriver {
  // Sortiert nach Insert-Reihenfolge; lastTimestampForSession sortiert zur Lesezeit.
  private readonly rows: MessageInsert[] = [];

  insert(row: MessageInsert): void {
    this.rows.push({ ...row });
  }

  lastTimestampForSession(sessionId: string): number | null {
    let last: number | null = null;
    for (const r of this.rows) {
      if (r.session_id !== sessionId) continue;
      if (last === null || r.ts > last) last = r.ts;
    }
    return last;
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

  // Test-Helper: alle Inserts.
  all(): MessageInsert[] {
    return this.rows.map((r) => ({ ...r }));
  }
}
