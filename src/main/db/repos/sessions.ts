import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type {
  SessionHistoryEntry,
  SessionHistoryInput,
  SessionRow,
  SessionStatus,
  SessionType,
} from '@shared/types';
import type { MessageRepository } from './messages';

// SessionRepository und der dazugehörige SessionDbDriver — Trennung wie beim
// Migration-Runner aus Sprint 1: die Klasse trägt die Geschäftslogik, der Driver
// abstrahiert die SQL-Persistenz, sodass Tests mit einem In-Memory-Fake laufen.

// Insert-Shape ist heute strukturell identisch zu SessionRow (Domain-Type aus
// @shared/types). Wir aliasen statt zu duplizieren, damit ein neues Feld nicht
// an zwei Stellen ergänzt werden muss. Wenn die DB-Schicht jemals interne Felder
// braucht (z.B. updated_at), splittet das wieder auf.
export type SessionInsert = SessionRow;

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
  // Phase-2 Season-4: Letzte completed Feature-Session eines Projekts. Liefert
  // die Row mit dem hoechsten started_at, deren type='feature' und
  // status='completed' ist. Wird von templates:resolve-auto-vars genutzt, um
  // die {{LETZTE_SEASON_NAME}}-Variable zu befuellen. null, wenn das Projekt
  // noch keine erfolgreich gelandete Season hat.
  findLastCompletedFeatureSession(projectId: string): SessionRow | null;
  // Phase-2 Season-8 (Watcher-Resolver-Fix): Lookup ueber die JSONL-UUID, damit
  // der JSONL-Watcher Events deterministisch der richtigen TakumiDeck-Session
  // zuordnet. Vorher loeste der Watcher nur ueber `cwd`-Encoding auf — bei mehreren
  // parallelen Sessions im selben Projekt-Pfad gewann die juengste, was bei
  // mehreren offenen Seasons die Kontext-Anzeige auf den falschen Tab schickte.
  // Status-agnostisch, weil auch completed/interrupted-Sessions waehrend des Resume
  // wieder JSONL-Lines bekommen.
  findByClaudeSessionId(claudeSessionId: string): SessionRow | null;
  // Phase-2 Season-11: atomare Allokation einer Season-Nummer fuer eine
  // bestehende Session. Wird vom Templates-Send-Flow gerufen, wenn der Prompt
  // {{NEXT_SEASON_NR}} verwendet. In einer Transaction: hat die Session schon
  // eine season_number, gewinnt sie (idempotent); sonst MAX(season_number)+1
  // ueber alle Sessions des gleichen Projekts und UPDATE. Returnt das
  // Ergebnis-Tupel, damit der Caller dem User ein passendes Feedback geben
  // kann ("Season #N markiert" vs. "Session war schon #N"). null, wenn die
  // Session nicht existiert.
  assignSeasonNumber(sessionId: string): AssignSeasonResult | null;
}

export interface AssignSeasonResult {
  seasonNumber: number;
  freshlyAssigned: boolean;
}

export interface CreateSessionInput {
  id?: string;
  project_id: string;
  title: string;
  type: SessionType;
  model: string;
  cwd: string;
  // Sprint 6: vom pty:create-Handler gesetzt — atomar aus projects.next_season_number
  // alloziert (nur für type='feature'). Für Bug/Review/Docs-Sync/Custom immer null.
  season_number?: number | null;
  // Sprint-6-Hotfix: vom pty:create-Handler gleich `id` gesetzt, weil der Spawn
  // mit --session-id <id> läuft. Hier optional, damit Tests mit Default null
  // weiter funktionieren.
  claude_session_id?: string | null;
  // Phase-2 Season-5: freie Bezeichnung fuer type='custom'. Bei den vier festen
  // Typen weglassen — der Repo setzt dann null.
  custom_type_label?: string | null;
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
  // Phase-2 Season-10: optionales MessageRepository, damit `listHistoryForProject`
  // pro Eintrag das Modell-Aggregat (messages.model GROUP BY) mitliefern kann.
  // Bestands-Tests, die nur SessionRepo brauchen, lassen den Parameter weg —
  // die History liefert dann `models: []` (kein Detail-Pane-Aggregat).
  constructor(
    private readonly driver: SessionDbDriver,
    private readonly messages?: MessageRepository,
  ) {}

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
      custom_type_label: input.custom_type_label ?? null,
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
    const entries = this.driver.listHistoryForProject(input);
    if (entries.length === 0 || !this.messages) return entries;
    // Phase-2 Season-10: Bulk-Aggregation der Modell-Counts in EINER zusaetzlichen
    // Query (IN-Liste ueber alle Session-IDs des Listings), Merge in TS. Vermeidet
    // den N+1-Aufruf, der bei der Default-Listenlaenge (≤100) sonst ein deutlicher
    // Overhead waere.
    const aggregates = this.messages.aggregateModelsForSessions(entries.map((e) => e.id));
    for (const entry of entries) {
      entry.models = aggregates.get(entry.id) ?? [];
    }
    return entries;
  }

  setClaudeSessionId(sessionId: string, claudeSessionId: string): boolean {
    return this.driver.setClaudeSessionId(sessionId, claudeSessionId);
  }

  listMissingClaudeSessionId(): SessionRow[] {
    return this.driver.listMissingClaudeSessionId();
  }

  findLastCompletedFeatureSession(projectId: string): SessionRow | null {
    return this.driver.findLastCompletedFeatureSession(projectId);
  }

  findByClaudeSessionId(claudeSessionId: string): SessionRow | null {
    return this.driver.findByClaudeSessionId(claudeSessionId);
  }

  // Phase-2 Season-11: durchreichen — die Atomizitaet sitzt im Driver
  // (better-sqlite3-Transaction bzw. simulierte Sequenz im InMemory-Driver).
  // Vertragsfreiheit der Repo-Schicht: gibt null zurueck, wenn die Session
  // nicht existiert; sonst { seasonNumber, freshlyAssigned }.
  assignSeasonNumber(sessionId: string): AssignSeasonResult | null {
    return this.driver.assignSeasonNumber(sessionId);
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
  private readonly lastCompletedFeatureStmt: Database.Statement<[string], SessionRow>;
  private readonly findByClaudeIdStmt: Database.Statement<[string], SessionRow>;
  // Phase-2 Season-11: drei Statements + Transaction fuer assignSeasonNumber.
  // Read-Step liefert project_id und den aktuellen season_number-Wert; falls NULL,
  // ermittelt der MAX-Step die naechste freie Nummer und der UPDATE-Step schreibt
  // sie auf die Session-Row.
  private readonly readSessionForAssignStmt: Database.Statement<
    [string],
    { project_id: string; season_number: number | null }
  >;
  private readonly maxSeasonForProjectStmt: Database.Statement<
    [string],
    { max_season: number | null }
  >;
  private readonly setSeasonNumberStmt: Database.Statement;
  private readonly assignSeasonNumberTxn: Database.Transaction<
    (sessionId: string) => AssignSeasonResult | null
  >;
  // Statement-Cache für patch(): Cache-Key = sortierte Whitelist-Keys, damit jede
  // Patch-Permutation nur einmal vorbereitet wird. Schützt vor Re-Compile bei
  // Bulk-Patches (z.B. before-quit-Handler über alle running-Sessions).
  private readonly patchStmtCache = new Map<string, Database.Statement>();
  // Statement-Cache für listHistoryForProject(): Cache-Key = Filter-Permutation
  // (typesLen × statusesLen × hasQuery). Maximal ~56 Permutationen — alle dürfen
  // dauerhaft im Cache leben.
  private readonly historyStmtCache = new Map<
    string,
    Database.Statement<Record<string, unknown>, SessionHistoryEntry>
  >();

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(
      `INSERT INTO sessions (
        id, project_id, title, type, season_number, status, current_model,
        worktree_branch, notes_md, cwd, started_at, ended_at, claude_session_id,
        custom_type_label
      ) VALUES (
        @id, @project_id, @title, @type, @season_number, @status, @current_model,
        @worktree_branch, @notes_md, @cwd, @started_at, @ended_at, @claude_session_id,
        @custom_type_label
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
    // Phase-2 Season-4: einzelne Zeile mit hoechstem started_at, gefiltert auf
    // type='feature' und status='completed'. LIMIT 1, weil die Variable einen
    // einzelnen Eintrag liefert (nicht eine Liste).
    this.lastCompletedFeatureStmt = db.prepare<[string], SessionRow>(
      "SELECT * FROM sessions WHERE project_id = ? AND type = 'feature' AND status = 'completed' ORDER BY started_at DESC LIMIT 1",
    );
    // Phase-2 Season-8 (Watcher-Resolver-Fix): Lookup ueber die JSONL-UUID.
    // Sollte per Konstruktion eindeutig sein (eine UUID = eine Session); bei
    // theoretischen Duplikaten gewinnt die juengste — das ist dieselbe
    // Tie-Break-Regel wie im cwd-Fallback.
    this.findByClaudeIdStmt = db.prepare<[string], SessionRow>(
      'SELECT * FROM sessions WHERE claude_session_id = ? ORDER BY started_at DESC LIMIT 1',
    );
    // Phase-2 Season-11: assignSeasonNumber. SELECT+MAX+UPDATE laeuft in einer
    // better-sqlite3-Transaction; bei bereits zugewiesener Nummer faellt MAX/UPDATE
    // weg (idempotent). Wir lesen NUR die zwei Spalten, die wir brauchen — full
    // SELECT * waere unnoetig teuer auf der Hot-Path-Methode.
    this.readSessionForAssignStmt = db.prepare<
      [string],
      { project_id: string; season_number: number | null }
    >('SELECT project_id, season_number FROM sessions WHERE id = ?');
    this.maxSeasonForProjectStmt = db.prepare<[string], { max_season: number | null }>(
      `SELECT MAX(season_number) AS max_season FROM sessions
       WHERE project_id = ? AND season_number IS NOT NULL`,
    );
    this.setSeasonNumberStmt = db.prepare(
      'UPDATE sessions SET season_number = @value WHERE id = @id',
    );
    this.assignSeasonNumberTxn = db.transaction(
      (sessionId: string): AssignSeasonResult | null => {
        const row = this.readSessionForAssignStmt.get(sessionId);
        if (!row) return null;
        if (row.season_number !== null) {
          return { seasonNumber: row.season_number, freshlyAssigned: false };
        }
        const maxRow = this.maxSeasonForProjectStmt.get(row.project_id);
        const next = (maxRow?.max_season ?? 0) + 1;
        this.setSeasonNumberStmt.run({ id: sessionId, value: next });
        return { seasonNumber: next, freshlyAssigned: true };
      },
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
    // Statements werden per Filter-Permutation gecached (typesLen × statusesLen ×
    // modelsLen × hasQuery), damit nicht jeder History-Klick / Tastendruck im
    // Suchfeld einen SQL-Re-Compile triggert. Permutations-Raum bleibt klein
    // (≤7 types × ≤8 statuses × ≤5 models × 2 query = 560), alle duerfen
    // dauerhaft im Cache leben.
    const typesLen = input.types?.length ?? 0;
    const statusesLen = input.statuses?.length ?? 0;
    const modelsLen = input.models?.length ?? 0;
    const trimmedQuery = input.query?.trim() ?? '';
    const hasQuery = trimmedQuery.length > 0;
    const cacheKey = `t${typesLen}_s${statusesLen}_m${modelsLen}_q${hasQuery ? 1 : 0}`;

    let stmt = this.historyStmtCache.get(cacheKey);
    if (!stmt) {
      const conditions: string[] = ['s.project_id = @projectId'];
      if (typesLen > 0) {
        const placeholders = Array.from({ length: typesLen }, (_, i) => `@type${i}`).join(', ');
        conditions.push(`s.type IN (${placeholders})`);
      }
      if (statusesLen > 0) {
        const placeholders = Array.from({ length: statusesLen }, (_, i) => `@status${i}`).join(', ');
        conditions.push(`s.status IN (${placeholders})`);
      }
      if (modelsLen > 0) {
        // Phase-2 Season-10: Filter auf sessions.current_model. NULL-Modelle
        // (alte Sessions ohne Modell-Spalten-Wert) matchen nie, was OK ist —
        // die UI-Pillen filtern positiv ("nur diese Modelle anzeigen").
        const placeholders = Array.from({ length: modelsLen }, (_, i) => `@model${i}`).join(', ');
        conditions.push(`s.current_model IN (${placeholders})`);
      }
      if (hasQuery) {
        // case-insensitive title-Match. SQLite LIKE ist per Default case-insensitive
        // für ASCII; für nicht-ASCII würde ein FTS-Index nötig — Phase 2.
        conditions.push('s.title LIKE @query');
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
      stmt = this.db.prepare<Record<string, unknown>, SessionHistoryEntry>(sql);
      this.historyStmtCache.set(cacheKey, stmt);
    }

    const params: Record<string, unknown> = { projectId: input.projectId };
    if (input.types && typesLen > 0) {
      input.types.forEach((t, i) => {
        params[`type${i}`] = t;
      });
    }
    if (input.statuses && statusesLen > 0) {
      input.statuses.forEach((s, i) => {
        params[`status${i}`] = s;
      });
    }
    if (input.models && modelsLen > 0) {
      input.models.forEach((m, i) => {
        params[`model${i}`] = m;
      });
    }
    if (hasQuery) {
      params.query = `%${trimmedQuery}%`;
    }
    // models-Aggregat wird im SessionRepository per Bulk-Query nachgereicht
    // (sieht aussehender Driver-Output nicht).
    const rows = stmt.all(params);
    for (const row of rows) {
      row.models = [];
    }
    return rows;
  }

  patch(id: string, patch: SessionPatch): SessionRow | null {
    const keys = Object.keys(patch) as (keyof SessionPatch)[];
    if (keys.length === 0) return this.findById(id);
    // Defense-in-Depth: SessionRepository.update() filtert via PATCHABLE_COLUMNS,
    // wir doppeln den Guard hier, damit ein Direkt-Aufruf des Drivers (z.B. aus
    // Tests oder zukünftigem Code) keine SQL-Spalten außerhalb der Whitelist
    // setzen kann.
    for (const k of keys) {
      if (!PATCHABLE_COLUMNS.has(k)) {
        throw new Error(`SessionDriver.patch: Spalte "${k}" ist nicht patchbar`);
      }
    }
    // Cache-Key = sortierte Keys, damit Reihenfolge im Patch-Objekt egal ist.
    const cacheKey = [...keys].sort().join(',');
    let stmt = this.patchStmtCache.get(cacheKey);
    if (!stmt) {
      const setSql = keys.map((k) => `${k} = @${k}`).join(', ');
      stmt = this.db.prepare(`UPDATE sessions SET ${setSql} WHERE id = @__id`);
      this.patchStmtCache.set(cacheKey, stmt);
    }
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

  findLastCompletedFeatureSession(projectId: string): SessionRow | null {
    return this.lastCompletedFeatureStmt.get(projectId) ?? null;
  }

  findByClaudeSessionId(claudeSessionId: string): SessionRow | null {
    return this.findByClaudeIdStmt.get(claudeSessionId) ?? null;
  }

  assignSeasonNumber(sessionId: string): AssignSeasonResult | null {
    return this.assignSeasonNumberTxn(sessionId);
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
    // Phase-2 Season-10: Modell-Filter. NULL-current_model matcht nie (positive
    // Filterung — analog zum SQL-Driver).
    const modelSet =
      input.models && input.models.length > 0 ? new Set(input.models) : null;
    const matches: SessionHistoryEntry[] = [];
    for (const row of this.rows.values()) {
      if (row.project_id !== input.projectId) continue;
      if (typeSet && !typeSet.has(row.type)) continue;
      if (statusSet && !statusSet.has(row.status)) continue;
      if (modelSet && (row.current_model === null || !modelSet.has(row.current_model))) continue;
      if (trimmedQuery && !row.title.toLowerCase().includes(trimmedQuery)) continue;
      const stats = this.messageStats.get(row.id);
      matches.push({
        id: row.id,
        project_id: row.project_id,
        title: row.title,
        type: row.type,
        custom_type_label: row.custom_type_label,
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
        // models-Aggregat reicht das Repository nach (per MessageRepository-Dep).
        // Driver-Output startet leer.
        models: [],
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

  findLastCompletedFeatureSession(projectId: string): SessionRow | null {
    let best: SessionRow | null = null;
    for (const row of this.rows.values()) {
      if (row.project_id !== projectId) continue;
      if (row.type !== 'feature') continue;
      if (row.status !== 'completed') continue;
      if (best === null || row.started_at > best.started_at) {
        best = row;
      }
    }
    return best ? { ...best } : null;
  }

  findByClaudeSessionId(claudeSessionId: string): SessionRow | null {
    // Phase-2 Season-8 (Watcher-Resolver-Fix): Tie-Break = juengste Session
    // gewinnt, analog zum cwd-Fallback und zum SQLite-Statement.
    let best: SessionRow | null = null;
    for (const row of this.rows.values()) {
      if (row.claude_session_id !== claudeSessionId) continue;
      if (best === null || row.started_at > best.started_at) {
        best = row;
      }
    }
    return best ? { ...best } : null;
  }

  assignSeasonNumber(sessionId: string): AssignSeasonResult | null {
    const session = this.rows.get(sessionId);
    if (!session) return null;
    if (session.season_number !== null) {
      return { seasonNumber: session.season_number, freshlyAssigned: false };
    }
    // MAX(season_number)+1 ueber alle Sessions des gleichen Projekts berechnen.
    // Analog zum SQLite-Pfad (MAX-Aggregat) — InMemory hat keine Indizes, aber
    // Tests bewegen sich im einstelligen Session-Bereich.
    let max = 0;
    for (const row of this.rows.values()) {
      if (row.project_id !== session.project_id) continue;
      if (row.season_number === null) continue;
      if (row.season_number > max) max = row.season_number;
    }
    const next = max + 1;
    this.rows.set(sessionId, { ...session, season_number: next });
    return { seasonNumber: next, freshlyAssigned: true };
  }

  // Test-Hilfe: Token-Aggregate für eine Session direkt setzen (ohne MessageRepo).
  seedMessageStats(
    sessionId: string,
    stats: { tokens_in: number; tokens_out: number; message_count: number },
  ): void {
    this.messageStats.set(sessionId, { ...stats });
  }
}
