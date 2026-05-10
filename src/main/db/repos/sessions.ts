import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  SessionHistoryEntry,
  SessionHistoryInput,
  SessionRow,
  SessionStatus,
  SessionType,
} from '@shared/types';

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
  // Sprint-6-Hotfix: claude-codes eigene Session-UUID. Ab Sprint-6-Hotfix beim
  // Spawn gleich `id` gesetzt (--session-id-Flag), für Legacy null.
  claude_session_id: string | null;
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
  // Liste aller Sessions mit dem angegebenen Status.
  // Wird in Sprint 3 vom App-Quit-Handler genutzt, um running-Sessions sauber
  // auf interrupted zu patchen, bevor killAll() läuft.
  listByStatus(status: SessionStatus): SessionRow[];
  // Sprint 6 (Q4 Variante A + Q8 Variante A): Verlauf-Panel-Listing mit Filter
  // und LEFT-JOIN-Aggregat über die messages-Tabelle (tokens_in/tokens_out/count).
  // Filter werden in der Query als optionale WHERE-Klauseln umgesetzt; Query-String
  // matched case-insensitive auf title (LIKE '%query%'). Sortierung: jüngste zuerst.
  listHistoryForProject(input: SessionHistoryInput): SessionHistoryEntry[];
  // Sprint-6-Hotfix (Resume-Bug-Fix): einmalig die claude-Session-UUID setzen.
  // Idempotent — überschreibt NICHT, wenn bereits gesetzt. Returnt true, wenn
  // die Spalte tatsächlich befüllt wurde (= vorher null war), false sonst.
  // Damit kann der JSONL-Watcher pro JSONL-Zeile aufrufen, ohne ständig zu
  // checken, ob das Mapping schon existiert.
  setClaudeSessionId(sessionId: string, claudeSessionId: string): boolean;
  // Sprint-6-Hotfix: Sessions, die noch keine claude_session_id haben (= alle
  // Sprint-2/3-Legacy + alle pre-Hotfix Sprint-6-Sessions, egal welchen Status).
  // Wird vom Watcher genutzt, um Backfill-Kandidaten zu finden, ohne per Status
  // zu filtern (resolveTakumiSession aus Sprint 5 deckt nur running/idle für
  // Token-Tracking ab — Backfill darf auch completed/interrupted/error treffen).
  listMissingClaudeSessionId(): SessionRow[];
}

export interface CreateSessionInput {
  id?: string;
  project_id: string;
  title: string;
  type: SessionType;
  model: string;
  cwd: string;
  // Sprint 6: vom pty:create-Handler gesetzt — atomar aus projects.next_season_number
  // alloziert (nur für type='feature'). Für Bug/Review/Docs-Sync immer null.
  season_number?: number | null;
  // Sprint-6-Hotfix: vom pty:create-Handler gleich `id` gesetzt, weil der Spawn
  // mit --session-id <id> läuft. Hier optional, damit Tests mit Default null
  // weiter funktionieren.
  claude_session_id?: string | null;
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
      season_number: input.season_number ?? null,
      status: 'running',
      current_model: input.model,
      worktree_branch: null,
      notes_md: '',
      cwd: input.cwd,
      started_at: Date.now(),
      ended_at: null,
      claude_session_id: input.claude_session_id ?? null,
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

  listByStatus(status: SessionStatus): SessionRow[] {
    return this.driver.listByStatus(status);
  }

  listHistoryForProject(input: SessionHistoryInput): SessionHistoryEntry[] {
    return this.driver.listHistoryForProject(input);
  }

  setClaudeSessionId(sessionId: string, claudeSessionId: string): boolean {
    return this.driver.setClaudeSessionId(sessionId, claudeSessionId);
  }

  listMissingClaudeSessionId(): SessionRow[] {
    return this.driver.listMissingClaudeSessionId();
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
  private readonly listByStatusStmt: Database.Statement<[string], SessionRow>;
  private readonly setClaudeIdStmt: Database.Statement;
  private readonly listMissingClaudeIdStmt: Database.Statement<[], SessionRow>;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(
      `INSERT INTO sessions (
        id, project_id, title, type, season_number, status, current_model,
        worktree_branch, notes_md, cwd, started_at, ended_at, claude_session_id
      ) VALUES (
        @id, @project_id, @title, @type, @season_number, @status, @current_model,
        @worktree_branch, @notes_md, @cwd, @started_at, @ended_at, @claude_session_id
      )`,
    );
    this.selectStmt = db.prepare<[string], SessionRow>(
      'SELECT * FROM sessions WHERE id = ?',
    );
    this.listByStatusStmt = db.prepare<[string], SessionRow>(
      'SELECT * FROM sessions WHERE status = ? ORDER BY started_at ASC',
    );
    // Idempotenter Update: NUR wenn claude_session_id aktuell NULL. Damit kann der
    // Watcher pro JSONL-Zeile aufrufen, ohne vorher zu prüfen — die WHERE-Klausel
    // wirkt als atomarer Check-and-Set.
    this.setClaudeIdStmt = db.prepare(
      'UPDATE sessions SET claude_session_id = @claudeSessionId WHERE id = @sessionId AND claude_session_id IS NULL',
    );
    this.listMissingClaudeIdStmt = db.prepare<[], SessionRow>(
      'SELECT * FROM sessions WHERE claude_session_id IS NULL',
    );
  }

  insert(row: SessionInsert): void {
    this.insertStmt.run(row);
  }

  findById(id: string): SessionRow | null {
    return this.selectStmt.get(id) ?? null;
  }

  listByStatus(status: SessionStatus): SessionRow[] {
    return this.listByStatusStmt.all(status);
  }

  listHistoryForProject(input: SessionHistoryInput): SessionHistoryEntry[] {
    // Dynamisches SQL: alle Bedingungen sind statische Spalten + Bind-Parameter.
    // Der LEFT-JOIN über die messages-Tabelle aggregiert Tokens und Count zur Lesezeit
    // (analog zum Sprint-4-session_count-Aggregat im Project-Listing). Sortierung:
    // jüngste zuerst, damit der Verlauf-Panel den letzten Run oben hat.
    const conditions: string[] = ['s.project_id = @projectId'];
    const params: Record<string, unknown> = { projectId: input.projectId };

    if (input.types && input.types.length > 0) {
      const placeholders = input.types.map((_, i) => `@type${i}`).join(', ');
      conditions.push(`s.type IN (${placeholders})`);
      input.types.forEach((t, i) => {
        params[`type${i}`] = t;
      });
    }
    if (input.statuses && input.statuses.length > 0) {
      const placeholders = input.statuses.map((_, i) => `@status${i}`).join(', ');
      conditions.push(`s.status IN (${placeholders})`);
      input.statuses.forEach((s, i) => {
        params[`status${i}`] = s;
      });
    }
    const trimmedQuery = input.query?.trim();
    if (trimmedQuery && trimmedQuery.length > 0) {
      // case-insensitive title-Match. SQLite LIKE ist per Default case-insensitive
      // für ASCII; für nicht-ASCII würde ein FTS-Index nötig — Phase 2.
      conditions.push('s.title LIKE @query');
      params.query = `%${trimmedQuery}%`;
    }

    const sql = `
      SELECT
        s.*,
        COALESCE(m.tokens_in_sum, 0) AS tokens_in,
        COALESCE(m.tokens_out_sum, 0) AS tokens_out,
        COALESCE(m.msg_count, 0) AS message_count
      FROM sessions s
      LEFT JOIN (
        SELECT session_id,
               SUM(tokens_in) AS tokens_in_sum,
               SUM(tokens_out) AS tokens_out_sum,
               COUNT(*) AS msg_count
        FROM messages
        GROUP BY session_id
      ) m ON m.session_id = s.id
      WHERE ${conditions.join(' AND ')}
      ORDER BY s.started_at DESC
    `;
    const stmt = this.db.prepare<Record<string, unknown>, SessionHistoryEntry>(sql);
    return stmt.all(params);
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

  setClaudeSessionId(sessionId: string, claudeSessionId: string): boolean {
    const result = this.setClaudeIdStmt.run({ sessionId, claudeSessionId });
    return Number(result.changes) > 0;
  }

  listMissingClaudeSessionId(): SessionRow[] {
    return this.listMissingClaudeIdStmt.all();
  }
}

// In-Memory-Implementation des Drivers für Tests (analog Migration-Fake-Driver).
export class InMemorySessionDriver implements SessionDbDriver {
  private readonly rows = new Map<string, SessionRow>();
  // Sprint 6: Test-Helper für die History-Aggregat-Spalten. Tests seeden hier
  // pro Session die summierten tokens_in / tokens_out / message_count, damit
  // listHistoryForProject ohne MessageRepository-Mock auskommt. Wenn nicht gesetzt,
  // liefert die History-Methode 0/0/0 — wie der SQL-LEFT-JOIN bei leerer messages-Tabelle.
  private readonly messageStats = new Map<
    string,
    { tokens_in: number; tokens_out: number; message_count: number }
  >();

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

  listByStatus(status: SessionStatus): SessionRow[] {
    const out: SessionRow[] = [];
    for (const row of this.rows.values()) {
      if (row.status === status) out.push({ ...row });
    }
    // Stabile Reihenfolge analog zum SQL-Driver (started_at aufsteigend).
    out.sort((a, b) => a.started_at - b.started_at);
    return out;
  }

  patch(id: string, patch: SessionPatch): SessionRow | null {
    const existing = this.rows.get(id);
    if (!existing) return null;
    const updated: SessionRow = { ...existing, ...patch };
    this.rows.set(id, updated);
    return { ...updated };
  }

  listHistoryForProject(input: SessionHistoryInput): SessionHistoryEntry[] {
    const trimmedQuery = input.query?.trim().toLowerCase() ?? '';
    const typeSet = input.types && input.types.length > 0 ? new Set(input.types) : null;
    const statusSet =
      input.statuses && input.statuses.length > 0 ? new Set(input.statuses) : null;
    const matches: SessionHistoryEntry[] = [];
    for (const row of this.rows.values()) {
      if (row.project_id !== input.projectId) continue;
      if (typeSet && !typeSet.has(row.type)) continue;
      if (statusSet && !statusSet.has(row.status)) continue;
      if (trimmedQuery && !row.title.toLowerCase().includes(trimmedQuery)) continue;
      const stats = this.messageStats.get(row.id);
      matches.push({
        id: row.id,
        project_id: row.project_id,
        title: row.title,
        type: row.type,
        season_number: row.season_number,
        status: row.status,
        current_model: row.current_model,
        cwd: row.cwd,
        notes_md: row.notes_md,
        started_at: row.started_at,
        ended_at: row.ended_at,
        tokens_in: stats?.tokens_in ?? 0,
        tokens_out: stats?.tokens_out ?? 0,
        message_count: stats?.message_count ?? 0,
      });
    }
    // Jüngste zuerst — analog zum SQL-Driver.
    matches.sort((a, b) => b.started_at - a.started_at);
    return matches;
  }

  setClaudeSessionId(sessionId: string, claudeSessionId: string): boolean {
    const existing = this.rows.get(sessionId);
    if (!existing) return false;
    if (existing.claude_session_id !== null) return false;
    this.rows.set(sessionId, { ...existing, claude_session_id: claudeSessionId });
    return true;
  }

  listMissingClaudeSessionId(): SessionRow[] {
    const out: SessionRow[] = [];
    for (const row of this.rows.values()) {
      if (row.claude_session_id === null) out.push({ ...row });
    }
    return out;
  }

  // Test-Hilfe: Token-Aggregate für eine Session direkt setzen (ohne MessageRepo).
  seedMessageStats(
    sessionId: string,
    stats: { tokens_in: number; tokens_out: number; message_count: number },
  ): void {
    this.messageStats.set(sessionId, { ...stats });
  }
}
