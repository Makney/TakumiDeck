import { useEffect, useState, useCallback, useMemo } from 'react';
import type { AppSettings, SessionStatus } from '@shared/types';
import { useSessionStore, selectTabsForProject } from '../stores/sessions';
import { useUiStore } from '../stores/ui';
import { useProjectStore } from '../stores/projects';
import { TerminalTab } from './TerminalTab';
import { NewSessionModal } from '../modals/NewSessionModal';
import { TemplatesModal } from '../modals/TemplatesModal';
import { NotesFooter } from '../components/NotesFooter';
import { displayProjectName } from '../components/displayProjectName';

// Sprint-3-Tab-Container, in Sprint 4 erweitert um Per-Projekt-Filter:
// - Tab-Bar zeigt nur Tabs des aktiven Projekts (Variante A: Renderer-Filter).
// - Multi-Terminal-Stack rendert weiterhin alle xterm-Instanzen dauerhaft mounted
//   (Sprint-3-Variante A); CSS verbirgt Tabs anderer Projekte.
// - NewSessionModal nutzt den Pfad des aktiven Projekts als cwd.

interface Props {
  settings: AppSettings;
}

export function TabContainer({ settings }: Props) {
  const tabs = useSessionStore((s) => s.tabs);
  const activeId = useSessionStore((s) => s.activeId);
  const addTab = useSessionStore((s) => s.addTab);
  const closeTab = useSessionStore((s) => s.closeTab);
  const setActive = useSessionStore((s) => s.setActive);
  const nextTab = useSessionStore((s) => s.nextTab);
  const prevTab = useSessionStore((s) => s.prevTab);
  const setStatus = useSessionStore((s) => s.setStatus);

  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const activeProjectFrontmatter = useUiStore((s) => s.activeProjectFrontmatter);
  const showNewSessionModal = useUiStore((s) => s.showNewSessionModal);
  const setShowNewSessionModal = useUiStore((s) => s.setShowNewSessionModal);
  const showTemplatesModal = useUiStore((s) => s.showTemplatesModal);
  const setShowTemplatesModal = useUiStore((s) => s.setShowTemplatesModal);
  const projects = useProjectStore((s) => s.projects);

  const activeProject = useMemo(
    () => (activeProjectId ? projects.find((p) => p.id === activeProjectId) ?? null : null),
    [projects, activeProjectId],
  );

  // Sprint-5: Per-Projekt-Modell-Default aus dem CLAUDE.md-Frontmatter ziehen, mit
  // Fallback auf settings.default_model. Architektur 6.2 verlangt Per-Projekt > Global.
  // Der Frontmatter-Cache wird vom LeftSidebar beim Project-Wechsel nachgeladen.
  const effectiveDefaultModel =
    activeProjectFrontmatter?.workbench.default_model ?? settings.default_model;

  // Per-Projekt-Filter (Sprint-4-Variante A): die Tab-Bar zeigt nur Tabs, die zum
  // aktiven Projekt gehören. Der Multi-Terminal-Stack rendert weiterhin alle Tabs
  // (CSS-`display:none` verbirgt sie), damit xterm-Buffer und PTYs der inaktiven
  // Projekte beim Wechsel intakt bleiben.
  const tabsInActiveProject = useMemo(
    () => (activeProjectId ? selectTabsForProject(tabs, activeProjectId) : []),
    [tabs, activeProjectId],
  );

  const activeTab = useMemo(
    () => (activeId ? tabs.find((t) => t.sessionId === activeId) ?? null : null),
    [tabs, activeId],
  );

  // Wenn das aktive Projekt wechselt: aktive Tab-ID auf den ersten Tab des neuen
  // Projekts setzen (oder null, wenn das neue Projekt keine Tabs hat). Sonst
  // sähe der User die Tab-Bar des einen Projekts, aber das Terminal des anderen.
  useEffect(() => {
    if (!activeProjectId) {
      if (activeId !== null) setActive(null);
      return;
    }
    const stillValid = tabsInActiveProject.some((t) => t.sessionId === activeId);
    if (stillValid) return;
    const first = tabsInActiveProject[0];
    setActive(first ? first.sessionId : null);
  }, [activeProjectId, tabsInActiveProject, activeId, setActive]);

  // Sprint-6-UI-Fix: Modal-State liegt im UiStore, weil Sidebar und Tab-Bar
  // beide auf den gleichen Open-Zustand zugreifen.
  // Tabs, die in dieser Session-Lebensdauer schon gespawnt wurden — verhindert,
  // dass ein erneuter Tab-Mount (z.B. nach React-Tree-Repaint) eine zweite PTY öffnet.
  const [spawnedIds, setSpawnedIds] = useState<Set<string>>(new Set());

  // Wenn das Modal schließt, soll der Fokus zurück aufs aktive Terminal gehen.
  // Sonst bleibt er auf dem (jetzt unmounteten) Submit-/Cancel-Button und Tastatur-
  // events landen am body — Ctrl+C/V wirken erst nach einem Klick auf die Canvas.
  // TerminalTab hört auf 'td-focus-active' und ruft `terminal.focus()` auf.
  useEffect(() => {
    if (showNewSessionModal || showTemplatesModal) return;
    window.dispatchEvent(new Event('td-focus-active'));
  }, [showNewSessionModal, showTemplatesModal]);

  // Globale Keyboard-Shortcuts: Ctrl+N neue Session, Ctrl+T Templates, Ctrl+Tab /
  // Ctrl+Shift+Tab Wechsel. Tab-Navigation ist auf das aktive Projekt beschränkt
  // (siehe Sprint-4-Filter).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        if (!activeProjectId) return; // ohne Projekt-Auswahl kein +-Modal sinnvoll
        setShowNewSessionModal(true);
      } else if (e.key === 't' || e.key === 'T') {
        // Ctrl+Shift+T ist im Browser/Electron oft „Tab-Reopen" — wir wollen nur
        // das schlanke Ctrl+T (ohne Shift) für Templates.
        if (e.shiftKey) return;
        e.preventDefault();
        if (!activeProjectId) return;
        setShowTemplatesModal(true);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (!activeProjectId) return;
        if (e.shiftKey) prevTab(activeProjectId);
        else nextTab(activeProjectId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nextTab, prevTab, activeProjectId, setShowNewSessionModal, setShowTemplatesModal]);

  const handleClose = useCallback(
    async (sessionId: string) => {
      // Sprint-6-UX-Fix Variante B: × ist non-destruktiv — Server killt nur den
      // PTY (falls noch läuft), der Lifecycle setzt via pty:exit auf completed.
      // Die Session bleibt im Verlauf erreichbar; expliziter Archive-Schritt
      // läuft separat über das Verlauf-Detail-Pane.
      const result = await window.api.sessions.close({ sessionId });
      if (!result.ok) {
        console.warn(`[TabContainer] session:close fehlgeschlagen: ${result.error}`);
      }
      closeTab(sessionId);
    },
    [closeTab],
  );

  const handleResume = useCallback(
    async (sessionId: string) => {
      const tab = useSessionStore.getState().tabs.find((t) => t.sessionId === sessionId);
      if (!tab) return;
      // Bei Resume bestimmen wir cols/rows pragmatisch über typische Defaults — der
      // erste fit()-Tick beim Aktivieren des Tabs sendet eine korrekte Resize-Nachricht
      // an die PTY nach. 80×24 ist die universelle ConPTY-Default-Größe.
      const result = await window.api.sessions.resume({
        sessionId,
        cols: 80,
        rows: 24,
      });
      if (!result.ok) {
        console.warn(`[TabContainer] session:resume fehlgeschlagen: ${result.error}`);
        return;
      }
      setStatus(sessionId, 'running');
      setActive(sessionId);
    },
    [setStatus, setActive],
  );

  const handleNewSession = useCallback(
    (input: { title: string; type: 'feature' | 'bug' | 'review' | 'docs-sync'; model: string }) => {
      if (!activeProjectId || !activeProject) return;
      // Sprint-4-Default für cwd: der Pfad des aktiven Projekts. settings.workspace_path
      // war Sprint-3-Lifeline, weil es nur das Default-Projekt gab — jetzt sind Sessions
      // immer im Kontext eines konkreten Projekts.
      const tab = addTab({
        projectId: activeProjectId,
        title: input.title,
        type: input.type,
        model: input.model,
        cwd: activeProject.path,
      });
      // Diesen Tab als spawn-pflichtig markieren — TerminalTab feuert dann pty:create.
      setSpawnedIds((prev) => {
        const next = new Set(prev);
        next.add(tab.sessionId);
        return next;
      });
      setShowNewSessionModal(false);
    },
    [addTab, activeProjectId, activeProject, setShowNewSessionModal],
  );

  const canAddSession = activeProjectId !== null && activeProject !== null;

  return (
    <div className="td-tab-container">
      <TabBar
        tabs={tabsInActiveProject.map((t) => ({
          sessionId: t.sessionId,
          title: t.title,
          status: t.status,
          isActive: t.sessionId === activeId,
        }))}
        canAdd={canAddSession}
        onSelect={setActive}
        onClose={handleClose}
        onResume={handleResume}
        onAdd={() => setShowNewSessionModal(true)}
      />

      <div className="td-tab-host">
        {tabsInActiveProject.length === 0 && (
          <div className="td-tab-empty">
            {activeProject ? (
              <>
                <p>Keine Sessions in „{displayProjectName(activeProject)}".</p>
                <p>
                  <button
                    type="button"
                    className="td-tab-empty-cta"
                    onClick={() => setShowNewSessionModal(true)}
                  >
                    + Neue Session (Ctrl+N)
                  </button>
                </p>
              </>
            ) : (
              <p>Wähle links ein Projekt aus, um Sessions zu starten.</p>
            )}
          </div>
        )}
        {tabs.map((tab) => (
          <div
            key={tab.sessionId}
            className="td-tab-host-item"
            style={{ display: tab.sessionId === activeId ? 'flex' : 'none' }}
          >
            <TerminalTab
              sessionId={tab.sessionId}
              projectId={tab.projectId}
              title={tab.title}
              type={tab.type}
              model={tab.model}
              cwd={tab.cwd}
              settings={settings}
              isActive={tab.sessionId === activeId}
              needsSpawn={spawnedIds.has(tab.sessionId)}
              onStatusChange={setStatus}
            />
          </div>
        ))}
      </div>

      {activeTab && (
        <ActionBar
          model={activeTab.model}
          status={activeTab.status}
          onOpenTemplates={() => setShowTemplatesModal(true)}
        />
      )}

      {activeId && <NotesFooter sessionId={activeId} />}

      {showNewSessionModal && canAddSession && (
        <NewSessionModal
          defaultModel={effectiveDefaultModel}
          nextSeasonPreview={activeProject?.next_season_number ?? null}
          onCancel={() => setShowNewSessionModal(false)}
          onCreate={handleNewSession}
        />
      )}

      {showTemplatesModal && activeProject && (
        <TemplatesModal
          project={activeProject}
          frontmatter={activeProjectFrontmatter}
          hasActiveTerminal={activeId !== null}
          onClose={() => setShowTemplatesModal(false)}
        />
      )}
    </div>
  );
}

interface TabBarProps {
  tabs: Array<{ sessionId: string; title: string; status: SessionStatus; isActive: boolean }>;
  canAdd: boolean;
  onSelect: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onResume: (sessionId: string) => void;
  onAdd: () => void;
}

function TabBar({ tabs, canAdd, onSelect, onClose, onResume, onAdd }: TabBarProps) {
  return (
    <div className="td-tabs">
      {tabs.map((tab) => (
        <div
          key={tab.sessionId}
          className={`td-tab ${tab.isActive ? 'active' : ''}`}
          onClick={() => onSelect(tab.sessionId)}
        >
          <StatusDot status={tab.status} />
          <span className="td-tab-title">{tab.title}</span>
          {(tab.status === 'completed' ||
            tab.status === 'interrupted' ||
            tab.status === 'error') && (
            <button
              type="button"
              className="td-tab-action"
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
            className="td-tab-x"
            title="Tab schließen"
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab.sessionId);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="td-tab-add"
        title={canAdd ? 'Neue Session (Ctrl+N)' : 'Erst ein Projekt links auswählen'}
        onClick={onAdd}
        disabled={!canAdd}
      >
        +
      </button>
    </div>
  );
}

function StatusDot({ status }: { status: SessionStatus }) {
  return <span className={`td-status-dot ${status}`} aria-label={status} />;
}

// Action-Bar unter dem Terminal — Sprint-6-UI-Fix nach docs/design/claude-export
// (components.jsx Zeile 179, td-term-bar mit td-pill-Elementen). Templates-Pill
// ist der primäre Pfad, weil Ctrl+T je nach System von anderen Programmen
// (Spotify, Browser-Reopen etc.) gefangen wird. Modell-Pill ist read-only —
// Modell-Wechsel läuft im laufenden Claude-Prozess über `/model`.
const ACTION_BAR_MODEL_LABELS: Record<string, string> = {
  'claude-opus-4-7': 'Opus 4.7',
  'claude-opus-4-6': 'Opus 4.6',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-sonnet-4-5': 'Sonnet 4.5',
  'claude-haiku-4-5': 'Haiku 4.5',
};

const STATUS_LABEL: Record<SessionStatus, string> = {
  running: '● läuft',
  idle: '○ idle',
  waiting: '◐ wartet',
  completed: '✓ abgeschlossen',
  interrupted: '⏸ unterbrochen',
  error: '✗ Fehler',
  archived: '◌ archiviert',
};

interface ActionBarProps {
  model: string;
  status: SessionStatus;
  onOpenTemplates: () => void;
}

function ActionBar({ model, status, onOpenTemplates }: ActionBarProps) {
  const modelLabel = ACTION_BAR_MODEL_LABELS[model] ?? model;
  return (
    <div className="td-term-bar">
      <span
        className="td-pill td-pill-info"
        title={`Aktuelles Modell: ${model}`}
      >
        <span aria-hidden>●</span> {modelLabel}
      </span>
      <button
        type="button"
        className="td-pill td-pill-button"
        onClick={onOpenTemplates}
        title="Templates (Ctrl+T)"
      >
        <span aria-hidden>⌘</span> Templates
      </button>
      <div className="td-term-bar-spacer" aria-hidden />
      <span className="td-term-bar-status">{STATUS_LABEL[status]}</span>
    </div>
  );
}
