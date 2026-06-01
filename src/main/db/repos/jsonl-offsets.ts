import type Database from 'better-sqlite3';
import type { JsonlOffsetRow } from '@shared/types';

// JsonlOffsetRepository (Sprint 5, Migration 0002).
//
// Persistiert pro JSONL-Datei den zuletzt verarbeiteten Byte-Offset, damit der
// Watcher nach App-Restart nicht die komplette Historie neu einliest. Schmale
// Tabelle (file_path PRIMARY KEY) — kein Mehrwert, das in eine Klasse mit viel
// Logik zu wickeln; Repository-Pattern bleibt nur, weil die anderen Sprint-Repos
// es auch haben (testbar mit InMemoryDriver).

export interface JsonlOffsetDriver {
  get(filePath: string): JsonlOffsetRow | null;
  upsert(row: JsonlOffsetRow): void;
}

export class JsonlOffsetRepository {
  constructor(private readonly driver: JsonlOffsetDriver) {}

  get(filePath: string): JsonlOffsetRow | null {
    return this.driver.get(filePath);
  }

  set(filePath: string, offsetBytes: number, lastSeenAt: number): void {
    this.driver.upsert({
      file_path: filePath,
      offset_bytes: offsetBytes,
      last_seen_at: lastSeenAt,
    });
  }
}

// --- SQLite-Driver --------------------------------------------------

export class SqliteJsonlOffsetDriver implements JsonlOffsetDriver {
  private readonly getStmt: Database.Statement<[{ file_path: string }], JsonlOffsetRow>;
  private readonly upsertStmt: Database.Statement;

  constructor(db: Database.Database) {
    // @named-Bind (statt positional ?) — konsistent mit dem upsert unten.
    this.getStmt = db.prepare<{ file_path: string }, JsonlOffsetRow>(
      'SELECT file_path, offset_bytes, last_seen_at FROM jsonl_offsets WHERE file_path = @file_path',
    );
    this.upsertStmt = db.prepare(
      `INSERT INTO jsonl_offsets (file_path, offset_bytes, last_seen_at)
       VALUES (@file_path, @offset_bytes, @last_seen_at)
       ON CONFLICT(file_path) DO UPDATE SET
         offset_bytes = excluded.offset_bytes,
         last_seen_at = excluded.last_seen_at`,
    );
  }

  get(filePath: string): JsonlOffsetRow | null {
    return this.getStmt.get({ file_path: filePath }) ?? null;
  }

  upsert(row: JsonlOffsetRow): void {
    this.upsertStmt.run(row);
  }
}

// --- In-Memory-Driver für Tests --------------------------------------

export class InMemoryJsonlOffsetDriver implements JsonlOffsetDriver {
  private readonly rows = new Map<string, JsonlOffsetRow>();

  get(filePath: string): JsonlOffsetRow | null {
    const row = this.rows.get(filePath);
    return row ? { ...row } : null;
  }

  upsert(row: JsonlOffsetRow): void {
    this.rows.set(row.file_path, { ...row });
  }
}
