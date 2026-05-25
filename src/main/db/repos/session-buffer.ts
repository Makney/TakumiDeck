import type Database from 'better-sqlite3';

// Phase 2 Season 32: SessionBufferRepository.
//
// Persistiert serialisierte xterm-Buffer-Snapshots fuer Terminal-Sessions
// (Type 'terminal'), damit ein Resume die letzten Output-Zeilen wieder
// einspielen kann. Claude-Sessions laufen hier nicht durch — die rendern
// ihren Verlauf beim `claude --resume` selbst aus der JSONL.
//
// Storage in eigener Tabelle `session_buffer_snapshots` (Migration 0010),
// damit der Snapshot nicht in `SELECT s.* FROM sessions` mitgezogen wird.
// FK-Cascade haengt am `sessions.id` — `DELETE FROM sessions` raeumt
// automatisch mit ab.

export interface SessionBufferDbDriver {
  // Liefert den persistierten Snapshot zur Session-ID oder null, wenn
  // (a) die Session noch nie einen Snapshot gespeichert hat oder
  // (b) der Snapshot wegen Session-DELETE rausgecasciert wurde.
  get(sessionId: string): string | null;
  // Upsert: Replace-on-Conflict, weil pro Session genau ein Snapshot
  // existiert (Primary Key = session_id). `updatedAt` wird vom Caller
  // gesetzt (Test-Determinismus).
  upsert(sessionId: string, snapshot: string, updatedAt: number): void;
  // Defensive Variante: explizit loeschen. Wird heute nicht aufgerufen
  // (FK-Cascade reicht), bleibt als Boundary-Pfad fuer kuenftige
  // „User will Snapshot vergessen"-Pfade vorhanden.
  delete(sessionId: string): void;
}

export class SessionBufferRepository {
  constructor(private readonly driver: SessionBufferDbDriver) {}

  get(sessionId: string): string | null {
    return this.driver.get(sessionId);
  }

  // Upsert mit Default-now fuer den Timestamp, weil die meisten Caller
  // ihn nicht beachten. Tests koennen ihn weiter explizit setzen.
  upsert(sessionId: string, snapshot: string, updatedAt: number = Date.now()): void {
    this.driver.upsert(sessionId, snapshot, updatedAt);
  }

  delete(sessionId: string): void {
    this.driver.delete(sessionId);
  }
}

// --- SQLite-Driver --------------------------------------------------

export class SqliteSessionBufferDriver implements SessionBufferDbDriver {
  private readonly getStmt: Database.Statement<[string], { snapshot: string }>;
  private readonly upsertStmt: Database.Statement;
  private readonly deleteStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.getStmt = db.prepare<[string], { snapshot: string }>(
      'SELECT snapshot FROM session_buffer_snapshots WHERE session_id = ?',
    );
    // Pro Session genau eine Row; ON CONFLICT REPLACE haelt das atomar.
    this.upsertStmt = db.prepare(
      `INSERT INTO session_buffer_snapshots (session_id, snapshot, updated_at)
       VALUES (@sessionId, @snapshot, @updatedAt)
       ON CONFLICT(session_id) DO UPDATE SET
         snapshot = excluded.snapshot,
         updated_at = excluded.updated_at`,
    );
    this.deleteStmt = db.prepare(
      'DELETE FROM session_buffer_snapshots WHERE session_id = ?',
    );
  }

  get(sessionId: string): string | null {
    const row = this.getStmt.get(sessionId);
    return row?.snapshot ?? null;
  }

  upsert(sessionId: string, snapshot: string, updatedAt: number): void {
    this.upsertStmt.run({ sessionId, snapshot, updatedAt });
  }

  delete(sessionId: string): void {
    this.deleteStmt.run(sessionId);
  }
}

// --- In-Memory-Driver fuer Tests ------------------------------------

export class InMemorySessionBufferDriver implements SessionBufferDbDriver {
  private readonly rows = new Map<string, { snapshot: string; updatedAt: number }>();

  get(sessionId: string): string | null {
    return this.rows.get(sessionId)?.snapshot ?? null;
  }

  upsert(sessionId: string, snapshot: string, updatedAt: number): void {
    this.rows.set(sessionId, { snapshot, updatedAt });
  }

  delete(sessionId: string): void {
    this.rows.delete(sessionId);
  }
}
