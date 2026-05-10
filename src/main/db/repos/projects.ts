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
  // Sprint 6: atomar (Transaktion) den aktuellen next_season_number-Wert lesen und
  // um 1 erhöhen. Returnt den VORHERIGEN Wert (= die Season-Nummer, die der Caller
  // der frisch zu erstellenden Session zuweisen kann). null, wenn das Project nicht
  // existiert. Lücken bei späterem Spawn-Fehler sind explizit akzeptiert
  // (Architektur 6.6: "Lücken bei Abbruch akzeptiert").
  allocateSeasonNumber(projectId: string): number | null;
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
}

// --- SQLite-Driver --------------------------------------------------

export class SqliteProjectDriver implements ProjectDbDriver {
  private readonly insertStmt: Database.Statement;
  private readonly findByIdStmt: Database.Statement<[string], ProjectRow>;
  private readonly findByPathStmt: Database.Statement<[string], ProjectRow>;
  private readonly listAllStmt: Database.Statement<[], ProjectRow>;
  private readonly reassignStmt: Database.Statement;
  private readonly reassignMessagesStmt: Database.Statement;
  private readonly listSessionsStmt: Database.Statement<
    [string],
    { id: string; cwd: string }
  >;
  private readonly readSeasonStmt: Database.Statement<[string], { next_season_number: number }>;
  private readonly bumpSeasonStmt: Database.Statement;
  private readonly allocateSeasonTxn: Database.Transaction<(projectId: string) => number | null>;

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
    const PROJECT_SELECT_WITH_COUNT = `
      SELECT p.*, COALESCE(s.cnt, 0) AS session_count
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
    this.listAllStmt = db.prepare<[], ProjectRow>(
      `${PROJECT_SELECT_WITH_COUNT}
       ORDER BY (p.id = '${DEFAULT_PROJECT_ID}') ASC, p.name COLLATE NOCASE ASC`,
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
    // Sprint 6: atomare Counter-Allocation. SELECT+UPDATE in einer better-sqlite3-
    // Transaction (synchron, lokales File → Race nur theoretisch). Die Side-Effects
    // einer fehlgeschlagenen Spawn-Folge (Counter incrementiert, kein Insert) sind
    // bewusst akzeptierte Lücken laut Architektur 6.6.
    this.readSeasonStmt = db.prepare<[string], { next_season_number: number }>(
      'SELECT next_season_number FROM projects WHERE id = ?',
    );
    this.bumpSeasonStmt = db.prepare(
      'UPDATE projects SET next_season_number = next_season_number + 1 WHERE id = ?',
    );
    this.allocateSeasonTxn = db.transaction((projectId: string): number | null => {
      const row = this.readSeasonStmt.get(projectId);
      if (!row) return null;
      this.bumpSeasonStmt.run(projectId);
      return row.next_season_number;
    });
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
    return this.listAllStmt.all();
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
    return this.allocateSeasonTxn(projectId);
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
  public readonly sessions = new Map<string, { id: string; cwd: string; project_id: string }>();

  private toRow(insert: ProjectInsert): ProjectRow {
    return { ...insert, session_count: this.countSessionsForProject(insert.id) };
  }

  private countSessionsForProject(projectId: string): number {
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.project_id === projectId) count += 1;
    }
    return count;
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
    const previous = project.next_season_number;
    project.next_season_number = previous + 1;
    return previous;
  }

  // Test-Hilfe: Session zur Map hinzufügen, ohne über Sessions-Repo zu gehen.
  seedSession(session: { id: string; cwd: string; project_id: string }): void {
    this.sessions.set(session.id, { ...session });
  }
}

// Helper: ScannedProject + DEFAULT_PROJECT_NAME → finaler Anzeigename.
// Wenn der Ordner-Basename leer ist (Edge-Case bei Root-Pfaden), fällt der ganze Pfad rein.
export function scannedProjectName(p: ScannedProject): string {
  const base = path.basename(p.path);
  return base.length > 0 ? base : p.path;
}
