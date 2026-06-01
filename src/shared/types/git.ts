// Git (Sprint 7): Status, Diff, Show, Session-Diff.

// Status-Codes aus simple-git's Single-Char-Codes auf semantisches Vokabular gemappt.
// 'unchanged' deckt Whitespace/leeren Code im jeweiligen Slot ab (z.B. wenn nur der
// Worktree, nicht der Index verändert wurde).
export type GitFileStatus =
  | 'unchanged'
  | 'modified'
  | 'added'
  | 'deleted'
  | 'untracked'
  | 'renamed'
  | 'copied'
  | 'unmerged';

export interface GitFileChange {
  // Pfad relativ zum Repo-Root, in Forward-Slash-Notation (simple-git normalisiert).
  path: string;
  // Worktree-Status: was hat der User im Working-Tree, das noch nicht gestaged ist.
  worktreeStatus: GitFileStatus;
  // Index-Status: was ist schon mit `git add` markiert. Beide getrennt, damit das
  // Pre-Commit-Panel staged vs. unstaged differenzieren kann.
  indexStatus: GitFileStatus;
  // Sprint 9 — Line-Counts pro File (aus `git diff --numstat`). Untracked
  // Files liefern keine Counts (Git kennt sie noch nicht), Binary-Files
  // ebenfalls nicht — daher `null` als legitimer Wert für „nicht messbar".
  insertions: number | null;
  deletions: number | null;
}

export interface GitStatusResult {
  branch: string;
  files: GitFileChange[];
  ahead: number;
  behind: number;
}

// IPC-Inputs: Renderer schickt die projectId, der Main löst sie gegen die DB auf
// und ruft den Driver mit dem absoluten Repo-Pfad. Direkte Pfad-Übergabe vermeiden
// wir bewusst — sonst kann der Renderer einen beliebigen Pfad reinschicken und
// simple-git darauf laufen lassen.
export interface GitStatusInput {
  projectId: string;
}

export interface GitDiffInput {
  projectId: string;
  // Optional: nur den Diff einer einzelnen Datei (für Datei-Tab-Diff in Sprint 7+).
  // null/undefined = kompletter Working-Tree-Diff.
  filePath?: string;
}

export interface GitDiffResult {
  // Roher Unified-Diff-Text wie git diff ihn ausgibt. Leer-String = kein Diff.
  // Renderer parst den Patch via @codemirror/merge (Phase 6).
  patch: string;
  // Ob der Pfad ein Git-Repo ist. False = kein .git im Project-Pfad,
  // Renderer zeigt entsprechenden Hinweis statt eines Diffs.
  hasGit: boolean;
}

// Phase 6: Datei-Inhalt am Git-Ref (Default 'HEAD'). Leerer String = Datei
// existiert am Ref nicht (z.B. neu im Working-Tree, nie committed).
export interface GitShowInput {
  projectId: string;
  relPath: string;
  ref?: string;
}

export interface GitShowResult {
  content: string;
  // hasGit-Hint analog zu GitDiffResult — sollte praktisch nie false sein,
  // weil der Caller vorher git:status gerufen hat (das hätte schon NOT_A_GIT_REPO
  // geliefert). Hier zur Defensiv-Konsistenz.
  hasGit: boolean;
}

// Phase-2 Season-29 (Multi-Tab-Diff): Index-Version einer Datei aus dem
// Staging-Area lesen (`git show :<relPath>`). Sub-Pfad des Diff-Viewers im
// 'staged'-Modus, der die Index-Inhalte gegen HEAD vergleicht.
export interface GitShowStagedInput {
  projectId: string;
  relPath: string;
}

export type GitShowStagedResult = GitShowResult;

// Phase-2 Season-29 (Multi-Tab-Diff): Session-Diff. Renderer schickt die
// Session-ID, der Main resolved das Projekt + den persistierten
// `start_commit_sha`. Bei fehlendem Baseline-SHA (Legacy-Session, has_git=0,
// revParse-Fehler) kommt `hasBaseline=false` zurueck — Renderer zeigt dann
// einen Empty-State, statt einen leeren Diff zu rendern. Bei Erfolg listet
// `files` die Aenderungen seit dem Baseline-Commit; pro Datei holt der
// Renderer den Original-Inhalt via `git:show` mit `ref=baselineSha`.
export interface GitSessionDiffInput {
  sessionId: string;
}

export interface GitSessionDiffResult {
  hasBaseline: boolean;
  // Baseline-SHA, der fuer per-File-git:show-Aufrufe wiederverwendet wird.
  // null gdw. hasBaseline=false.
  baselineSha: string | null;
  branch: string;
  files: GitFileChange[];
}
