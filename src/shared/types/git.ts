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

// Worktree-Merge (Phase 3): Strategie, mit der ein Worktree-Branch nach
// main/master zurueckgefuehrt wird.
//   - 'merge-commit': `git merge --no-ff` — erzeugt immer einen Merge-Commit,
//     der Branch-Verlauf bleibt sichtbar (Default).
//   - 'squash': `git merge --squash` + `git commit` — alle Branch-Commits zu
//     einem zusammengefasst (linearer Verlauf, Einzel-Commits gehen verloren).
//   - 'ff-only': `git merge --ff-only` — nur wenn der Basis-Branch nicht
//     divergiert ist; sonst schlaegt der Merge fehl (ohne den Working-Tree
//     anzufassen).
export type GitWorktreeMergeStrategy = 'merge-commit' | 'squash' | 'ff-only';

// Driver-Ergebnis eines Merge-Versuchs (Pure-Outcome, ohne Cleanup):
//   - 'merged': erfolgreich, `mergeCommitSha` zeigt auf den neuen HEAD.
//   - 'conflict': Konflikte erkannt; der Driver hat den halb-fertigen Merge
//     bereits zurueckgerollt (merge --abort bzw. reset --hard HEAD bei squash),
//     `conflictFiles` listet die betroffenen Pfade. Repo bleibt sauber.
//   - 'ff-failed': nur bei strategy='ff-only' — der Basis-Branch ist
//     divergiert, ein Fast-Forward ist nicht moeglich. Working-Tree unberuehrt.
export interface GitWorktreeMergeOutcome {
  status: 'merged' | 'conflict' | 'ff-failed';
  mergeCommitSha: string | null;
  conflictFiles: string[];
}

// Phase 3: Vorab-Daten fuers Merge-Modal — reine Lese-Operation, mutiert nichts.
// Renderer schickt die sessionId; der Main resolved Worktree-Pfad + Branch.
export interface GitWorktreeMergePreviewInput {
  sessionId: string;
}

export interface GitWorktreeMergePreviewResult {
  // hasWorktree=false → Session laeuft nicht in einem Worktree (Modal-Empty-State).
  hasWorktree: boolean;
  // Branch des Worktrees (= sessions.worktree_branch).
  branch: string;
  // Aufgeloester Basis-Ref, nach dem gemergt wird (z.B. 'main').
  baseRef: string;
  // Aktueller Branch des Haupt-Checkouts. Der Merge laeuft IM Haupt-Checkout,
  // der dafuer auf `baseRef` stehen muss — sonst blockt das Modal.
  mainCurrentBranch: string;
  // Haupt-Checkout ohne uncommittete Aenderungen? Vorbedingung fuer den Merge.
  mainClean: boolean;
  // Uncommittete Dateien IM Worktree — werden nicht mitgemergt (nur committete
  // History wandert nach main), daher nicht-blockierende Warnung im Modal.
  worktreeUncommittedCount: number;
  // Commits, die der Worktree-Branch dem Basis-Ref voraus ist (= wird gemergt).
  ahead: number;
  // Commits, die der Basis-Ref dem Worktree-Branch voraus ist (Divergenz —
  // relevant fuer ff-only).
  behind: number;
}

// Phase 3: Merge-Ausfuehrung. Renderer schickt sessionId + Strategie + Cleanup-
// Wuensche; der Main prueft die Vorbedingungen erneut (Server ist Autoritaet),
// mergt im Haupt-Checkout und raeumt bei Erfolg optional auf.
export interface GitWorktreeMergeInput {
  sessionId: string;
  strategy: GitWorktreeMergeStrategy;
  // Worktree nach erfolgreichem Merge entfernen (`git worktree remove`).
  removeWorktree: boolean;
  // Branch nach erfolgreichem Merge loeschen (`git branch -d`/`-D`).
  deleteBranch: boolean;
  // Optionale Commit-Message (merge-commit / squash). Leer → Git-Default bzw.
  // generierte Message.
  commitMessage?: string;
}

export interface GitWorktreeMergeResult {
  // True gdw. der Merge durchlief (status='merged').
  merged: boolean;
  // True, wenn Konflikte auftraten (Repo wurde zurueckgerollt, kein Merge).
  conflicted: boolean;
  // True, wenn strategy='ff-only' wegen Divergenz nicht durchging.
  ffFailed: boolean;
  // Konfliktdateien (nur bei conflicted=true gefuellt).
  conflictFiles: string[];
  // HEAD-SHA nach dem Merge (nur bei merged=true).
  mergeCommitSha: string | null;
  // Ob der Worktree tatsaechlich entfernt wurde (nur bei merged && removeWorktree).
  worktreeRemoved: boolean;
  // Ob der Branch tatsaechlich geloescht wurde (nur bei merged && deleteBranch).
  branchDeleted: boolean;
}

// =====================================================================
// Season 38 (Pull/Fetch/Branch-Switch): erweiterte Git-Integration fuer
// den Haupt-Checkout des aktiven Projekts (NICHT session-/worktree-bezogen —
// das hier laeuft alles in project.path).
// =====================================================================

// Ein lokaler Branch mit Tracking-Info. Speist die Branch-Liste in der Sidebar
// und das TitleBar-Dropdown.
export interface GitBranchInfo {
  // Branch-Name (z.B. 'main', 'feature/foo').
  name: string;
  // True fuer den aktuell ausgecheckten Branch des Haupt-Checkouts.
  isCurrent: boolean;
  // Upstream-Branch (z.B. 'origin/main') oder null, wenn kein Tracking gesetzt.
  upstream: string | null;
  // Commits, die der Branch dem Upstream voraus ist (0 ohne Upstream).
  ahead: number;
  // Commits, die der Branch dem Upstream hinterher ist (0 ohne Upstream).
  behind: number;
  // Pfad des Linked-Worktrees, in dem dieser Branch ausgecheckt ist — null,
  // wenn er nirgends in einem zweiten Worktree belegt ist. Git laesst denselben
  // Branch nicht zweimal auschecken, daher blockt das den Switch im Haupt-Checkout.
  checkedOutPath: string | null;
}

export interface GitBranchOverviewInput {
  projectId: string;
}

export interface GitBranchOverviewResult {
  // hasGit=false → Renderer blendet das Branch-Panel aus (kein Repo).
  hasGit: boolean;
  // Aktueller Branch des Haupt-Checkouts (Short-SHA bei detached HEAD).
  current: string;
  // True bei detached HEAD (current ist dann keine Branch-Referenz).
  detached: boolean;
  // Haupt-Checkout ohne uncommittete Aenderungen? Vorbedingung fuer Switch/Pull.
  mainClean: boolean;
  // Ist ueberhaupt ein Remote konfiguriert? Steuert Fetch/Pull-Verfuegbarkeit.
  hasRemote: boolean;
  // Lokale Branches, alphabetisch sortiert.
  branches: GitBranchInfo[];
}

// Branch-Switch im Haupt-Checkout (`git checkout <branch>`).
export interface GitCheckoutInput {
  projectId: string;
  branch: string;
  // True → bei dirty Working-Tree erst `git stash push -u`, dann wechseln.
  // False → dirty blockt den Switch (status='dirty'), Renderer fragt nach.
  autoStash: boolean;
}

export interface GitCheckoutResult {
  // 'switched'              — Branch gewechselt (ggf. mit vorherigem Stash).
  // 'dirty'                 — Working-Tree dirty und autoStash=false → Renderer
  //                           bietet „Stashen & wechseln" / „Abbrechen" an.
  // 'checked-out-elsewhere' — Ziel-Branch ist in einem Linked-Worktree belegt.
  status: 'switched' | 'dirty' | 'checked-out-elsewhere';
  // Ziel-Branch (gespiegelt fuer die Renderer-Meldung).
  branch: string;
  // True, wenn vor dem Switch automatisch gestasht wurde.
  stashed: boolean;
  // Worktree-Pfad bei status='checked-out-elsewhere', sonst null.
  checkedOutPath: string | null;
}

export interface GitFetchInput {
  projectId: string;
}

export interface GitFetchResult {
  // 'fetched'   — `git fetch --all --prune` lief durch.
  // 'no-remote' — kein Remote konfiguriert, nichts zu holen.
  status: 'fetched' | 'no-remote';
}

export interface GitPullInput {
  projectId: string;
}

export interface GitPullResult {
  // 'pulled'      — Aenderungen integriert (filesChanged/insertions/deletions).
  // 'up-to-date'  — bereits aktuell, nichts geaendert.
  // 'conflict'    — Merge-Konflikt; Pull abgebrochen, Working-Tree wieder sauber,
  //                 conflictFiles listet die Kollisionen.
  // 'dirty'       — Haupt-Checkout hat uncommittete Aenderungen → erst committen.
  // 'no-upstream' — aktueller Branch hat keinen Upstream gesetzt.
  // 'no-remote'   — kein Remote konfiguriert.
  status: 'pulled' | 'up-to-date' | 'conflict' | 'dirty' | 'no-upstream' | 'no-remote';
  // Konfliktdateien (nur bei status='conflict').
  conflictFiles: string[];
  // Zusammenfassung bei status='pulled' (sonst 0).
  filesChanged: number;
  insertions: number;
  deletions: number;
}

// Driver-internes Tracking-Info pro Branch (aus `git for-each-ref`). Nicht ueber
// die IPC-Grenze — der Handler baut daraus GitBranchInfo.
export interface GitBranchTrackInfo {
  name: string;
  upstream: string | null;
  ahead: number;
  behind: number;
}

// Driver-Outcome eines Pull-Versuchs (Pure-Outcome ohne Vorbedingungs-Checks).
export interface GitPullOutcome {
  status: 'pulled' | 'up-to-date' | 'conflict';
  conflictFiles: string[];
  filesChanged: number;
  insertions: number;
  deletions: number;
}
