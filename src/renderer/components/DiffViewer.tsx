import { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, drawSelection } from '@codemirror/view';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { yaml as yamlLang } from '@codemirror/lang-yaml';
import { unifiedMergeView } from '@codemirror/merge';
import { oneDark, oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { markdownEditorThemeOverride } from './markdownEditorTheme';
import type { GitFileChange, GitStatusResult } from '@shared/types';

// DiffViewer (Sprint 7, Phase 6).
//
// Architektur 6.7: „Working Tree Diff via simple-git, Render mit @codemirror/merge".
//
// UI-Aufbau:
//   1. Branch + Counts (td-diff-head wie im Design-Handoff)
//   2. Liste der geänderten Files links (klickbar, einer aktiv)
//   3. unifiedMergeView rechts: HEAD-Version vs. Working-Tree-Inhalt
//
// Datenpfad pro Aktiv-File:
//   - git:show liefert die HEAD-Version (oder leer bei untracked → alle Zeilen
//     erscheinen als Hinzufügung)
//   - fs:read liefert den aktuellen Working-Tree-Inhalt
//   - unifiedMergeView({ original: HEAD }) + doc=working berechnet die Diffs
//     intern und markiert sie inline.
//
// Read-only: keine Inline-Edit-Buttons, keine accept/reject-UX. „accept hunk"
// in unifiedMergeView ist out-of-scope (Phase 2+).

interface Props {
  projectId: string;
  status: GitStatusResult | null;
  loading: boolean;
  loadError: string | null;
  hasGit: boolean;
}

export function DiffViewer({ projectId, status, loading, loadError, hasGit }: Props) {
  const [activeFile, setActiveFile] = useState<string | null>(null);

  // Beim Status-Update die aktive Datei initialisieren — erste geänderte File
  // bevorzugt. Wenn der User eine andere Datei manuell ausgewählt hat und sie
  // weiter geändert ist, behalten wir die Auswahl.
  useEffect(() => {
    if (!status) return;
    const candidates = status.files.filter(isShowableInDiff);
    if (candidates.length === 0) {
      setActiveFile(null);
      return;
    }
    if (activeFile && candidates.some((f) => f.path === activeFile)) return;
    setActiveFile(candidates[0]!.path);
  }, [status, activeFile]);

  if (!hasGit) {
    return (
      <div className="td-diff">
        <div className="td-diff-head">
          <span className="crumb">— · kein Git-Repository</span>
        </div>
        <div className="td-skeleton">
          Dieses Projekt hat kein .git/-Verzeichnis. Diff-Viewer ist deaktiviert.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="td-diff">
        <div className="td-skeleton">Lade Diff…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="td-diff">
        <div className="td-md-error">git status fehlgeschlagen: {loadError}</div>
      </div>
    );
  }

  if (!status) return null;

  const showableFiles = status.files.filter(isShowableInDiff);
  const adds = showableFiles.filter(
    (f) => f.worktreeStatus === 'added' || f.worktreeStatus === 'untracked',
  ).length;
  const rems = showableFiles.filter((f) => f.worktreeStatus === 'deleted').length;
  const mods = showableFiles.filter((f) => f.worktreeStatus === 'modified').length;

  return (
    <div className="td-diff">
      <div className="td-diff-head">
        <span className="crumb">
          <b>{status.branch}</b>
        </span>
        <span className="arr">›</span>
        <span className="crumb">{showableFiles.length} Files</span>
        <div className="meta">
          <span className="add" title={`${adds} neue Datei(en)`}>+{adds}</span>
          <span className="modify" title={`${mods} geänderte Datei(en)`}>~{mods}</span>
          <span className="rem" title={`${rems} gelöschte Datei(en)`}>−{rems}</span>
          <span className="source-hint">simple-git · merge</span>
        </div>
      </div>
      {showableFiles.length === 0 ? (
        <div className="td-skeleton">
          Working-Tree ist sauber — keine geänderten Dateien.
        </div>
      ) : (
        <div className="td-diff-body-split">
          <div className="td-diff-files">
            {showableFiles.map((f) => {
              const lastSlash = Math.max(f.path.lastIndexOf('/'), f.path.lastIndexOf('\\'));
              const dir = lastSlash >= 0 ? f.path.slice(0, lastSlash + 1) : '';
              const name = lastSlash >= 0 ? f.path.slice(lastSlash + 1) : f.path;
              const showCounts = f.insertions !== null || f.deletions !== null;
              return (
                <div
                  key={f.path}
                  className={`td-diff-file${activeFile === f.path ? ' active' : ''} ${f.worktreeStatus}`}
                  onClick={() => setActiveFile(f.path)}
                  title={f.path}
                >
                  <span className="td-diff-file-mark">
                    {markFor(f.worktreeStatus, f.indexStatus)}
                  </span>
                  <span className="td-diff-file-path">
                    {dir && <span className="td-diff-file-dir">{dir}</span>}
                    <span className="td-diff-file-name">{name}</span>
                  </span>
                  {showCounts && (
                    <span className="td-diff-file-counts">
                      {f.insertions !== null && f.insertions > 0 && (
                        <span className="td-diff-file-add">+{f.insertions}</span>
                      )}
                      {f.deletions !== null && f.deletions > 0 && (
                        <span className="td-diff-file-rem">−{f.deletions}</span>
                      )}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <div className="td-diff-content">
            {activeFile ? (
              <DiffPaneSingleFile projectId={projectId} relPath={activeFile} />
            ) : (
              <div className="td-skeleton">Keine Datei ausgewählt.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================ Per-File-Pane

interface DiffPaneProps {
  projectId: string;
  relPath: string;
}

function DiffPaneSingleFile({ projectId, relPath }: DiffPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [head, setHead] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  // Beide Inhalte laden (parallel). Race-Schutz über Sequence-Zähler — wenn
  // der User schnell zwischen Files zappt, gewinnt nur die jüngste Antwort.
  useEffect(() => {
    const mySeq = ++seq.current;
    setHead(null);
    setWorking(null);
    setError(null);
    void Promise.all([
      window.api.git.show({ projectId, relPath }),
      window.api.fs.read({ projectId, relPath }),
    ]).then(([showRes, readRes]) => {
      if (seq.current !== mySeq) return;
      if (showRes.ok) {
        setHead(showRes.data.content);
      } else {
        // Untracked Files liefert der Driver als ok+empty — ein Err hier ist
        // immer ein echter Git-Fehler (GIT_SHOW_FAILED / PROJECT_NOT_FOUND).
        // Wir behandeln ihn als leeren HEAD, damit der Diff trotzdem rendert,
        // loggen aber für Diagnose.
        setHead('');
        console.warn(`[DiffViewer] git:show fehlgeschlagen für ${relPath}: ${showRes.error}`);
      }
      if (readRes.ok) {
        setWorking(readRes.data.content);
      } else {
        setWorking('');
        setError(readRes.error);
      }
    });
  }, [projectId, relPath]);

  // CodeMirror-View aufbauen, sobald beide Inhalte da sind. Bei Pfad-Wechsel
  // re-mounten wir komplett — unifiedMergeView rebuildet seine Decorations
  // intern, und das ist sicherer als ein dispatch.reconfigure-Pfad.
  useEffect(() => {
    if (head === null || working === null) return;
    if (!containerRef.current) return;
    const langExt = relPath.toLowerCase().endsWith('.yaml') || relPath.toLowerCase().endsWith('.yml')
      ? yamlLang()
      : markdown();
    const state = EditorState.create({
      doc: working,
      extensions: [
        EditorView.editable.of(false),
        EditorState.readOnly.of(true),
        lineNumbers(),
        drawSelection(),
        indentOnInput(),
        langExt,
        oneDark,
        syntaxHighlighting(oneDarkHighlightStyle),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        unifiedMergeView({ original: head }),
        markdownEditorThemeOverride,
      ],
    });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [head, working, relPath]);

  if (error !== null) {
    return <div className="td-md-error">Datei lesen fehlgeschlagen: {error}</div>;
  }
  if (head === null || working === null) {
    return <div className="td-skeleton">Lade {relPath}…</div>;
  }
  return <div ref={containerRef} className="td-diff-cm" />;
}

// ============================================================ helpers

// File ist im Diff sichtbar, wenn es eine relevante Worktree- oder Index-
// Veränderung hat. unmodified Files gibt git status zwar nicht zurück, aber
// die Defensivkraft hier kostet nichts.
function isShowableInDiff(f: GitFileChange): boolean {
  return (
    f.worktreeStatus !== 'unchanged' || f.indexStatus !== 'unchanged'
  );
}

// Single-Char-Marker für die File-Liste — kompakte Darstellung statt langer
// Status-Wörter. Konvention wie git status --porcelain.
function markFor(worktree: GitFileChange['worktreeStatus'], index: GitFileChange['indexStatus']): string {
  if (worktree === 'untracked') return '?';
  if (worktree === 'modified') return 'M';
  if (worktree === 'added') return 'A';
  if (worktree === 'deleted') return 'D';
  if (worktree === 'renamed') return 'R';
  if (index === 'modified') return 'm';
  if (index === 'added') return 'a';
  return '·';
}
