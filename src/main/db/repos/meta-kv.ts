import type Database from 'better-sqlite3';

// Schmale Key-Value-Sicht auf die seit Sprint 1 reservierte SQLite-Tabelle
// `settings` (key TEXT PRIMARY KEY, value TEXT NOT NULL). Die Tabelle war
// bisher ungenutzt; ab Phase 2 Season 15 nutzt der Boot-One-Shot-Backfill
// sie fuer ein einmaliges "done"-Flag (`backfill_jsonl_link_v1`).
//
// Bewusst NICHT in den AppSettings-JSON eingehaengt: das ist der User-
// facing Settings-Store, dort sollen keine internen Migrations-/Backfill-
// Flags landen.

export interface MetaKvDriver {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export class MetaKvRepository {
  constructor(private readonly driver: MetaKvDriver) {}

  get(key: string): string | null {
    return this.driver.get(key);
  }

  set(key: string, value: string): void {
    this.driver.set(key, value);
  }
}

export class SqliteMetaKvDriver implements MetaKvDriver {
  private readonly getStmt: Database.Statement<[string], { value: string }>;
  private readonly upsertStmt: Database.Statement;

  constructor(db: Database.Database) {
    this.getStmt = db.prepare<[string], { value: string }>(
      'SELECT value FROM settings WHERE key = ?',
    );
    this.upsertStmt = db.prepare(
      `INSERT INTO settings (key, value) VALUES (@key, @value)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
  }

  get(key: string): string | null {
    return this.getStmt.get(key)?.value ?? null;
  }

  set(key: string, value: string): void {
    this.upsertStmt.run({ key, value });
  }
}

export class InMemoryMetaKvDriver implements MetaKvDriver {
  private readonly rows = new Map<string, string>();

  get(key: string): string | null {
    return this.rows.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.rows.set(key, value);
  }
}
