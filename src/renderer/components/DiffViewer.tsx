import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, drawSelection } from '@codemirror/view';
import { syntaxHighlighting, defaultHighlightStyle, indentOnInput } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { yaml as yamlLang } from '@codemirror/lang-yaml';
import { unifiedMergeView } from '@codemirror/merge';
import { oneDark, oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import { markdownEditorThemeOverride } from './markdownEditorTheme';
import type { GitFileChange, GitSessionDiffResult, GitStatusResult } from '@shared/types';

// DiffViewer (Sprint 7 — Phase 6; Season 29 Multi-Tab-Diff).
//
// Drei Modi via Pillen-Toggle in der td-diff-head-Zeile:
//   - 'working'  HEAD vs. Working-Tree (= Phase-1-Pfad)
//   - 'staged'   HEAD vs. Index (`git show :path` als doc, HEAD als original)
//   - 'session'  Session-Baseline-Commit vs. Working-Tree
//
// File-Liste:
//   - working: gefiltert aus git:status auf worktreeStatus !== 'unchanged'
//   - staged:  gefiltert aus git:status auf indexStatus  !== 'unchanged'
//   - session: dedizierter Fetch via git:session-diff (nur einmal pro Mount /
//     refreshKey-Tick / Sessions-Wechsel)
//
// Per-File-Pane (rechts):
//   - working: original = git.show(HEAD), doc = fs.read
//   - staged:  original = git.show(HEAD), doc = git.showStaged
//   - session: original = git.show(baselineSha), doc = fs.read
//
// Auto-Open-Pairing (Season 29): Klick auf einen File-Eintrag oeffnet die
// Datei ZUSAETZLICH als Editor-Tab. Der Diff bleibt aktiv und zeigt den Diff
// derselben Datei.
//
// Auto-Refresh (Season 29): der EditorPane hebt den `refreshKey` an, wenn
// chokidar eine Datei-Aenderung im Projekt-Root meldet. Wir nutzen das, um
// den session-Mode-Fetch und die Per-File-Inhalte neu zu laden.

export type DiffMode = 'working' | 'staged' | 'session';

interface Props {
  projectId: string;
  status: GitStatusResult | null;
  loading: boolean;
  loadError: string | null;
  hasGit: boolean;
  // Phase-2 Season-29: aktive Session fuer den Session-Modus. null deaktiviert
  // den Modus (Pille bleibt klickbar, zeigt aber den passenden Empty-State).
  activeSessionId: string | null;
  // Phase-2 Season-29: hebt sich pro Datei-Aenderung im Projekt-Root, damit
  // der DiffViewer seinen Fetch-Pfad neu spielt. Pure-Counter — Identitaets-
  // vergleich reicht.
  refreshKey: number;
  // Phase-2 Season-29: Auto-Open-Pairing. Klick auf eine Datei in der Diff-
  // Liste fokussiert den Editor-Tab — wenn er noch nicht offen ist, oeffnet
  // ihn EditorPane via useFileTabsStore.openFile.
  onOpenInEditor: (relPath: string, label: string) => void;
}

export function DiffViewer({
  projectId,
  status,
  loading,
  loadError,
  hasGit,
  activeSessionId,
  refreshKey,
  onOpenInEditor,
}: Props) {
  const [mode, setMode] = useState<DiffMode>('working');
  const [activeFile, setActiveFile] = useState<string | null>(null);

  // Working/Staged ziehen ihre File-Liste aus dem bereits geladenen status.
  // Session laeuft ueber einen eigenen Fetch.
  const [sessionDiff, setSessionDiff] = useState<GitSessionDiffResult | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  // Race-Schutz fuer den session-Fetch — User kann zwischen Modi zappen, nur
  // die juengste Antwort gewinnt.
  const sessionSeq = useRef(0);
  useEffect(() => {
    if (mode !== 'session') return;
    if (!activeSessionId) {
      setSessionDiff(null);
      setSessionError(null);
      setSessionLoading(false);
      return;
    }
    const mySeq = ++sessionSeq.current;
    setSessionLoading(true);
    setSessionError(null);
    void window.api.git.sessionDiff({ sessionId: activeSessionId }).then((result) => {
      if (sessionSeq.current !== mySeq) return;
      setSessionLoading(false);
      if (result.ok) {
        setSessionDiff(result.data);
      } else {
        setSessionDiff(null);
        setSessionError(result.error);
      }
    });
    // refreshKey ist absichtlich in der Dep-Liste, damit ein fs:changed-Push
    // den Session-Fetch ebenfalls anstoesst.
  }, [mode, activeSessionId, refreshKey]);

  // File-Liste je nach Modus. Memoisiert, damit der useEffect unten nicht
  // pro Render einen neuen activeFile-Default zieht.
  const showableFiles = useMemo<GitFileChange[]>(() => {
    if (mode === 'working') {
      return status?.files.filter((f) => f.worktreeStatus !== 'unchanged') ?? [];
    }
    if (mode === 'staged') {
      return status?.files.filter((f) => f.indexStatus !== 'unchanged') ?? [];
    }
    return sessionDiff?.files ?? [];
  }, [mode, status, sessionDiff]);

  // Bei Modi-/Status-Wechsel die aktive Datei initialisieren — wenn die alte
  // Auswahl in der neuen Liste vorkommt, behalten; sonst auf erste springen.
  useEffect(() => {
    if (showableFiles.length === 0) {
      setActiveFile(null);
      return;
    }
    if (activeFile && showableFiles.some((f) => f.path === activeFile)) return;
    setActiveFile(showableFiles[0]?.path ?? null);
  }, [showableFiles, activeFile]);

  // Branch-Anzeige je nach Modus.
  const branchLabel = useMemo(() => {
    if (mode === 'session') {
      return sessionDiff?.branch ?? '';
    }
    return status?.branch ?? '';
  }, [mode, status, sessionDiff]);

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

  // Empty-State fuer Session-Modus ohne Baseline.
  const sessionEmpty =
    mode === 'session' && (!activeSessionId || sessionDiff?.hasBaseline === false);

  const isLoadingForMode =
    (mode !== 'session' && loading) || (mode === 'session' && sessionLoading);
  const errorForMode = mode === 'session' ? sessionError : loadError;

  return (
    <div className="td-diff">
      <div className="td-diff-head">
        <span className="crumb">
          <b>{branchLabel || '—'}</b>
        </span>
        <span className="arr">›</span>
        <span className="crumb">{showableFiles.length} Files</span>
        <DiffModeToggle
          mode={mode}
          onSelect={setMode}
          hasActiveSession={activeSessionId !== null}
        />
        <div className="meta">
          {!isLoadingForMode && (
            <>
              <span
                className="add"
                title="neue / hinzugefuegte Datei(en)"
              >+{countByStatus(showableFiles, ['added', 'untracked'])}</span>
              <span
                className="modify"
                title="geaenderte Datei(en)"
              >~{countByStatus(showableFiles, ['modified'])}</span>
              <span
                className="rem"
                title="geloeschte Datei(en)"
              >−{countByStatus(showableFiles, ['deleted'])}</span>
            </>
          )}
          <span className="source-hint">{sourceHintFor(mode)}</span>
        </div>
      </div>
      {isLoadingForMode ? (
        <div className="td-skeleton">Lade Diff…</div>
      ) : errorForMode ? (
        <div className="td-md-error">git-Aufruf fehlgeschlagen: {errorForMode}</div>
      ) : sessionEmpty ? (
        <div className="td-skeleton">
          {!activeSessionId
            ? 'Keine aktive Session — Session-Diff zeigt Aenderungen seit dem Spawn der aktiven Session.'
            : 'Diese Session hat keinen Baseline-Commit (Legacy-Session, kein Git-Repo zum Spawn-Zeitpunkt oder revParse-Fehler).'}
        </div>
      ) : showableFiles.length === 0 ? (
        <div className="td-skeleton">{emptyMessageFor(mode)}</div>
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
                  onClick={() => {
                    setActiveFile(f.path);
                    // Auto-Open-Pairing: Datei auch im Editor-Tab oeffnen.
                    onOpenInEditor(f.path, name);
                  }}
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
              <DiffPaneSingleFile
                projectId={projectId}
                relPath={activeFile}
                mode={mode}
                baselineSha={sessionDiff?.baselineSha ?? null}
                refreshKey={refreshKey}
              />
            ) : (
              <div className="td-skeleton">Keine Datei ausgewählt.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================ Pillen-Toggle

interface DiffModeToggleProps {
  mode: DiffMode;
  onSelect: (m: DiffMode) => void;
  hasActiveSession: boolean;
}

function DiffModeToggle({ mode, onSelect, hasActiveSession }: DiffModeToggleProps) {
  return (
    <div className="td-diff-modes" role="tablist" aria-label="Diff-Modus">
      <ModePill mode="working" active={mode === 'working'} onSelect={onSelect} label="Working Tree" />
      <ModePill mode="staged" active={mode === 'staged'} onSelect={onSelect} label="Staged" />
      <ModePill
        mode="session"
        active={mode === 'session'}
        onSelect={onSelect}
        label="Session"
        title={
          hasActiveSession
            ? 'Aenderungen seit dem Start der aktiven Session'
            : 'Aenderungen seit Session-Start — aktiv erst, wenn eine Session laeuft'
        }
      />
    </div>
  );
}

interface ModePillProps {
  mode: DiffMode;
  active: boolean;
  onSelect: (m: DiffMode) => void;
  label: string;
  title?: string;
}

function ModePill({ mode, active, onSelect, label, title }: ModePillProps) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`td-diff-mode-pill${active ? ' active' : ''}`}
      onClick={() => onSelect(mode)}
      title={title ?? label}
    >
      {label}
    </button>
  );
}

// ============================================================ Per-File-Pane

interface DiffPaneProps {
  projectId: string;
  relPath: string;
  mode: DiffMode;
  // Nur fuer mode='session' relevant; null in den anderen Modi.
  baselineSha: string | null;
  refreshKey: number;
}

function DiffPaneSingleFile({
  projectId,
  relPath,
  mode,
  baselineSha,
  refreshKey,
}: DiffPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [original, setOriginal] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  // Beide Inhalte laden (parallel). Race-Schutz über Sequence-Zähler — wenn
  // der User schnell zwischen Files/Modi zappt, gewinnt nur die jüngste
  // Antwort.
  useEffect(() => {
    const mySeq = ++seq.current;
    setOriginal(null);
    setWorking(null);
    setError(null);

    const originalPromise = (() => {
      if (mode === 'session' && baselineSha) {
        // Original am Baseline-Commit. Wenn die Datei zum Baseline-Zeitpunkt
        // noch nicht existierte (= komplett neu in der Session), liefert der
        // Driver einen leeren String, was den Diff-Viewer alle Zeilen als
        // Hinzufuegung markieren laesst.
        return window.api.git.show({ projectId, relPath, ref: baselineSha });
      }
      // working + staged vergleichen beide gegen HEAD.
      return window.api.git.show({ projectId, relPath });
    })();
    const docPromise = (() => {
      if (mode === 'staged') {
        return window.api.git.showStaged({ projectId, relPath });
      }
      // working + session zeigen den Working-Tree-Inhalt als doc.
      return window.api.fs.read({ projectId, relPath });
    })();

    void Promise.all([originalPromise, docPromise]).then(([origRes, docRes]) => {
      if (seq.current !== mySeq) return;
      if (origRes.ok) {
        setOriginal(origRes.data.content);
      } else {
        // Der Treiber (git/driver.ts showFile) faengt den „existiert auf Platte,
        // aber nicht im ref"-Fall echter neuer Dateien bereits intern ab und
        // liefert dafuer ok:'' — dieser Else-Zweig wird also nur bei echten
        // Infrastruktur-Fehlern (Projekt nicht aufloesbar, IPC-Validierung)
        // erreicht. Symmetrisch zum doc-Pfad als Fehler zeigen, statt still
        // alle Working-Tree-Zeilen als Hinzufuegung darzustellen.
        setError(origRes.error);
      }
      if (docRes.ok) {
        setWorking(docRes.data.content);
      } else {
        setWorking('');
        setError(docRes.error);
      }
    });
  }, [projectId, relPath, mode, baselineSha, refreshKey]);

  // CodeMirror-View aufbauen, sobald beide Inhalte da sind. Bei Pfad-/Modus-
  // Wechsel oder Auto-Refresh re-mounten wir komplett — unifiedMergeView
  // rebuildet seine Decorations intern, und das ist sicherer als ein
  // dispatch.reconfigure-Pfad.
  useEffect(() => {
    if (original === null || working === null) return;
    if (!containerRef.current) return;
    const langExt =
      relPath.toLowerCase().endsWith('.yaml') || relPath.toLowerCase().endsWith('.yml')
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
        unifiedMergeView({ original }),
        markdownEditorThemeOverride,
      ],
    });
    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [original, working, relPath]);

  if (error !== null) {
    return <div className="td-md-error">Datei lesen fehlgeschlagen: {error}</div>;
  }
  if (original === null || working === null) {
    return <div className="td-skeleton">Lade {relPath}…</div>;
  }
  return <div ref={containerRef} className="td-diff-cm" />;
}

// ============================================================ helpers

function countByStatus(files: GitFileChange[], wanted: GitFileChange['worktreeStatus'][]): number {
  let n = 0;
  for (const f of files) {
    if (wanted.includes(f.worktreeStatus)) n++;
  }
  return n;
}

function sourceHintFor(mode: DiffMode): string {
  switch (mode) {
    case 'working':
      return 'HEAD ↔ working tree';
    case 'staged':
      return 'HEAD ↔ index';
    case 'session':
      return 'baseline ↔ working tree';
  }
}

function emptyMessageFor(mode: DiffMode): string {
  switch (mode) {
    case 'working':
      return 'Working-Tree ist sauber — keine ungestagten Aenderungen.';
    case 'staged':
      return 'Index ist leer — keine gestagten Aenderungen (`git add`).';
    case 'session':
      return 'Keine Aenderungen seit Session-Start.';
  }
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
