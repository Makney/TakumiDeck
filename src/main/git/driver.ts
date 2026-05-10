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
}

// Real-Driver: instanziiert simple-git pro Aufruf am gegebenen Pfad. Kein Caching
// nötig — simple-git ist leichtgewichtig (spawnt Git-Subprozesse, kein eigener
// Worker), und wir wollen explizit, dass ein Wechsel des aktiven Projekts auf
// den neuen Pfad zeigt, ohne dass ein gecachter Driver auf das alte Repo zeigt.
export const realGitDriver: GitDriver = {
  async status(repoPath: string): Promise<GitStatusResult> {
    const git = simpleGit(repoPath);
    const status = await git.status();
    // simple-git's StatusResult.files hat working_dir + index als Single-Char-Codes.
    // Wir mappen sie auf unser semantisches Set, damit der Renderer keinen
    // Git-Code-Knowhow braucht.
    const files: GitFileChange[] = status.files.map((f) => ({
      path: f.path,
      worktreeStatus: mapStatusCode(f.working_dir),
      indexStatus: mapStatusCode(f.index),
    }));
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
