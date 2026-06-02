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

// Season 37 (Worktree-Support): Liste der lokalen Branches eines Projekts.
// Speist das „bestehenden Branch auschecken"-Dropdown im NewSessionModal.
// Server resolved projectId → Repo-Pfad; Renderer schickt nie einen freien Pfad.
export interface GitListBranchesInput {
  projectId: string;
}

export interface GitListBranchesResult {
  // hasGit=false → Renderer blendet das Worktree-Feature aus (kein Repo).
  hasGit: boolean;
  // Aktueller Branch des Haupt-Checkouts (leer bei detached HEAD / kein Repo).
  current: string;
  // Alle lokalen Branch-Namen, alphabetisch.
  branches: string[];
}

// Season 37: Ein Eintrag der `git worktree list`-Ausgabe. Speist die
// „bestehende Worktrees"-Uebersicht im Modal, damit der User Branch-/Pfad-
// Kollisionen vor dem Erstellen sieht.
export interface GitWorktreeEntry {
  // Absoluter Pfad des Worktree-Verzeichnisses.
  path: string;
  // Ausgecheckter Branch (null bei detached HEAD).
  branch: string | null;
  // True fuer den Haupt-Checkout (das Projekt selbst), false fuer Linked-Worktrees.
  isMain: boolean;
}

export interface GitWorktreeListInput {
  projectId: string;
}

export interface GitWorktreeListResult {
  hasGit: boolean;
  worktrees: GitWorktreeEntry[];
}

// Season 37: Worktree-Diff vs. Basis-Branch (main/master). Renderer schickt die
// sessionId; der Main resolved Worktree-Pfad + Branch aus der Session-Row und
// den Basis-Ref aus dem Repo. Bei Sessions ohne Worktree kommt
// hasWorktree=false → Renderer zeigt einen Empty-State.
export interface GitWorktreeDiffInput {
  sessionId: string;
}

export interface GitWorktreeDiffResult {
  hasWorktree: boolean;
  // Branch des Worktrees (= sessions.worktree_branch). Leer gdw. hasWorktree=false.
  branch: string;
  // Aufgeloester Basis-Ref, gegen den verglichen wird (z.B. 'main'). Leer gdw.
  // hasWorktree=false. Wird vom Renderer fuer die per-File-git:show-Aufrufe
  // (Original-Inhalt am Basis-Ref) wiederverwendet.
  baseRef: string;
  files: GitFileChange[];
}

// Season 37: Cleanup eines Worktrees beim Archivieren. Renderer schickt die
// sessionId; bei `force=false` (Default) entfernt der Main den Worktree NUR,
// wenn er sauber ist (keine uncommitteten/ungepushten Aenderungen) — sonst
// kommt `dirty=true` zurueck und das UI fragt nach. Mit `force=true` wird der
// Worktree bedingungslos entfernt (git worktree remove --force).
export interface GitWorktreeRemoveInput {
  sessionId: string;
  force?: boolean;
}

export interface GitWorktreeRemoveResult {
  // True, wenn der Worktree tatsaechlich entfernt wurde.
  removed: boolean;
  // True, wenn nicht entfernt wurde, weil uncommittete/ungepushte Aenderungen
  // vorliegen und `force` nicht gesetzt war.
  dirty: boolean;
  // Anzahl uncommitteter Dateien im Worktree (fuer die Rueckfrage-Anzeige).
  uncommittedCount: number;
  // Commits, die der Worktree-Branch vor seinem Upstream hat (ungepusht).
  ahead: number;
}

// Season 37 (Worktree-Support): Working-Tree-Status DES Worktrees einer Session
// (Branch + geaenderte Dateien) — fuers Pre-Commit-Panel, das bei Worktree-
// Sessions den Worktree statt des Haupt-Checkouts anzeigen muss. Server resolved
// sessionId → sessions.worktree_path und ruft `git status` dort. hasWorktree=false
// → die Session laeuft im Projekt-Root (Caller faellt auf git:status zurueck).
export interface GitWorktreeStatusInput {
  sessionId: string;
}

export interface GitWorktreeStatusResult {
  hasWorktree: boolean;
  hasGit: boolean;
  // Branch + Dateien des Worktrees. null gdw. hasWorktree=false oder hasGit=false.
  status: GitStatusResult | null;
}
