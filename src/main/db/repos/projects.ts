import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { ProjectRow, ScannedProject } from '@shared/types';
import type { IpcResult } from '@shared/types';
import { ok, err } from '@shared/result';
import { DEFAULT_PROJECT_ID, DEFAULT_PROJECT_NAME } from '@shared/constants';

// Default-Project-Lifeline aus Sprint 2 (siehe @shared/constants).
// Sprint 4 erkennt den Bucket per UUID und versucht, dessen Sessions per
// cwd-Prefix-Match auf echte Projects umzuhängen (Variante A aus Sprint-4-Briefing).
export { DEFAULT_PROJECT_ID, DEFAULT_PROJECT_NAME };

export function ensureDefaultProject(
  db: Database.Database,
  workspacePath: string,
): string {
  const existing = db
    .prepare<[string], { id: string }>('SELECT id FROM projects WHERE id = ?')
    .get(DEFAULT_PROJECT_ID);
  if (existing) return existing.id;

  db.prepare(
    `INSERT INTO projects (id, name, path, added_manually, has_git, next_season_number, created_at)
     VALUES (?, ?, ?, 0, 0, 1, ?)`,
  ).run(DEFAULT_PROJECT_ID, DEFAULT_PROJECT_NAME, workspacePath, Date.now());
  return DEFAULT_PROJECT_ID;
}

// --- Repository -----------------------------------------------------

export interface ProjectInsert {
  id: string;
  name: string;
  path: string;
  added_manually: number;
  has_git: number;
  next_season_number: number;
  created_at: number;
}

export interface ProjectDbDriver {
  insert(row: ProjectInsert): void;
  findById(id: string): ProjectRow | null;
  findByPath(path: string): ProjectRow | null;
  listAll(): ProjectRow[];
  // Wird vom Sprint-4-Migrationspass genutzt: hängt eine Session von einem Project
  // an ein anderes um. Returnt die Anzahl der tatsächlich umgehängten Rows.
  reassignSession(sessionId: string, newProjectId: string): number;
  // Sprint 5: messages tragen denormalisiertes project_id (für Per-Projekt-Aggregate).
  // Beim Remap muss das mitgezogen werden, sonst zeigen die Per-Projekt-Bars
  // weiterhin die alte Zuordnung. Returnt die Anzahl umgehängter messages.
  reassignSessionMessages(sessionId: string, newProjectId: string): number;
  // Wird beim Remap-Pass gebraucht: liefert die Sessions, die noch am Default-Project hängen.
  // Nur die Felder, die der Remap-Algorithmus liest (id + cwd) — kein Volltext-Join.
  listSessionsForProject(projectId: string): Array<{ id: string; cwd: string }>;
  // Phase-2 Season-11: Counter ist jetzt dynamisch abgeleitet — MAX(season_number)+1
  // ueber alle sessions des Projekts. Frueher schrieb diese Methode auf
  // projects.next_season_number; das hat den Counter aber nur bei neu gespawnten
  // Feature-Sessions hochgezaehlt, nicht bei Templates-Send-Workflow. Jetzt ist
  // der Wert immer konsistent mit dem tatsaechlichen Maximum in sessions.
  // null, wenn das Project nicht existiert. Bestehende Luecken (Season N wurde
  // nie als Session persistiert) bleiben Luecken — das ist Architektur 6.6 aus
  // Sprint 6 weiterhin treu.
  allocateSeasonNumber(projectId: string): number | null;
  // Phase-2 Season-8: atomare Projekt-Entfernung. Hängt zuerst alle Sessions
  // (inkl. ihrer messages-Rows) auf newProjectId um, löscht dann die projects-
  // Row. Returnt die Anzahl der umgehängten Sessions. Im SQLite-Driver läuft
  // das Ganze in einer better-sqlite3-Transaction, damit ein Crash zwischen
  // Reassign und Delete keinen inkonsistenten Zwischenstand hinterlässt.
  removeProjectAndReassignSessions(projectId: string, newProjectId: string): number;
}

// Path-Match-Helper: prüft, ob `cwd` ein Pfad innerhalb von `projectPath` ist.
// Akzeptiert exakten Match und Sub-Path-Match, aber NICHT Präfix-Tricks wie
// "C:\\Foo" ↔ "C:\\Foobar". Beide Pfade werden mit path.resolve normalisiert
// (Trailing-Slashes, Mixed-Separators auf Windows).
export function isPathInsideProject(cwd: string, projectPath: string): boolean {
  const normCwd = path.resolve(cwd);
  const normProject = path.resolve(projectPath);
  if (normCwd === normProject) return true;
  // Trennzeichen-sicheren Präfix-Test: nur Match, wenn nach dem Project-Pfad ein
  // Pfad-Separator folgt (oder das Ende erreicht wurde).
  const sep = path.sep;
  const projectWithSep = normProject.endsWith(sep) ? normProject : normProject + sep;
  return normCwd.startsWith(projectWithSep);
}

export class ProjectRepository {
  constructor(private readonly driver: ProjectDbDriver) {}

  listAll(): ProjectRow[] {
    return this.driver.listAll();
  }

  getById(id: string): ProjectRow | null {
    return this.driver.findById(id);
  }

  getByPath(projectPath: string): ProjectRow | null {
    return this.driver.findByPath(projectPath);
  }

  // Insert eines neuen Projects. Rückgabe ist Result, weil Pfad-Uniqueness der
  // erwartbare Fehlerfall ist (UNIQUE-Constraint in 0001_init.sql).
  insert(input: {
    name: string;
    path: string;
    has_git: boolean;
    added_manually: boolean;
  }): IpcResult<ProjectRow> {
    const existing = this.driver.findByPath(input.path);
    if (existing) {
      return err<ProjectRow>(
        `Projekt mit Pfad ${input.path} existiert bereits`,
        'PROJECT_PATH_DUPLICATE',
      );
    }
    const row: ProjectInsert = {
      id: randomUUID(),
      name: input.name,
      path: input.path,
      added_manually: input.added_manually ? 1 : 0,
      has_git: input.has_git ? 1 : 0,
      next_season_number: 1,
      created_at: Date.now(),
    };
    this.driver.insert(row);
    const inserted = this.driver.findById(row.id);
    if (!inserted) {
      return err<ProjectRow>(
        `Insert von ${input.path} hinterließ keine Row`,
        'PROJECT_INSERT_FAILED',
      );
    }
    return ok(inserted);
  }

  // Sprint-4-Remap-Pass:
  //
  // Wird einmalig nach dem Initial-Scan aufgerufen. Geht alle Sessions durch, die
  // noch am `fromProjectId` (= Default-Project) hängen, und versucht für jede ein
  // Match per cwd-Prefix gegen die Liste aller anderen Projects. Treffer → Session
  // wird umgehängt. Kein Treffer → Session bleibt am Default (Legacy-Bucket).
  //
  // Rückgabe: Anzahl der tatsächlich umgehängten Sessions (für Logging).
  remapSessionsByCwdPrefix(fromProjectId: string, candidates: ProjectRow[]): number {
    const sessions = this.driver.listSessionsForProject(fromProjectId);
    const filteredCandidates = candidates.filter((p) => p.id !== fromProjectId);
    let moved = 0;
    for (const session of sessions) {
      const match = filteredCandidates.find((p) => isPathInsideProject(session.cwd, p.path));
      if (!match) continue;
      const updated = this.driver.reassignSession(session.id, match.id);
      if (updated > 0) {
        moved += 1;
        // Sprint-5-Erweiterung: messages.project_id mitziehen, sonst zeigen
        // Per-Projekt-Token-Aggregate weiter den alten Default-Bucket.
        this.driver.reassignSessionMessages(session.id, match.id);
      }
    }
    return moved;
  }

  // Sprint 6 (Q6 Variante B): nur durchreichen — der atomare SELECT+UPDATE-Schritt
  // sitzt im Driver, weil die Transaktion eine Datenbankprimitive ist. Caller im
  // pty:create-Handler ruft das nur, wenn type === 'feature' (Architektur 6.6:
  // Bug/Review/Docs-Sync bekommen kein season_number).
  allocateSeasonNumber(projectId: string): number | null {
    return this.driver.allocateSeasonNumber(projectId);
  }

  // Phase-2 Season-8: Projekt aus der Liste entfernen. Sessions + zugehörige
  // messages werden zuerst auf den Default-Bucket umgehängt (Gegenrichtung zum
  // remapSessionsByCwdPrefix aus Sprint 4), danach wird die projects-Row gelöscht.
  // Default-Project selbst ist immutable — der Bucket ist die letzte Auffanglinie
  // für Sessions ohne Zuordnung und darf nicht entfallen.
  removeProject(projectId: string): IpcResult<{ sessionsRemapped: number }> {
    if (projectId === DEFAULT_PROJECT_ID) {
      return err<{ sessionsRemapped: number }>(
        'Default-Bucket kann nicht entfernt werden',
        'PROJECT_DEFAULT_IMMUTABLE',
      );
    }
    const existing = this.driver.findById(projectId);
    if (!existing) {
      return err<{ sessionsRemapped: number }>(
        `Projekt ${projectId} nicht gefunden`,
        'PROJECT_NOT_FOUND',
      );
    }
    const sessionsRemapped = this.driver.removeProjectAndReassignSessions(
      projectId,
      DEFAULT_PROJECT_ID,
    );
    return ok({ sessionsRemapped });
  }
}

// --- SQLite-Driver --------------------------------------------------

export class SqliteProjectDriver implements ProjectDbDriver {
  private readonly insertStmt: Database.Statement;
  private readonly findByIdStmt: Database.Statement<[string], ProjectRow>;
  private readonly findByPathStmt: Database.Statement<[string], ProjectRow>;
  private readonly listAllStmt: Database.Statement<[string], ProjectRow>;
  private readonly reassignStmt: Database.Statement;
  private readonly reassignMessagesStmt: Database.Statement;
  private readonly listSessionsStmt: Database.Statement<
    [string],
    { id: string; cwd: string }
  >;
  // Phase-2 Season-11: allocateSeasonNumber liest jetzt einen aggregierten Wert
  // ueber sessions.season_number. Kein UPDATE mehr noetig — der Counter wird
  // erst beim tatsaechlichen Insert (pty:create) oder UPDATE (assignSeasonNumber)
  // verbraucht. Das verbleibende projects.next_season_number-Feld ist tot.
  private readonly projectExistsStmt: Database.Statement<[string], { exists_flag: number }>;
  private readonly maxSeasonForProjectStmt: Database.Statement<
    [string],
    { max_season: number | null }
  >;
  // Phase-2 Season-8: bulk-Reassign + Delete in einer Transaction; ein einziges
  // UPDATE pro Tabelle reicht (alle Sessions des Projekts auf einmal), kein
  // Per-Session-Loop wie beim Sprint-4-Remap nötig — dort entscheidet die
  // cwd-Match-Logik pro Session, hier wandert die komplette Mannschaft.
  private readonly bulkReassignSessionsStmt: Database.Statement;
  private readonly bulkReassignMessagesStmt: Database.Statement;
  private readonly deleteProjectStmt: Database.Statement;
  private readonly removeProjectTxn: Database.Transaction<
    (projectId: string, newProjectId: string) => number
  >;

  constructor(private readonly db: Database.Database) {
    this.insertStmt = db.prepare(
      `INSERT INTO projects (
        id, name, path, added_manually, has_git, next_season_number, created_at
      ) VALUES (
        @id, @name, @path, @added_manually, @has_git, @next_season_number, @created_at
      )`,
    );
    // Findet ein Projekt + Session-Count über LEFT JOIN. Die COALESCE-Wrapper sind
    // für den Fall, dass keine Sessions vorhanden sind (NULL → 0).
    //
    // Phase-2 Season-11: next_season_number kommt jetzt als korrelierte Subquery
    // ueber sessions.season_number, NICHT mehr aus projects.next_season_number.
    // Damit zieht der Wert auch dann mit, wenn eine Season per Templates-Send
    // auf eine bestehende Session geschrieben wird (statt ueber pty:create mit
    // type='feature'). Die Spalte projects.next_season_number wird damit dead
    // (siehe TECH_SCHULDEN-Eintrag) — sie bleibt als Default 1 bei Project-Insert,
    // wird aber nicht mehr ausgelesen.
    const PROJECT_SELECT_WITH_COUNT = `
      SELECT
        p.id, p.name, p.path, p.added_manually, p.has_git, p.created_at,
        COALESCE(s.cnt, 0) AS session_count,
        COALESCE(
          (SELECT MAX(season_number) FROM sessions
           WHERE project_id = p.id AND season_number IS NOT NULL),
          0
        ) + 1 AS next_season_number
      FROM projects p
      LEFT JOIN (
        SELECT project_id, COUNT(*) AS cnt FROM sessions GROUP BY project_id
      ) s ON s.project_id = p.id
    `;
    this.findByIdStmt = db.prepare<[string], ProjectRow>(
      `${PROJECT_SELECT_WITH_COUNT} WHERE p.id = ?`,
    );
    this.findByPathStmt = db.prepare<[string], ProjectRow>(
      `${PROJECT_SELECT_WITH_COUNT} WHERE p.path = ?`,
    );
    // Default-Project (UUID …0001) ans Ende, damit es in der Sidebar als Legacy-Bucket
    // unter den echten Projekten landet, ohne dass die UI selbst sortieren muss.
    // Konstante per ?-Bind statt String-Interpolation — konsistent mit den anderen
    // Statements, kein latentes Injection-Risiko, falls die Konstante jemals
    // settings-getrieben wird.
    this.listAllStmt = db.prepare<[string], ProjectRow>(
      `${PROJECT_SELECT_WITH_COUNT}
       ORDER BY (p.id = ?) ASC, p.name COLLATE NOCASE ASC`,
    );
    this.reassignStmt = db.prepare(
      'UPDATE sessions SET project_id = @newProjectId WHERE id = @sessionId',
    );
    this.reassignMessagesStmt = db.prepare(
      'UPDATE messages SET project_id = @newProjectId WHERE session_id = @sessionId',
    );
    this.listSessionsStmt = db.prepare<[string], { id: string; cwd: string }>(
      'SELECT id, cwd FROM sessions WHERE project_id = ?',
    );
    // Phase-2 Season-11: Allocation ist jetzt eine reine SELECT-Operation —
    // MAX(sessions.season_number)+1 fuer das Projekt. Der erste Helper prueft,
    // ob das Projekt ueberhaupt existiert (damit der null-Fall des alten
    // Vertrags erhalten bleibt), der zweite zieht das Maximum aus sessions.
    this.projectExistsStmt = db.prepare<[string], { exists_flag: number }>(
      'SELECT 1 AS exists_flag FROM projects WHERE id = ?',
    );
    this.maxSeasonForProjectStmt = db.prepare<[string], { max_season: number | null }>(
      `SELECT MAX(season_number) AS max_season FROM sessions
       WHERE project_id = ? AND season_number IS NOT NULL`,
    );

    this.bulkReassignSessionsStmt = db.prepare(
      'UPDATE sessions SET project_id = @newProjectId WHERE project_id = @oldProjectId',
    );
    this.bulkReassignMessagesStmt = db.prepare(
      'UPDATE messages SET project_id = @newProjectId WHERE project_id = @oldProjectId',
    );
    this.deleteProjectStmt = db.prepare('DELETE FROM projects WHERE id = ?');
    this.removeProjectTxn = db.transaction(
      (projectId: string, newProjectId: string): number => {
        const sessionsResult = this.bulkReassignSessionsStmt.run({
          oldProjectId: projectId,
          newProjectId,
        });
        // messages werden mitumgehängt (Sprint-5-Konvention: denormalisiertes
        // project_id pro Message, damit Per-Projekt-Token-Aggregate ohne Join
        // sind). Ergebnis-Count interessiert hier nicht — die SQL ist idempotent.
        this.bulkReassignMessagesStmt.run({
          oldProjectId: projectId,
          newProjectId,
        });
        this.deleteProjectStmt.run(projectId);
        return Number(sessionsResult.changes);
      },
    );
  }

  insert(row: ProjectInsert): void {
    this.insertStmt.run(row);
  }

  findById(id: string): ProjectRow | null {
    return this.findByIdStmt.get(id) ?? null;
  }

  findByPath(projectPath: string): ProjectRow | null {
    return this.findByPathStmt.get(projectPath) ?? null;
  }

  listAll(): ProjectRow[] {
    return this.listAllStmt.all(DEFAULT_PROJECT_ID);
  }

  reassignSession(sessionId: string, newProjectId: string): number {
    const result = this.reassignStmt.run({ sessionId, newProjectId });
    return Number(result.changes);
  }

  reassignSessionMessages(sessionId: string, newProjectId: string): number {
    const result = this.reassignMessagesStmt.run({ sessionId, newProjectId });
    return Number(result.changes);
  }

  listSessionsForProject(projectId: string): Array<{ id: string; cwd: string }> {
    return this.listSessionsStmt.all(projectId);
  }

  allocateSeasonNumber(projectId: string): number | null {
    const exists = this.projectExistsStmt.get(projectId);
    if (!exists) return null;
    const row = this.maxSeasonForProjectStmt.get(projectId);
    const max = row?.max_season ?? null;
    return (max ?? 0) + 1;
  }

  removeProjectAndReassignSessions(projectId: string, newProjectId: string): number {
    return this.removeProjectTxn(projectId, newProjectId);
  }
}

// --- In-Memory-Driver für Tests ------------------------------------

export class InMemoryProjectDriver implements ProjectDbDriver {
  // Speichert ProjectInsert intern (ohne session_count); listAll/findById/findByPath
  // setzen den Count zur Lesezeit aus this.sessions zusammen, analog zur SQL-Variante,
  // die den LEFT-JOIN-Aggregat zur Lesezeit berechnet.
  private readonly projects = new Map<string, ProjectInsert>();
  // Wird in Tests vom Driver-Konsumenten gefüttert, damit listSessionsForProject etwas
  // zurückliefert. Sprint 4 fasst Sessions im echten Repo an — der In-Memory-Pfad
  // braucht eine ähnliche Brücke, ohne SessionRepository zu importieren.
  // Phase-2 Season-11: optionales season_number erlaubt es, das Verhalten von
  // allocateSeasonNumber (= MAX(season_number)+1) im Test zu simulieren.
  public readonly sessions = new Map<
    string,
    { id: string; cwd: string; project_id: string; season_number?: number | null }
  >();

  private toRow(insert: ProjectInsert): ProjectRow {
    return {
      ...insert,
      session_count: this.countSessionsForProject(insert.id),
      // Phase-2 Season-11: dynamisch ueber sessions.season_number berechnet,
      // damit die InMemory-Variante exakt das gleiche Verhalten zeigt wie
      // der SQLite-Driver mit der korrelierten Subquery.
      next_season_number: this.computeNextSeasonNumber(insert.id),
    };
  }

  private countSessionsForProject(projectId: string): number {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.project_id === projectId) count += 1;
    }
    return count;
  }

  private computeNextSeasonNumber(projectId: string): number {
    let max = 0;
    for (const s of this.sessions.values()) {
      if (s.project_id !== projectId) continue;
      const n = s.season_number;
      if (typeof n === 'number' && n > max) max = n;
    }
    return max + 1;
  }

  insert(row: ProjectInsert): void {
    if (this.projects.has(row.id)) {
      throw new Error(`Project ${row.id} existiert bereits`);
    }
    for (const existing of this.projects.values()) {
      if (existing.path === row.path) {
        // Simuliert die UNIQUE(path)-Constraint von SQLite.
        const e = new Error(`UNIQUE constraint failed: projects.path`) as Error & {
          code?: string;
        };
        e.code = 'SQLITE_CONSTRAINT_UNIQUE';
        throw e;
      }
    }
    this.projects.set(row.id, { ...row });
  }

  findById(id: string): ProjectRow | null {
    const insert = this.projects.get(id);
    return insert ? this.toRow(insert) : null;
  }

  findByPath(projectPath: string): ProjectRow | null {
    for (const insert of this.projects.values()) {
      if (insert.path === projectPath) return this.toRow(insert);
    }
    return null;
  }

  listAll(): ProjectRow[] {
    return Array.from(this.projects.values())
      .map((insert) => this.toRow(insert))
      .sort((a, b) => {
        // Default-Project ans Ende.
        const aDefault = a.id === DEFAULT_PROJECT_ID ? 1 : 0;
        const bDefault = b.id === DEFAULT_PROJECT_ID ? 1 : 0;
        if (aDefault !== bDefault) return aDefault - bDefault;
        return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' });
      });
  }

  reassignSession(sessionId: string, newProjectId: string): number {
    const session = this.sessions.get(sessionId);
    if (!session) return 0;
    session.project_id = newProjectId;
    return 1;
  }

  reassignSessionMessages(_sessionId: string, _newProjectId: string): number {
    // InMemory-Tests nutzen den MessageRepository getrennt — wir tracken hier
    // nur das Interface, damit der Driver-Vertrag vollständig ist.
    return 0;
  }

  listSessionsForProject(projectId: string): Array<{ id: string; cwd: string }> {
    const out: Array<{ id: string; cwd: string }> = [];
    for (const s of this.sessions.values()) {
      if (s.project_id === projectId) out.push({ id: s.id, cwd: s.cwd });
    }
    return out;
  }

  allocateSeasonNumber(projectId: string): number | null {
    const project = this.projects.get(projectId);
    if (!project) return null;
    // Phase-2 Season-11: keine schreibende Operation mehr — der Wert wird
    // dynamisch aus sessions.season_number abgeleitet. Mehrfach-Aufrufe ohne
    // dazwischenliegenden Session-Insert/Update liefern denselben Wert.
    return this.computeNextSeasonNumber(projectId);
  }

  removeProjectAndReassignSessions(projectId: string, newProjectId: string): number {
    let moved = 0;
    for (const session of this.sessions.values()) {
      if (session.project_id !== projectId) continue;
      session.project_id = newProjectId;
      moved += 1;
    }
    this.projects.delete(projectId);
    return moved;
  }

  // Test-Hilfe: Session zur Map hinzufügen, ohne über Sessions-Repo zu gehen.
  // Phase-2 Season-11: season_number optional, damit Tests den dynamischen
  // Counter (MAX+1) bequem ohne SessionRepository-Dependency simulieren koennen.
  seedSession(session: {
    id: string;
    cwd: string;
    project_id: string;
    season_number?: number | null;
  }): void {
    this.sessions.set(session.id, { ...session });
  }
}

// Helper: ScannedProject + DEFAULT_PROJECT_NAME → finaler Anzeigename.
// Wenn der Ordner-Basename leer ist (Edge-Case bei Root-Pfaden), fällt der ganze Pfad rein.
export function scannedProjectName(p: ScannedProject): string {
  const base = path.basename(p.path);
  return base.length > 0 ? base : p.path;
}
