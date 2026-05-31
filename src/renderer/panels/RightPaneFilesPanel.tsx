import { useEffect, useMemo, useState, useRef } from 'react';
import type { FsTreeNode, GitFileStatus } from '@shared/types';
import { useGitStatusStore } from '../stores/gitStatus';
import { filterTree } from '../components/treeFilter';
import { pickFileMarker, type FileMarker } from '../components/fileMarker';
import {
  loadFileBrowserPrefs,
  saveFileBrowserPrefs,
  TOGGLEABLE_EXTENSIONS,
} from '../components/fileBrowserPrefs';

// Datei-Browser-Sektion im Right-Pane (Sprint 7, Phase 5).
//
// - Hierarchische Anzeige des aktiven Projekts (fs:list-tree, Driver-injected im Main).
// - Filter-Suchfeld + Phase-2 Season-29.5 Endungs-Toggle-Pillen.
// - Persistenz der Filter-Wahl in localStorage (td.fileBrowserFilter) — UI-State,
//   nicht Settings; folgt der Konvention `td.heatmapWeeks` / `td.statsRange`.
// - File-Marker pro Datei: Editor-Dirty (`M`) hat Vorrang vor Git-Status
//   (M/A/D/R/?), Phase-2 Season-29.5; reine Phase-1-Quelle war nur Dirty.
// - Klick auf File → onOpenFile(relPath, label). Klick auf Dir → expand/collapse.
//
// Lade-Trigger: bei jedem projectId-Wechsel re-fetch via fs:list-tree und
// git:status. Beide sind read-only IPCs → kein useRef-Guard nötig (Memory:
// Guard nur für Server-Mutationen). fs:changed-Push bumpt einen refreshKey
// und stoesst den git:status-Re-Fetch an; der Tree selbst wird nur beim
// Projekt-Wechsel neu geladen (chokidar-Push bringt nur Datei-Aenderungen,
// keine Strukturaenderungen — und ein neuer/geloeschter File macht keinen
// Tree-Refresh im Phase-1-Verhalten; das bleibt so).

interface Props {
  projectId: string | null;
  // Set der relPaths, deren Datei-Tab gerade dirty ist — für die M-Pille.
  dirtyRelPaths: Set<string>;
  // Sprint 9 (C3) — relPath des aktiven File-Tabs für die selected-Markierung;
  // null, wenn Diff-Tab aktiv ist oder kein File-Tab offen ist.
  selectedRelPath: string | null;
  onOpenFile: (relPath: string, label: string) => void;
}

export function RightPaneFilesPanel({ projectId, dirtyRelPaths, selectedRelPath, onOpenFile }: Props) {
  const [tree, setTree] = useState<FsTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Phase-2 Season-29.5: Filter-Prefs aus localStorage seeden. Default
  // `.md`-Query (Phase-1, Q2-B) bleibt, plus leere Endungs-Auswahl.
  const initialPrefs = useMemo(() => loadFileBrowserPrefs(), []);
  const [filter, setFilter] = useState(initialPrefs.query);
  const [activeExtensions, setActiveExtensions] = useState<Set<string>>(
    () => new Set(initialPrefs.extensions),
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['docs']));

  // Persist filter + extensions in localStorage. Wir serialisieren synchron;
  // localStorage ist klein und im Renderer-Hot-Path billig.
  useEffect(() => {
    saveFileBrowserPrefs({
      query: filter,
      extensions: Array.from(activeExtensions),
    });
  }, [filter, activeExtensions]);

  // Per-Project-Reload des Trees. Wenn der User schnell zwischen Projekten
  // wechselt, gewinnt immer die juengste Antwort — wir tracken das per
  // Ref-Sequence.
  const seq = useRef(0);
  useEffect(() => {
    if (!projectId) {
      setTree([]);
      setLoading(false);
      setLoadError(null);
      return;
    }
    const mySeq = ++seq.current;
    setLoading(true);
    setLoadError(null);
    void window.api.fs.listTree({ projectId }).then((result) => {
      if (seq.current !== mySeq) return;
      setLoading(false);
      if (result.ok) {
        setTree(result.data);
      } else {
        setTree([]);
        setLoadError(result.error);
      }
    });
  }, [projectId]);

  // Phase-2 Season-29.5: Git-Status pro File als Map<relPath, GitFileStatus>.
  //
  // Bereich-PANELS-Review 2.2: kommt jetzt aus dem gemeinsamen useGitStatusStore
  // (zentral geladen + bei fs:changed re-fetcht via App → useGitStatusSync).
  // Vorher fetchte dieses Panel unabhaengig von EditorPane denselben git:status
  // und abonnierte fs:changed separat — pro Datei-Event also zwei parallele
  // git-Aufrufe fuers selbe Projekt. Jetzt lesen wir nur noch reaktiv und
  // leiten die Marker-Map daraus ab. NOT_A_GIT_REPO → status=null → leere Map.
  const gitStatus = useGitStatusStore((s) =>
    projectId ? s.byProject[projectId]?.status ?? null : null,
  );
  const gitStatusMap = useMemo<ReadonlyMap<string, GitFileStatus>>(() => {
    if (!gitStatus) return EMPTY_GIT_MAP;
    const next = new Map<string, GitFileStatus>();
    for (const file of gitStatus.files) {
      // Worktree-Status hat Vorrang vor Index-Status: was im Working-Tree
      // sichtbar ist, ist auch im File-Browser sichtbar. Nur wenn Worktree
      // = unchanged (also vollstaendig gestaged), fallen wir auf den
      // Index-Status zurueck — sonst sieht ein voll-gestagter neuer File
      // gar keinen Marker.
      const status = file.worktreeStatus !== 'unchanged' ? file.worktreeStatus : file.indexStatus;
      if (status !== 'unchanged') next.set(file.path, status);
    }
    return next;
  }, [gitStatus]);

  const filtered = useMemo(
    () => filterTree(tree, filter, activeExtensions),
    [tree, filter, activeExtensions],
  );

  // Wenn ein Filter aktiv ist (Text ODER Endungen), soll der Tree komplett
  // aufgeklappt sein, sonst sieht der User nicht, was matched.
  const expandAll = filter.trim() !== '' || activeExtensions.size > 0;

  const toggleExtension = (ext: string): void => {
    setActiveExtensions((prev) => {
      const next = new Set(prev);
      if (next.has(ext)) next.delete(ext);
      else next.add(ext);
      return next;
    });
  };

  return (
    <div className="td-panel td-files">
      {/* Sprint 9 — Header-Stil an die linke Sidebar angeglichen:
          `td-panel-head` mit `td-panel-title` (22 px Display) statt der
          kleinen Caption-Variante. Macht den Right-Stack visuell konsistent
          mit der Sidebar. */}
      <div className="td-panel-head">
        <div className="td-panel-title">Dateien</div>
      </div>
      <div className="td-files-head">
        <div className="td-files-search">
          <span aria-hidden>⌕</span>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            /* Sprint 9 (C6) — Placeholder mit Phase-2-Hinweis nach Vorlage
               (components.jsx 254). Inhaltssuche selbst landet in Phase 2 —
               der Hinweis macht den künftigen Pfad sichtbar. */
            placeholder="Dateien filtern… (?Text zur Inhaltssuche, Phase 2)"
            spellCheck={false}
          />
          {filter !== '' && (
            <button
              type="button"
              className="td-files-clear"
              onClick={() => setFilter('')}
              title="Filter leeren"
            >
              ×
            </button>
          )}
        </div>
        {/* Phase-2 Season-29.5: Endungs-Toggle-Pillen. Multi-Select als OR,
            kombiniert mit dem Suchfeld als AND. */}
        <div className="td-files-pills" role="group" aria-label="Dateityp-Filter">
          {TOGGLEABLE_EXTENSIONS.map((ext) => {
            const active = activeExtensions.has(ext);
            return (
              <button
                key={ext}
                type="button"
                className={`td-files-pill${active ? ' active' : ''}`}
                onClick={() => toggleExtension(ext)}
                aria-pressed={active}
                title={active ? `Filter "${ext}" entfernen` : `Nur ${ext}-Dateien zeigen`}
              >
                {ext}
              </button>
            );
          })}
          {activeExtensions.size > 0 && (
            <button
              type="button"
              className="td-files-pill td-files-pill-clear"
              onClick={() => setActiveExtensions(new Set())}
              title="Alle Endungs-Filter entfernen"
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div className="td-files-list">
        {!projectId && (
          <div className="td-skeleton">
            Wähle links ein Projekt, um Dateien zu sehen.
          </div>
        )}
        {projectId && loading && <div className="td-skeleton">Lade Dateien…</div>}
        {projectId && loadError && (
          <div className="td-md-error">Datei-Liste fehlgeschlagen: {loadError}</div>
        )}
        {projectId && !loading && !loadError && filtered.length === 0 && (
          <div className="td-skeleton">
            {filter === '' && activeExtensions.size === 0
              ? 'Keine Dateien gefunden.'
              : 'Keine Treffer für die aktuellen Filter.'}
          </div>
        )}
        {projectId && filtered.map((node) => (
          <TreeNode
            key={node.relPath}
            node={node}
            depth={0}
            expanded={expanded}
            expandAll={expandAll}
            dirtyRelPaths={dirtyRelPaths}
            gitStatusMap={gitStatusMap}
            selectedRelPath={selectedRelPath}
            onToggle={(p) => {
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(p)) next.delete(p);
                else next.add(p);
                return next;
              });
            }}
            onOpenFile={onOpenFile}
          />
        ))}
      </div>
    </div>
  );
}

const EMPTY_GIT_MAP: ReadonlyMap<string, GitFileStatus> = new Map();

// ============================================================ TreeNode

interface TreeNodeProps {
  node: FsTreeNode;
  depth: number;
  expanded: Set<string>;
  expandAll: boolean;
  dirtyRelPaths: Set<string>;
  gitStatusMap: ReadonlyMap<string, GitFileStatus>;
  selectedRelPath: string | null;
  onToggle: (relPath: string) => void;
  onOpenFile: (relPath: string, label: string) => void;
}

function TreeNode({
  node,
  depth,
  expanded,
  expandAll,
  dirtyRelPaths,
  gitStatusMap,
  selectedRelPath,
  onToggle,
  onOpenFile,
}: TreeNodeProps) {
  const isExpanded = expandAll || expanded.has(node.relPath);
  const indent = { paddingLeft: 6 + depth * 12 };
  if (node.kind === 'dir') {
    return (
      <>
        <div
          className="td-file dir"
          style={indent}
          onClick={() => onToggle(node.relPath)}
        >
          <span className="gl">{isExpanded ? '▾' : '▸'}</span>
          <span>{node.name}</span>
        </div>
        {isExpanded &&
          node.children?.map((child) => (
            <TreeNode
              key={child.relPath}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              expandAll={expandAll}
              dirtyRelPaths={dirtyRelPaths}
              gitStatusMap={gitStatusMap}
              selectedRelPath={selectedRelPath}
              onToggle={onToggle}
              onOpenFile={onOpenFile}
            />
          ))}
      </>
    );
  }
  // File
  const isDirty = dirtyRelPaths.has(node.relPath);
  const isSelected = selectedRelPath === node.relPath;
  const kind = fileKind(node.name);
  const marker = pickFileMarker(isDirty, gitStatusMap.get(node.relPath) ?? null);
  return (
    <div
      className={`td-file ${kind}${isSelected ? ' selected' : ''}`}
      style={indent}
      onClick={() => onOpenFile(node.relPath, node.name)}
      title={node.relPath}
    >
      <span className="gl">{kindGlyph(kind)}</span>
      <span>{node.name}</span>
      {marker !== null && <FileMarkerPill marker={marker} />}
    </div>
  );
}

function FileMarkerPill({ marker }: { marker: FileMarker }) {
  return (
    <span
      className={`td-file-mark td-file-mark-${marker.kind}`}
      title={marker.title}
      aria-label={marker.title}
    >
      {marker.label}
    </span>
  );
}

function fileKind(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.md')) return 'md';
  if (lower.endsWith('.ts') || lower.endsWith('.tsx')) return 'ts';
  if (lower.endsWith('.js') || lower.endsWith('.jsx')) return 'js';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.css')) return 'css';
  if (lower.endsWith('.html')) return 'html';
  if (lower.endsWith('.py')) return 'py';
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml';
  return 'other';
}

function kindGlyph(kind: string): string {
  switch (kind) {
    case 'md':
      return 'M';
    case 'ts':
      return 'ts';
    case 'js':
      return 'js';
    case 'json':
      return '{}';
    case 'css':
      return '#';
    case 'html':
      return '<>';
    case 'py':
      return 'py';
    case 'yaml':
      return 'y';
    default:
      return '·';
  }
}
