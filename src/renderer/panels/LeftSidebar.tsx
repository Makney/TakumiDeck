import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppSettings,
  ProjectRow,
  SessionHistoryEntry,
  SessionStatus,
} from '@shared/types';
import { useProjectStore } from '../stores/projects';
import { useUiStore } from '../stores/ui';
import { useSessionStore, type SessionTab } from '../stores/sessions';
import { DEFAULT_PROJECT_ID } from '@shared/constants';
import { displayProjectName } from '../components/displayProjectName';
import { estimateTerminalCols } from '../components/estimateTerminalCols';
import { RemoveProjectModal } from '../modals/RemoveProjectModal';

// LeftSidebar — Sprint-6-UI-Fix mit 3-Sektionen-Layout aus dem Design-Handoff
// (docs/design/UI_DECISIONS.md + claude-export/components.jsx).
//
// Stack der drei `td-panel`-Sektionen:
//   1. Projekte         — Liste der DB-Projekte mit Active-Highlight + + Add
//   2. Aktive Sessions  — Tabs des aktiven Projekts (Status-Dot + Name + ×)
//                         + Footer: + Neue Session (öffnet NewSessionModal)
//   3. Verlauf          — kompakte Liste der nicht-mehr-aktiven Sessions
//                         (max ~10 Einträge); Klick öffnet HistoryPane mit
//                         vorausgewähltem Eintrag.
//
// Tabs-Bar oben im Hauptbereich bleibt erhalten — die Sidebar-Sektion und die
// Tab-Bar sind synchronisierte Ansichten der aktiven Sessions.

const HISTORY_QUICKLIST_LIMIT = 10;
// Welche Status zeigt die Verlauf-Quickliste? Architektur 6.6: Sessions, die
// nicht mehr live sind, aber nicht archiviert. archived bleibt im Verlauf-
// Detail-Filter sichtbar, im Sidebar-Snapshot aber ausgeblendet (sonst voller
// Karteileichen-Stack).
const HISTORY_STATUSES: SessionStatus[] = ['completed', 'interrupted', 'error'];

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
  const removeProject = useProjectStore((s) => s.remove);

  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const setActiveProject = useUiStore((s) => s.setActiveProject);
  const setMainView = useUiStore((s) => s.setMainView);
  // Sprint 9 — Sidebar-Verlauf-Klick öffnet jetzt das HistoryActionModal
  // statt direkt den setHistorySelected/mainView-Wechsel auszulösen.
  const setHistoryActionEntry = useUiStore((s) => s.setHistoryActionEntry);
  const setShowNewSessionModal = useUiStore((s) => s.setShowNewSessionModal);
  const hydrateFromStorage = useUiStore((s) => s.hydrateFromStorage);
  const loadActiveProjectFrontmatter = useUiStore((s) => s.loadActiveProjectFrontmatter);

  const tabs = useSessionStore((s) => s.tabs);
  const activeTabId = useSessionStore((s) => s.activeId);
  const setActiveTab = useSessionStore((s) => s.setActive);
  const closeTab = useSessionStore((s) => s.closeTab);
  const setTabStatus = useSessionStore((s) => s.setStatus);

  const initialLoadRef = useRef(false);
  const hydrateRef = useRef(false);
  const frontmatterLoadedFor = useRef<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [historyEntries, setHistoryEntries] = useState<SessionHistoryEntry[]>([]);
  // Phase-2 Season-8: ID des Projekts, dessen Remove-Modal gerade offen ist.
  // Lokaler State statt UI-Store, weil das Modal nur aus der Sidebar getriggert
  // wird und kein zweites Renderer-Surface darauf reagieren muss.
  const [removeTargetId, setRemoveTargetId] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  // Sprint-5-Hydrate: persistierte Project-ID aus localStorage laden, BEVOR der
  // erste reload() läuft, damit die Auto-Select-Logik unten den persistierten
  // Wert respektiert.
  useEffect(() => {
    if (hydrateRef.current) return;
    hydrateRef.current = true;
    hydrateFromStorage();
  }, [hydrateFromStorage]);

  useEffect(() => {
    if (initialLoadRef.current) return;
    initialLoadRef.current = true;
    void reload();
  }, [reload]);

  useEffect(() => {
    if (projects.length === 0) return;
    if (activeProjectId !== null) {
      const stillExists = projects.some((p) => p.id === activeProjectId);
      if (stillExists) return;
    }
    const firstReal = projects.find((p) => p.id !== DEFAULT_PROJECT_ID);
    setActiveProject(firstReal?.id ?? projects[0]?.id ?? null);
  }, [projects, activeProjectId, setActiveProject]);

  useEffect(() => {
    if (!activeProjectId) return;
    if (frontmatterLoadedFor.current === activeProjectId) return;
    frontmatterLoadedFor.current = activeProjectId;
    if (activeProjectId === DEFAULT_PROJECT_ID) return;
    void loadActiveProjectFrontmatter(activeProjectId);
  }, [activeProjectId, loadActiveProjectFrontmatter]);

  // Verlauf-Quickliste: bei Project-Wechsel oder Tab-Status-Änderung neu laden.
  // Read-only IPC, kein useRef-Guard nötig (Memory: Guard nur für Mutationen).
  // Re-Load bei `tabs`-Änderung ist relevant, weil neue Sessions in der Tab-Bar
  // beim Schließen in den Verlauf wandern und der Snapshot dann veraltet ist.
  useEffect(() => {
    if (!activeProjectId) {
      setHistoryEntries([]);
      return;
    }
    let cancelled = false;
    void window.api.sessions
      .history({ projectId: activeProjectId, statuses: HISTORY_STATUSES })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) setHistoryEntries(result.data);
      });
    return () => {
      cancelled = true;
    };
    // tabs.length triggert Re-Load nach Tab-Schließen; wir brauchen kein deep-equal,
    // weil Status-Änderungen ohnehin den Tab nicht aus dem Store entfernen.
  }, [activeProjectId, tabs.length]);

  const runningCountByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tabs) {
      if (t.status !== 'running') continue;
      map.set(t.projectId, (map.get(t.projectId) ?? 0) + 1);
    }
    return map;
  }, [tabs]);

  const visibleProjects = projects.filter((p) => {
    if (p.id !== DEFAULT_PROJECT_ID) return true;
    return p.session_count > 0;
  });

  const tabsInActiveProject = useMemo(
    () => (activeProjectId ? tabs.filter((t) => t.projectId === activeProjectId) : []),
    [tabs, activeProjectId],
  );

  // Verlauf-Liste exklusive Sessions, die schon als Tab offen sind — sonst doppelt.
  const historySnapshot = useMemo(() => {
    const tabIds = new Set(tabsInActiveProject.map((t) => t.sessionId));
    return historyEntries
      .filter((e) => !tabIds.has(e.id))
      .slice(0, HISTORY_QUICKLIST_LIMIT);
  }, [historyEntries, tabsInActiveProject]);

  const handleAdd = async () => {
    setAdding(true);
    try {
      const added = await addViaDialog();
      if (added) setActiveProject(added.id);
    } finally {
      setAdding(false);
    }
  };

  const handleCloseTab = useCallback(
    async (sessionId: string) => {
      // Sprint-6-UX-Fix Variante B: × ist non-destruktiv — der Server killt nur
      // den PTY (falls noch läuft), Status wandert via pty:exit auf completed.
      // Resume bleibt aus dem Verlauf möglich.
      const result = await window.api.sessions.close({ sessionId });
      if (!result.ok) {
        console.warn(`[LeftSidebar] session:close fehlgeschlagen: ${result.error}`);
      }
      closeTab(sessionId);
    },
    [closeTab],
  );

  const handleResumeFromTabs = useCallback(
    async (sessionId: string) => {
      // Sprint-9-Konsistenz mit TabContainer.handleResume: cols/rows aus der
      // aktuellen Mid-Column-Breite schätzen statt 80×24 hardcoded. Sonst
      // formatiert claude den Resume-Welcome rechts abgeschnitten, weil
      // xterm den Buffer nicht reflowt.
      const { cols, rows } = estimateTerminalCols(settings.terminal_font_size);
      const result = await window.api.sessions.resume({ sessionId, cols, rows });
      if (!result.ok) {
        console.warn(`[LeftSidebar] session:resume fehlgeschlagen: ${result.error}`);
        return;
      }
      setTabStatus(sessionId, 'running');
      setActiveTab(sessionId);
    },
    [setTabStatus, setActiveTab, settings.terminal_font_size],
  );

  // Phase-2 Season-8: vor dem Server-Remove die offenen Tabs des Projekts
  // schließen — sonst verweisen die Tabs im SessionStore weiter auf die alte
  // projectId, die in der DB nicht mehr existiert. handleCloseTab kümmert sich
  // um PTY-Kill + Session-Lifecycle (Status wandert auf completed), womit die
  // Sessions korrekt im Legacy-Bucket im Verlauf landen.
  const handleConfirmRemove = useCallback(async () => {
    if (!removeTargetId) return;
    setRemoveBusy(true);
    setRemoveError(null);
    try {
      const tabsToClose = tabs.filter((t) => t.projectId === removeTargetId);
      for (const tab of tabsToClose) {
        await handleCloseTab(tab.sessionId);
      }
      const ok = await removeProject(removeTargetId);
      if (!ok) {
        setRemoveError(useProjectStore.getState().error ?? 'Entfernen fehlgeschlagen');
        setRemoveBusy(false);
        return;
      }
      // Aktives Projekt zurücksetzen, wenn es gerade das entfernte war. Der
      // useEffect oben springt dann beim nächsten Render auf das erste echte
      // Projekt (oder den Legacy-Bucket, falls keins mehr da ist).
      if (activeProjectId === removeTargetId) {
        setActiveProject(null);
      }
      setRemoveTargetId(null);
      setRemoveBusy(false);
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : String(e));
      setRemoveBusy(false);
    }
  }, [
    removeTargetId,
    tabs,
    handleCloseTab,
    removeProject,
    activeProjectId,
    setActiveProject,
  ]);

  const handleCloseRemoveModal = useCallback(() => {
    if (removeBusy) return;
    setRemoveTargetId(null);
    setRemoveError(null);
  }, [removeBusy]);

  const removeTargetProject = removeTargetId
    ? projects.find((p) => p.id === removeTargetId) ?? null
    : null;
  const removeTargetTabCount = removeTargetId
    ? tabs.filter((t) => t.projectId === removeTargetId).length
    : 0;

  const workspaceMissing = !settings.workspace_path || settings.workspace_path.trim() === '';

  return (
    <aside className="td-sidebar">
      {/* === Projekte ============================================================ */}
      <ProjectsPanel
        projects={visibleProjects}
        activeId={activeProjectId}
        loading={loading}
        adding={adding}
        error={error}
        workspaceMissing={workspaceMissing}
        onPick={(id) => setActiveProject(id, 'terminals')}
        onAdd={() => void handleAdd()}
        onRefresh={() => void scanWorkspace()}
        onRequestRemove={(id) => {
          setRemoveError(null);
          setRemoveTargetId(id);
        }}
        runningCountByProject={runningCountByProject}
      />

      {/* === Aktive Sessions ===================================================== */}
      <ActiveSessionsPanel
        tabs={tabsInActiveProject}
        activeTabId={activeTabId}
        canAdd={activeProjectId !== null}
        onPick={(sessionId) => {
          setActiveTab(sessionId);
          setMainView('terminals');
        }}
        onClose={(sessionId) => void handleCloseTab(sessionId)}
        onResume={(sessionId) => void handleResumeFromTabs(sessionId)}
        onNew={() => setShowNewSessionModal(true)}
      />

      {/* === Verlauf ============================================================= */}
      <HistoryPanel
        entries={historySnapshot}
        onPick={(entry) => setHistoryActionEntry(entry)}
        onOpenAll={() => setMainView('history')}
      />

      {removeTargetProject && (
        <RemoveProjectModal
          project={removeTargetProject}
          openTabCount={removeTargetTabCount}
          busy={removeBusy}
          error={removeError}
          onConfirm={() => void handleConfirmRemove()}
          onClose={handleCloseRemoveModal}
        />
      )}
    </aside>
  );
}

// ============================================================ Projects-Panel

interface ProjectsPanelProps {
  projects: ProjectRow[];
  activeId: string | null;
  loading: boolean;
  adding: boolean;
  error: string | null;
  workspaceMissing: boolean;
  runningCountByProject: Map<string, number>;
  onPick: (id: string) => void;
  onAdd: () => void;
  onRefresh: () => void;
  // Phase-2 Season-8: Trash-Icon im Hover-Slot eines echten Projekts.
  // Legacy-Bucket (DEFAULT_PROJECT_ID) bekommt kein Icon — die Aktion ist
  // dort serverseitig verboten und soll auch UI-seitig nicht angeboten werden.
  onRequestRemove: (id: string) => void;
}

function ProjectsPanel({
  projects,
  activeId,
  loading,
  adding,
  error,
  workspaceMissing,
  runningCountByProject,
  onPick,
  onAdd,
  onRefresh,
  onRequestRemove,
}: ProjectsPanelProps) {
  return (
    <div className="td-panel">
      <div className="td-panel-head">
        <div className="td-panel-title">Projekte</div>
        <div className="td-panel-actions">
          <button
            type="button"
            className="td-icon-btn"
            title="Workspace neu scannen"
            onClick={onRefresh}
            disabled={loading}
          >
            ↻
          </button>
        </div>
      </div>
      <div className="td-panel-body">
        {error && <div className="td-sidebar-error">{error}</div>}
        {workspaceMissing && (
          <div className="td-sidebar-empty">
            Kein Workspace-Pfad konfiguriert. Setze <code>workspace_path</code> in{' '}
            <code>settings.json</code>.
          </div>
        )}
        {!workspaceMissing && projects.length === 0 && !loading && (
          <div className="td-sidebar-empty">
            Keine Projekte erkannt. Lege im Workspace einen Ordner mit{' '}
            <code>CLAUDE.md</code> an oder nutze + Add.
          </div>
        )}
        <div className="td-list">
          {projects.map((p) => {
            const isLegacy = p.id === DEFAULT_PROJECT_ID;
            const runningCount = runningCountByProject.get(p.id) ?? 0;
            return (
              <div
                key={p.id}
                className={`td-list-item${activeId === p.id ? ' active' : ''}${isLegacy ? ' legacy' : ''}`}
                onClick={() => onPick(p.id)}
                title={p.path}
              >
                <span className="td-folder">▸</span>
                <span className="td-name">{displayProjectName(p)}</span>
                {runningCount > 0 ? (
                  <span className="td-badge running">{runningCount}</span>
                ) : (
                  p.session_count > 0 && <span className="td-badge">{p.session_count}</span>
                )}
                {!isLegacy && (
                  <button
                    type="button"
                    className="td-row-x td-row-hover"
                    title="Projekt aus Liste entfernen"
                    aria-label={`Projekt ${displayProjectName(p)} aus Liste entfernen`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestRemove(p.id);
                    }}
                  >
                    🗑
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="td-panel-foot">
        <button
          type="button"
          className="td-action-btn"
          onClick={onAdd}
          disabled={adding}
        >
          + Add Project
        </button>
      </div>
    </div>
  );
}

// ============================================================ Active-Sessions-Panel

interface ActiveSessionsPanelProps {
  tabs: SessionTab[];
  activeTabId: string | null;
  canAdd: boolean;
  onPick: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onResume: (sessionId: string) => void;
  onNew: () => void;
}

function ActiveSessionsPanel({
  tabs,
  activeTabId,
  canAdd,
  onPick,
  onClose,
  onResume,
  onNew,
}: ActiveSessionsPanelProps) {
  return (
    <div className="td-panel">
      <div className="td-panel-head">
        <div className="td-panel-title">Aktive Sessions</div>
      </div>
      <div className="td-panel-body">
        {tabs.length === 0 && (
          <div className="td-sidebar-empty-soft">
            Keine aktiven Sessions in diesem Projekt.
          </div>
        )}
        <div className="td-list">
          {tabs.map((tab) => {
            const isActive = tab.sessionId === activeTabId;
            const canResume =
              tab.status === 'completed' ||
              tab.status === 'interrupted' ||
              tab.status === 'error';
            return (
              <div
                key={tab.sessionId}
                className={`td-list-item${isActive ? ' active' : ''}`}
                onClick={() => onPick(tab.sessionId)}
                title={tab.title}
              >
                <span className={`td-status-dot ${tab.status}`} />
                <span className="td-name">{tab.title}</span>
                {canResume && (
                  <button
                    type="button"
                    className="td-row-action"
                    title="Resume"
                    onClick={(e) => {
                      e.stopPropagation();
                      onResume(tab.sessionId);
                    }}
                  >
                    ↻
                  </button>
                )}
                <button
                  type="button"
                  className="td-row-x"
                  title="Tab schließen (Session bleibt im Verlauf)"
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(tab.sessionId);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <div className="td-panel-foot">
        <button
          type="button"
          className="td-action-btn primary"
          onClick={onNew}
          disabled={!canAdd}
        >
          + Neue Session
        </button>
      </div>
    </div>
  );
}

// ============================================================ History-Panel

interface HistoryPanelProps {
  entries: SessionHistoryEntry[];
  onPick: (entry: SessionHistoryEntry) => void;
  onOpenAll: () => void;
}

function HistoryPanel({ entries, onPick, onOpenAll }: HistoryPanelProps) {
  return (
    <div className="td-panel td-panel-history">
      <div className="td-panel-head">
        <div className="td-panel-title">Verlauf</div>
      </div>
      <div className="td-panel-body">
        {entries.length === 0 && (
          <div className="td-sidebar-empty-soft">
            Noch keine abgeschlossenen Sessions.
          </div>
        )}
        <div className="td-list td-history-quicklist">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`td-hist-row ${entry.status}`}
              onClick={() => onPick(entry)}
              title={`${entry.title} — Klick öffnet Resume/Archiv-Auswahl`}
            >
              <span className="td-hist-tick">{statusGlyph(entry.status)}</span>
              <div className="td-hist-rows">
                <div className="td-hist-name">{entry.title}</div>
                <div className="td-hist-meta">
                  {entry.season_number !== null
                    ? `S${entry.season_number}`
                    : entry.type.toUpperCase()}{' '}
                  · {entry.current_model ?? '—'}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
      {/* Sprint 9 — Footer-Button für die ausführliche Verlauf-Tabelle.
          Quickliste oben zeigt nur die letzten N Einträge; wer den ganzen
          Verlauf mit Filter und Detail-Pane braucht, klickt hier. */}
      <div className="td-panel-foot">
        <button
          type="button"
          className="td-action-btn"
          onClick={onOpenAll}
          title="Vollständiger Verlauf mit Filter und Detail-Pane"
        >
          → Alle anzeigen
        </button>
      </div>
    </div>
  );
}

function statusGlyph(status: SessionStatus): string {
  if (status === 'completed') return '✓';
  if (status === 'interrupted') return '…';
  if (status === 'error') return '✗';
  if (status === 'archived') return '✓';
  if (status === 'running') return '●';
  return '·';
}
