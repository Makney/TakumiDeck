import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectRow, AppSettings } from '@shared/types';
import { useProjectStore } from '../stores/projects';
import { useUiStore } from '../stores/ui';
import { useSessionStore } from '../stores/sessions';
import { DEFAULT_PROJECT_ID } from '@shared/constants';

// LeftSidebar (Sprint 4 — Architektur 6.0).
//
// Layout: 240 px Spalte links (LAYOUT.COL_LEFT_WIDTH). Liste der Projekte aus
// useProjectStore mit Active-Highlight und #aktive-Sessions-Badge. Default-Project
// (UUID …0001) wird nur angezeigt, wenn es noch Sessions hat (Legacy-Bucket).
//
// Aktionen:
// - Klick auf Projekt → setActiveProject (useUiStore).
// - Refresh-Button (↻) → projects.scanWorkspace() (Re-Scan + DB-Sync).
// - +-Button → projects.addViaDialog() (Datei-Dialog im Main, CLAUDE.md-Pflicht).
//
// Side-Effect-Guard: der Initial-`reload`-Call beim Mount wird über useRef gegen
// React-StrictMode-Doppel-Mount abgesichert (Memory: StrictMode-Side-Effect-Guard).
// Auch wenn project:list ein Read-only-IPC ist, würde der Doppel-Call zwei Renders
// auslösen und die Console mit Warnings füllen, falls später ein Side-Effect-Pfad
// (z.B. State-Reset) dazukommt — Lieber den Guard von Anfang an drin.

interface Props {
  settings: AppSettings;
}

export function LeftSidebar({ settings }: Props) {
  const projects = useProjectStore((s) => s.projects);
  const loading = useProjectStore((s) => s.loading);
  const error = useProjectStore((s) => s.error);
  const reload = useProjectStore((s) => s.reload);
  const scanWorkspace = useProjectStore((s) => s.scanWorkspace);
  const addViaDialog = useProjectStore((s) => s.addViaDialog);

  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const setActiveProject = useUiStore((s) => s.setActiveProject);
  const tabs = useSessionStore((s) => s.tabs);

  const initialLoadRef = useRef(false);
  const [adding, setAdding] = useState(false);

  // Initial-Load der Project-Liste beim Mount.
  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    void reload();
  }, [reload]);

  // Aktives Projekt wählen, sobald die Liste das erste Mal verfügbar ist.
  // Bevorzugt das erste echte (nicht-Legacy) Projekt; Fallback auf Default-Project.
  useEffect(() => {
    if (activeProjectId !== null) return;
    if (projects.length === 0) return;
    const firstReal = projects.find((p) => p.id !== DEFAULT_PROJECT_ID);
    setActiveProject(firstReal?.id ?? projects[0]?.id ?? null);
  }, [projects, activeProjectId, setActiveProject]);

  // Pro Projekt zählen, wie viele LIVE-Tabs running sind. Update, sobald Status
  // im SessionStore wechselt (z.B. durch pty:exit-Listener). Das ist eine reine
  // Renderer-Sicht — die historische Zahl der DB-Sessions kommt aus project.session_count.
  const runningCountByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tabs) {
      if (t.status !== 'running') continue;
      map.set(t.projectId, (map.get(t.projectId) ?? 0) + 1);
    }
    return map;
  }, [tabs]);

  // Default-Bucket nur sichtbar, solange noch Sessions am __default__ hängen
  // (DB-Count via project.session_count aus dem Sprint-4-Repo-LEFT-JOIN).
  // Sobald der cwd-Remap alles umgehängt hat, verschwindet der Bucket sauber.
  const visibleProjects = projects.filter((p) => {
    if (p.id !== DEFAULT_PROJECT_ID) return true;
    return p.session_count > 0;
  });

  const handleAdd = async () => {
    setAdding(true);
    try {
      const added = await addViaDialog();
      if (added) setActiveProject(added.id);
    } finally {
      setAdding(false);
    }
  };

  const workspaceMissing = !settings.workspace_path || settings.workspace_path.trim() === '';

  return (
    <aside className="td-sidebar">
      <div className="td-sidebar-header">
        <span className="td-sidebar-title">Projekte</span>
        <div className="td-sidebar-actions">
          <button
            type="button"
            className="td-sidebar-icon-btn"
            title="Workspace neu scannen"
            onClick={() => void scanWorkspace()}
            disabled={loading}
          >
            ↻
          </button>
          <button
            type="button"
            className="td-sidebar-icon-btn"
            title="Projekt-Ordner hinzufügen"
            onClick={() => void handleAdd()}
            disabled={adding}
          >
            +
          </button>
        </div>
      </div>

      {error && <div className="td-sidebar-error">{error}</div>}

      {workspaceMissing && (
        <div className="td-sidebar-empty">
          Kein Workspace-Pfad konfiguriert. Setze <code>workspace_path</code> in{' '}
          <code>settings.json</code>.
        </div>
      )}

      {!workspaceMissing && visibleProjects.length === 0 && !loading && (
        <div className="td-sidebar-empty">
          Keine Projekte erkannt. Lege im Workspace-Ordner ein Projekt mit{' '}
          <code>CLAUDE.md</code> an oder nutze den +-Button.
        </div>
      )}

      <ul className="td-sidebar-list">
        {visibleProjects.map((p) => (
          <ProjectItem
            key={p.id}
            project={p}
            isActive={p.id === activeProjectId}
            runningCount={runningCountByProject.get(p.id) ?? 0}
            totalCount={p.session_count}
            onSelect={() => setActiveProject(p.id)}
          />
        ))}
      </ul>
    </aside>
  );
}

interface ProjectItemProps {
  project: ProjectRow;
  isActive: boolean;
  runningCount: number;
  totalCount: number;
  onSelect: () => void;
}

function ProjectItem({
  project,
  isActive,
  runningCount,
  totalCount,
  onSelect,
}: ProjectItemProps) {
  const isLegacy = project.id === DEFAULT_PROJECT_ID;
  return (
    <li
      className={`td-sidebar-item ${isActive ? 'active' : ''} ${isLegacy ? 'legacy' : ''}`}
      onClick={onSelect}
    >
      <div className="td-sidebar-item-row">
        <span className="td-sidebar-item-name">
          {isLegacy ? 'Sprint-2/3-Legacy' : project.name}
        </span>
        {runningCount > 0 && (
          <span
            className="td-sidebar-badge running"
            title={`${runningCount} aktive Session${runningCount === 1 ? '' : 's'}`}
          >
            {runningCount}
          </span>
        )}
        {runningCount === 0 && totalCount > 0 && (
          <span
            className="td-sidebar-badge"
            title={`${totalCount} Session${totalCount === 1 ? '' : 's'}`}
          >
            {totalCount}
          </span>
        )}
      </div>
      {!isLegacy && (
        <div className="td-sidebar-item-path" title={project.path}>
          {project.path}
        </div>
      )}
    </li>
  );
}
