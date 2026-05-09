import { useEffect, useState, useCallback } from 'react';
import type { AppSettings, SessionStatus } from '@shared/types';
import { useSessionStore } from '../stores/sessions';
import { TerminalTab } from './TerminalTab';
import { NewSessionModal } from '../modals/NewSessionModal';
import { NotesFooter } from '../components/NotesFooter';

// Sprint-3-Tab-Container. Hält die Tab-Bar (.td-tab Pills + +-Button), den
// Multi-Terminal-Stack (alle Tabs dauerhaft mounted, aktiver per CSS sichtbar →
// Variante A) und den Notes-Footer.
//
// Frische Sessions werden über die NewSessionModal gestartet, geschlossene Tabs
// können über den Resume-Button auf der Tab-Pille reanimiert werden.

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

  const [showModal, setShowModal] = useState(false);
  // Tabs, die in dieser Session-Lebensdauer schon gespawnt wurden — verhindert,
  // dass ein erneuter Tab-Mount (z.B. nach React-Tree-Repaint) eine zweite PTY öffnet.
  const [spawnedIds, setSpawnedIds] = useState<Set<string>>(new Set());

  // Globale Keyboard-Shortcuts: Ctrl+N neue Session, Ctrl+Tab / Ctrl+Shift+Tab Wechsel.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.ctrlKey) return;
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setShowModal(true);
      } else if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) prevTab();
        else nextTab();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [nextTab, prevTab]);

  const handleClose = useCallback(
    async (sessionId: string) => {
      // Erst Server-Lifecycle-Patch (archiviert + killt PTY, falls running),
      // dann Tab-Eintrag aus dem Store entfernen — sonst würde ein noch laufender
      // PTY-Output ins Leere schreiben.
      const result = await window.api.sessions.close({ sessionId });
      if (!result.ok) {
        // Fehlerfall (Session in der DB nicht gefunden): trotzdem aus dem Renderer-State
        // entfernen, damit der Tab nicht „gespenstisch" hängenbleibt. Im Erfolgsfall identisch.
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
      const tab = addTab({
        title: input.title,
        type: input.type,
        model: input.model,
        cwd: settings.workspace_path,
      });
      // Diesen Tab als spawn-pflichtig markieren — TerminalTab feuert dann pty:create.
      setSpawnedIds((prev) => {
        const next = new Set(prev);
        next.add(tab.sessionId);
        return next;
      });
      setShowModal(false);
    },
    [addTab, settings.workspace_path],
  );

  return (
    <div className="td-tab-container">
      <TabBar
        tabs={tabs.map((t) => ({
          sessionId: t.sessionId,
          title: t.title,
          status: t.status,
          isActive: t.sessionId === activeId,
        }))}
        onSelect={setActive}
        onClose={handleClose}
        onResume={handleResume}
        onAdd={() => setShowModal(true)}
      />

      <div className="td-tab-host">
        {tabs.length === 0 && (
          <div className="td-tab-empty">
            <p>Keine Sessions geöffnet.</p>
            <p>
              <button
                type="button"
                className="td-tab-empty-cta"
                onClick={() => setShowModal(true)}
              >
                + Neue Session (Ctrl+N)
              </button>
            </p>
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

      {activeId && <NotesFooter sessionId={activeId} />}

      {showModal && (
        <NewSessionModal
          defaultModel={settings.default_model}
          onCancel={() => setShowModal(false)}
          onCreate={handleNewSession}
        />
      )}
    </div>
  );
}

interface TabBarProps {
  tabs: Array<{ sessionId: string; title: string; status: SessionStatus; isActive: boolean }>;
  onSelect: (sessionId: string) => void;
  onClose: (sessionId: string) => void;
  onResume: (sessionId: string) => void;
  onAdd: () => void;
}

function TabBar({ tabs, onSelect, onClose, onResume, onAdd }: TabBarProps) {
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
      <button type="button" className="td-tab-add" title="Neue Session (Ctrl+N)" onClick={onAdd}>
        +
      </button>
    </div>
  );
}

function StatusDot({ status }: { status: SessionStatus }) {
  return <span className={`td-status-dot ${status}`} aria-label={status} />;
}
