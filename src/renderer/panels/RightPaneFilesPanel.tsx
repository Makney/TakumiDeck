import { useEffect, useMemo, useState, useRef } from 'react';
import type { FsTreeNode } from '@shared/types';
import { filterTree } from '../components/treeFilter';

// Datei-Browser-Sektion im Right-Pane (Sprint 7, Phase 5).
//
// - Hierarchische Anzeige des aktiven Projekts (fs:list-tree, Driver-injected im Main).
// - Filter-Suchfeld vorbelegt mit „.md" (Q2 Variante B).
// - M-Indikator pro File, dessen relPath in dirtyRelPaths liegt (kommt aus dem
//   FileTabs-Store via Eltern-Komponente).
// - Klick auf File → onOpenFile(relPath, label). Klick auf Dir → expand/collapse.
//
// Lade-Trigger: bei jedem projectId-Wechsel re-fetch via fs:list-tree. Das ist
// kein Server-Side-Effect (read-only IPC) → kein useRef-Guard nötig (Memory:
// Guard nur für Server-Mutationen).

interface Props {
  projectId: string | null;
  // Set der relPaths, deren Datei-Tab gerade dirty ist — für die M-Pille.
  dirtyRelPaths: Set<string>;
  onOpenFile: (relPath: string, label: string) => void;
}

export function RightPaneFilesPanel({ projectId, dirtyRelPaths, onOpenFile }: Props) {
  const [tree, setTree] = useState<FsTreeNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Default-Filter „.md" (Q2 Variante B). Beim Project-Wechsel NICHT zurücksetzen,
  // damit der User seinen Filter behält, wenn er zwischen Projekten zappt.
  const [filter, setFilter] = useState('.md');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(['docs']));

  // Per-Project-Reload. Wenn der User schnell zwischen Projekten wechselt, gewinnt
  // immer die jüngste Antwort — wir tracken das per Ref-Sequence.
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

  const filtered = useMemo(() => filterTree(tree, filter), [tree, filter]);

  // Wenn der Filter aktiv ist, soll der Tree komplett aufgeklappt sein (sonst
  // sieht der User nicht, was matched). Wir setzen einen virtuellen „expand all"-
  // Flag basierend auf der Filter-Aktivität.
  const expandAll = filter.trim() !== '';

  return (
    <div className="td-panel td-files">
      <div className="td-files-head">
        <div className="td-files-search">
          <span aria-hidden>⌕</span>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Dateien filtern…"
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
            {filter === '' ? 'Keine Dateien gefunden.' : `Keine Treffer für „${filter}".`}
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

// ============================================================ TreeNode

interface TreeNodeProps {
  node: FsTreeNode;
  depth: number;
  expanded: Set<string>;
  expandAll: boolean;
  dirtyRelPaths: Set<string>;
  onToggle: (relPath: string) => void;
  onOpenFile: (relPath: string, label: string) => void;
}

function TreeNode({
  node,
  depth,
  expanded,
  expandAll,
  dirtyRelPaths,
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
              onToggle={onToggle}
              onOpenFile={onOpenFile}
            />
          ))}
      </>
    );
  }
  // File
  const isDirty = dirtyRelPaths.has(node.relPath);
  const kind = fileKind(node.name);
  return (
    <div
      className={`td-file ${kind}`}
      style={indent}
      onClick={() => onOpenFile(node.relPath, node.name)}
      title={node.relPath}
    >
      <span className="gl">{kindGlyph(kind)}</span>
      <span>{node.name}</span>
      {isDirty && <span className="td-file-dirty">M</span>}
    </div>
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
