import { simpleGit, type SimpleGit } from 'simple-git';
import type { GitFileChange, GitFileStatus, GitStatusResult } from '@shared/types';

// Driver-Wrapper für simple-git (Sprint 7, Architektur 6.7).
//
// Pattern wie @lydell/node-pty (PtyManager + realPtySpawn): die App spricht über
// ein schmales Interface mit Git, der Real-Driver kapselt simple-git, Tests fahren
// gegen einen Fake — kein realer git-Roundtrip, kein temporäres Repo nötig.
//
// API ist auf das Sprint-7-Set reduziert:
//   - status(repoPath): Branch + geänderte Files (für Pre-Commit-Panel)
//   - diff(repoPath, filePath?): Working-Tree-Diff als Patch-String (für Diff-Viewer)
//
// Pull/Fetch/Branch-Switch sind explizit ausgelassen (Architektur 6.7 + Briefing-
// Phase-2-Auslassung); ebenso eigener Commit (App schickt nur die Trigger-Phrase).

export interface GitDriver {
  // Liefert Branch + Status. Wirft, wenn der Pfad kein Git-Repo ist (Caller fängt
  // ab und liefert Result-Err mit klarem Code).
  status(repoPath: string): Promise<GitStatusResult>;
  // Working-Tree-Diff: ohne filePath alle geänderten Files, mit filePath nur diese
  // eine Datei. Liefert das rohe Unified-Diff-Format, wie git diff es ausgibt
  // (CodeMirror-Merge-Extension parst das im Renderer).
  diff(repoPath: string, filePath?: string): Promise<string>;
  // Liefert den Inhalt einer Datei am angegebenen Ref (Default 'HEAD'). Wird
  // vom Diff-Viewer (Phase 6) gebraucht, um die HEAD-Version gegen den Working-
  // Tree-Stand zu mergen via @codemirror/merge.unifiedMergeView. Bei nicht
  // existierenden Files (= neu im Working-Tree, nie committed) returnt der
  // Driver einen leeren String — damit zeigt der Diff-Viewer alle Zeilen
  // korrekt als Hinzufügung.
  showFile(repoPath: string, relPath: string, ref?: string): Promise<string>;
  // Phase-2 Season-29 (Multi-Tab-Diff): aufgeloesten Commit-SHA fuer einen Ref
  // liefern. PTY-Spawn nutzt das, um die Baseline der Session zu fixieren
  // (revParse(repoPath, 'HEAD')). Bei detached HEAD ohne Commits returnt der
  // Driver null — Session-Diff-Modus zeigt dann einen Empty-State.
  revParse(repoPath: string, ref: string): Promise<string | null>;
  // Phase-2 Season-29 (Multi-Tab-Diff): Index-Version einer Datei
  // (`git show :<relPath>`). Bei nicht gestagter Datei (also Working-Tree-
  // Aenderung ohne `git add`) liefert das den HEAD-Inhalt; bei gar nicht
  // versionierter Datei liefert simple-git einen Error — wir fangen ab und
  // returnen leeren String (Konsistenz mit showFile).
  showStagedFile(repoPath: string, relPath: string): Promise<string>;
  // Phase-2 Season-29 (Multi-Tab-Diff): Liste der Dateien, die sich seit dem
  // Baseline-Ref geaendert haben (Working-Tree + Index gesammelt, gegen
  // einen Commit-SHA verglichen). Result-Shape gleich GitFileChange wie bei
  // status(), damit der Renderer denselben File-Liste-Komponente nutzen kann.
  // Untracked-Files sind bewusst enthalten — sie sind „neu seit Session-Start".
  changedFilesAgainst(repoPath: string, baselineRef: string): Promise<GitFileChange[]>;
}

// Real-Driver: instanziiert simple-git pro Aufruf am gegebenen Pfad. Kein Caching
// nötig — simple-git ist leichtgewichtig (spawnt Git-Subprozesse, kein eigener
// Worker), und wir wollen explizit, dass ein Wechsel des aktiven Projekts auf
// den neuen Pfad zeigt, ohne dass ein gecachter Driver auf das alte Repo zeigt.
export const realGitDriver: GitDriver = {
  async status(repoPath: string): Promise<GitStatusResult> {
    const git = simpleGit(repoPath);
    // Sprint 9 — Status + Line-Counts in einem Roundtrip. `diffSummary()`
    // ruft `git diff --numstat` auf und liefert pro Datei die Insertions/
    // Deletions. Untracked Files erscheinen nicht im diff-Output — die
    // bekommen `null` als Counts.
    const [status, summary] = await Promise.all([
      git.status(),
      git.diffSummary().catch(() => ({ files: [] as Array<{ file: string; insertions?: number; deletions?: number; binary?: boolean }> })),
    ]);
    const countsByPath = new Map<string, { insertions: number | null; deletions: number | null }>();
    for (const f of summary.files) {
      // `summary.files` ist ein Union: TextFile (insertions/deletions) | BinaryFile
      // (binary=true, keine Counts) | NameStatusFile (rename/copy ohne numstat).
      // Type-Narrowing per `in`-Operator statt Cast, sonst stolpert TS über den Union.
      if ('binary' in f && f.binary) {
        // PNGs/PDFs etc. — numstat liefert `-`, wir markieren als unmessbar.
        countsByPath.set(f.file, { insertions: null, deletions: null });
      } else if ('insertions' in f && 'deletions' in f) {
        countsByPath.set(f.file, {
          insertions: f.insertions ?? 0,
          deletions: f.deletions ?? 0,
        });
      }
      // NameStatusFile-Pfad (selten — nur bei rename/copy ohne diff-Body)
      // bleibt ohne Eintrag → File bekommt unten `null`/`null` als Counts.
    }
    const files: GitFileChange[] = status.files.map((f) => {
      const counts = countsByPath.get(f.path);
      return {
        path: f.path,
        worktreeStatus: mapStatusCode(f.working_dir),
        indexStatus: mapStatusCode(f.index),
        insertions: counts?.insertions ?? null,
        deletions: counts?.deletions ?? null,
      };
    });
    // status.current ist null bei detached HEAD — dann fallen wir auf die kurze SHA zurück.
    let branch = status.current ?? '';
    if (!branch) {
      try {
        const head = await git.revparse(['--short', 'HEAD']);
        branch = head.trim() || '(detached)';
      } catch {
        branch = '(detached)';
      }
    }
    return {
      branch,
      files,
      ahead: status.ahead,
      behind: status.behind,
    };
  },

  async diff(repoPath: string, filePath?: string): Promise<string> {
    const git: SimpleGit = simpleGit(repoPath);
    // Working-Tree-Diff (ohne --staged) — Architektur 6.7 sagt explizit
    // „Working Tree Diff via simple-git"; staged kommt erst Phase 2.
    if (filePath !== undefined && filePath.length > 0) {
      return git.diff(['--', filePath]);
    }
    return git.diff();
  },

  async showFile(repoPath: string, relPath: string, ref = 'HEAD'): Promise<string> {
    const git: SimpleGit = simpleGit(repoPath);
    try {
      // git show <ref>:<path> liefert den Inhalt der Datei am gegebenen Ref.
      // Bei untracked / niemals-committed Files wirft Git einen Error („exists
      // on disk, but not in 'HEAD'") — wir fangen ab und liefern leeren String,
      // damit der Diff-Viewer alle Working-Tree-Zeilen als Hinzufügungen zeigt.
      return await git.show([`${ref}:${relPath}`]);
    } catch {
      return '';
    }
  },

  async revParse(repoPath: string, ref: string): Promise<string | null> {
    const git: SimpleGit = simpleGit(repoPath);
    try {
      const sha = await git.revparse([ref]);
      const trimmed = sha.trim();
      // Detached HEAD ohne jeden Commit liefert manchmal leere Strings statt zu
      // werfen — defensiv abfangen.
      return trimmed.length > 0 ? trimmed : null;
    } catch {
      // Frisches Repo ohne HEAD-Commit oder kein Git-Repo: kein Baseline-SHA
      // → null. Caller (pty:create) interpretiert das als „Session ohne
      // Diff-Baseline" und schreibt NULL in sessions.start_commit_sha.
      return null;
    }
  },

  async showStagedFile(repoPath: string, relPath: string): Promise<string> {
    const git: SimpleGit = simpleGit(repoPath);
    try {
      // `git show :<path>` liest den Blob aus der Staging-Area. Wenn die Datei
      // ungestaget ist, liefert Git den HEAD-Inhalt; nur bei gar nicht
      // versionierter Datei (neu + untracked) wirft Git.
      return await git.show([`:${relPath}`]);
    } catch {
      return '';
    }
  },

  async changedFilesAgainst(repoPath: string, baselineRef: string): Promise<GitFileChange[]> {
    const git: SimpleGit = simpleGit(repoPath);
    // 1. Tracked-Changes seit dem Baseline-Commit. `git diff --name-status`
    //    listet die Aenderungen, `--numstat` liefert die Insertions/Deletions.
    //    Beide gegen denselben Ref, damit das Mapping konsistent ist.
    const summary = await git
      .diffSummary([baselineRef])
      .catch(() => ({ files: [] as Array<{ file: string; insertions?: number; deletions?: number; binary?: boolean }> }));
    const counts = new Map<string, { insertions: number | null; deletions: number | null }>();
    for (const f of summary.files) {
      if ('binary' in f && f.binary) {
        counts.set(f.file, { insertions: null, deletions: null });
      } else if ('insertions' in f && 'deletions' in f) {
        counts.set(f.file, {
          insertions: f.insertions ?? 0,
          deletions: f.deletions ?? 0,
        });
      }
    }
    // `--name-status` liefert den Aenderungs-Code (M/A/D/R/C). Wir parsen den
    // Raw-Output, weil simple-git's `.diff(['--name-status'])` einen
    // unstrukturierten String zurueckgibt.
    const nameStatusRaw = await git
      .diff(['--name-status', baselineRef])
      .catch(() => '');
    const statusByPath = new Map<string, GitFileStatus>();
    for (const line of nameStatusRaw.split('\n')) {
      if (!line) continue;
      // Format pro Zeile: "<code>\t<path>" bzw. bei rename/copy
      // "<code><score>\t<oldPath>\t<newPath>".
      const parts = line.split('\t');
      if (parts.length < 2) continue;
      const code = (parts[0] ?? '').charAt(0); // R100 → R
      const finalPath = parts[parts.length - 1] ?? '';
      if (!finalPath) continue;
      statusByPath.set(finalPath, mapStatusCode(code));
    }

    // 2. Untracked-Files vom aktuellen Working-Tree dazumischen — sie sind
    //    „neu seit Session-Start", auch wenn sie weder im Baseline-Commit
    //    noch im HEAD enthalten waren. `git status --porcelain` liefert sie
    //    als ?? .
    let untracked: string[] = [];
    try {
      const status = await git.status();
      untracked = status.not_added; // simple-git: not_added = untracked
    } catch {
      // Status-Fehler ist nicht kritisch — die diff-basierte Liste reicht
      // schon fuer den Session-Modus.
    }

    const out: GitFileChange[] = [];
    for (const [path, status] of statusByPath) {
      const c = counts.get(path);
      out.push({
        path,
        worktreeStatus: status,
        indexStatus: 'unchanged',
        insertions: c?.insertions ?? null,
        deletions: c?.deletions ?? null,
      });
    }
    for (const path of untracked) {
      // Defensiv: untracked-Datei koennte schon ueber den diff-Pfad
      // gelistet sein (sollte nicht passieren, weil untracked weder im
      // Baseline noch im HEAD lebt), aber Doppelung vermeiden.
      if (statusByPath.has(path)) continue;
      out.push({
        path,
        worktreeStatus: 'untracked',
        indexStatus: 'unchanged',
        insertions: null,
        deletions: null,
      });
    }
    // Stabile Reihenfolge fuer die UI: alphabetisch nach Pfad.
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  },
};

// Mapping von simple-git's Single-Char-Status auf unser semantisches Vokabular.
// Codes laut Git-Manual: M=modified, A=added, D=deleted, R=renamed, C=copied,
// U=unmerged, ?=untracked. Whitespace/leerer Code = unverändert in dieser Schicht.
function mapStatusCode(code: string): GitFileStatus {
  switch (code) {
    case 'M':
      return 'modified';
    case 'A':
      return 'added';
    case 'D':
      return 'deleted';
    case 'R':
      return 'renamed';
    case 'C':
      return 'copied';
    case 'U':
      return 'unmerged';
    case '?':
      return 'untracked';
    default:
      return 'unchanged';
  }
}
