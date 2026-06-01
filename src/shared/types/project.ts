// Workspace / Projects (Sprint 4).

import type { ClaudeMdFrontmatter } from '../schemas';

// SQLite-Project-Row laut Schema in 0001_init.sql plus abgeleiteter session_count
// (Aggregat aus der sessions-Tabelle). Sprint 4 nutzt session_count, um den
// Legacy-Default-Bucket nur bei tatsächlich verbleibenden Sessions in der Sidebar
// zu zeigen — sonst verschwindet er sauber, sobald der cwd-Remap alles umgehängt hat.
export interface ProjectRow {
  id: string;
  name: string;
  path: string;
  added_manually: number; // SQLite BOOLEAN → 0/1
  has_git: number;
  next_season_number: number;
  created_at: number;
  session_count: number;
}

// Output des Workspace-Scanners. Wird im Main aus rohem fs zusammengebaut, dann
// per insert() in die projects-Tabelle übernommen — id und created_at vergibt das Repo.
export interface ScannedProject {
  name: string;
  path: string;
  has_git: boolean;
}

// Frontmatter-Output des CLAUDE.md-Parsers (zod-validierte Form).
// `body` ist der reine Markdown-Text *nach* dem Frontmatter-Block.
// `frontmatter` ist null, wenn entweder gar keine Frontmatter da ist oder die
// workbench-Section fehlt — beides sind legitime Zustände, keine Fehler.
export interface ClaudeMdParseResult {
  frontmatter: ClaudeMdFrontmatter | null;
  body: string;
  warnings: string[];
}

export interface ProjectReadCfgInput {
  projectId: string;
}

// Phase-2 Season-8: project:remove. Renderer schickt die DB-UUID; der Main
// hängt alle Sessions des Projekts auf den Default-Bucket um (samt messages)
// und löscht die projects-Row. DEFAULT_PROJECT_ID ist server-seitig immutable.
export interface ProjectRemoveInput {
  projectId: string;
}
