import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { SessionRow, SessionStatus, SessionType } from '@shared/types';

// SessionRepository und der dazugehörige SessionDbDriver — Trennung wie beim
// Migration-Runner aus Sprint 1: die Klasse trägt die Geschäftslogik, der Driver
// abstrahiert die SQL-Persistenz, sodass Tests mit einem In-Memory-Fake laufen.

export interface SessionInsert {
  id: string;
  project_id: string;
  title: string;
  type: SessionType;
  season_number: number | null;
  status: SessionStatus;
  current_model: string | null;
  worktree_branch: string | null;
  notes_md: string;
  cwd: string;
  started_at: number;
  ended_at: number | null;
}

export interface SessionPatch {
  title?: string;
  notes_md?: string;
  status?: SessionStatus;
  current_model?: string | null;
  ended_at?: number | null;
  worktree_branch?: string | null;
  season_number?: number | null;
}

export interface SessionDbDriver {
  insert(row: SessionInsert): void;
  findById(id: string): SessionRow | null;
  patch(id: string, patch: SessionPatch): SessionRow | null;
}

export interface CreateSessionInput {
  id?: string;
  project_id: string;
  title: string;
  type: SessionType;
  model: string;
  cwd: string;
}

// Whitelist für PATCH-Keys: schützt davor, dass jemand über die Schema-Boundary
// hinaus Spalten setzen kann (z.B. id, project_id, started_at).
const PATCHABLE_COLUMNS = new Set<keyof SessionPatch>([
  'title',
  'notes_md',
  'status',
  'current_model',
  'ended_at',
  'worktree_branch',
  'season_number',
]);

export class SessionRepository {
  constructor(private readonly driver: SessionDbDriver) {}

  create(input: CreateSessionInput): SessionRow {
    const id = input.id ?? randomUUID();
    const row: SessionInsert = {
      id,
      project_id: input.project_id,
      title: input.title,
      type: input.type,
      season_number: null,
      status: 'running',
      current_model: input.model,
      worktree_branch: null,
      notes_md: '',
      cwd: input.cwd,
      started_at: Date.now(),
      ended_at: null,
    };
    this.driver.insert(row);
    return rowFromInsert(row);
  }

  findById(id: string): SessionRow | null {
    return this.driver.findById(id);
  }

  update(id: string, patch: SessionPatch): SessionRow | null {
    const cleaned: SessionPatch = {};
    for (const key of Object.keys(patch) as (keyof SessionPatch)[]) {
      if (!PATCHABLE_COLUMNS.has(key)) continue;
      const value = patch[key];
      if (value === undefined) continue;
      Object.assign(cleaned, { [key]: value });
    }
    if (Object.keys(cleaned).length === 0) {
      return this.findById(id);
    }
    return this.driver.patch(id, cleaned);
  }
}

function rowFromInsert(row: SessionInsert): SessionRow {
  return { ...row };
}

// SQL-Implementierung des Drivers über better-sqlite3.
// Wird im Main-Prozess hinter openDatabase() instanziiert.
export class SqliteSessionDriver implements SessionDbDriver {
  private readonly insertStmt: Database.Statement;
  private readonly selectStmt: Database.Statement<[string], SessionRow>;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(
      `INSERT INTO sessions (
        id, project_id, title, type, season_number, status, current_model,
        worktree_branch, notes_md, cwd, started_at, ended_at
      ) VALUES (
        @id, @project_id, @title, @type, @season_number, @status, @current_model,
        @worktree_branch, @notes_md, @cwd, @started_at, @ended_at
      )`,
    );
    this.selectStmt = db.prepare<[string], SessionRow>(
      'SELECT * FROM sessions WHERE id = ?',
    );
  }

  insert(row: SessionInsert): void {
    this.insertStmt.run(row);
  }

  findById(id: string): SessionRow | null {
    return this.selectStmt.get(id) ?? null;
  }

  patch(id: string, patch: SessionPatch): SessionRow | null {
    const keys = Object.keys(patch) as (keyof SessionPatch)[];
    if (keys.length === 0) return this.findById(id);
    // SQL-Spalten sind aus dem statischen PatchKey-Whitelist-Universum, keine Injection.
    const setSql = keys.map((k) => `${k} = @${k}`).join(', ');
    const stmt = this.db.prepare(`UPDATE sessions SET ${setSql} WHERE id = @__id`);
    stmt.run({ ...patch, __id: id });
    return this.findById(id);
  }
}

// In-Memory-Implementation des Drivers für Tests (analog Migration-Fake-Driver).
export class InMemorySessionDriver implements SessionDbDriver {
  private readonly rows = new Map<string, SessionRow>();

  insert(row: SessionInsert): void {
    if (this.rows.has(row.id)) {
      throw new Error(`Session ${row.id} existiert bereits`);
    }
    this.rows.set(row.id, { ...row });
  }

  findById(id: string): SessionRow | null {
    const row = this.rows.get(id);
    return row ? { ...row } : null;
  }

  patch(id: string, patch: SessionPatch): SessionRow | null {
    const existing = this.rows.get(id);
    if (!existing) return null;
    const updated: SessionRow = { ...existing, ...patch };
    this.rows.set(id, updated);
    return { ...updated };
  }
}
