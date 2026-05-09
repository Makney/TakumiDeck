import type Database from 'better-sqlite3';

// Default-Project-Lifeline für Sprint 2.
//
// Sessions referenzieren in der DB einen project_id (NOT NULL FK). Sprint 4 wird die
// Projects-Tabelle aus dem Workspace-Scanner befüllen — bis dahin reicht ein einziger
// Default-Eintrag, an dem Sessions hängen, damit der FK-Constraint erfüllt ist.
//
// Stable UUID, damit Sprint 4 explizit erkennen kann, dass es sich um den Sprint-2-Default
// handelt (und ihn z.B. ausblenden oder migrieren kann).
export const DEFAULT_PROJECT_ID = '00000000-0000-0000-0000-000000000001';

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
  ).run(DEFAULT_PROJECT_ID, '__default__', workspacePath, Date.now());
  return DEFAULT_PROJECT_ID;
}
