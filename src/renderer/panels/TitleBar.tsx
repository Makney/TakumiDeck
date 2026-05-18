import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ProjectRow, UpdaterState } from '@shared/types';
import { useProjectStore } from '../stores/projects';
import { useSessionStore } from '../stores/sessions';
import { useUiStore } from '../stores/ui';
import { displayProjectName } from '../components/displayProjectName';
import { useUpdaterState } from '../components/useUpdaterState';

// Sprint 8 — Header-Bar (Architektur 6.0, td-titlebar-Klassen aus
// docs/design/claude-export/styles.css Zeilen 62-118).
//
// Drei Sektionen:
//   1) Brand: Kanji + „TakumiDeck" + Version
//   2) Meta: aktives Projekt + Branch + Sessions-Counter + Status-Hinweis
//   3) Window-Controls (-webkit-app-region: no-drag, sonst zieht der Drag-Handle
//      die Klicks weg)
//
// Branch-Anzeige (V3-B): on-Demand-Cache, Refresh bei Trigger-Events
// (Project-Wechsel, td-git-refresh-CustomEvent), plus manueller Refresh-Knopf.
// Polling bewusst ausgelassen — Branch-Wechsel sind selten in einem
// Solo-Dev-Workflow.

interface Props {
  version: string;
}

interface BranchState {
  status: 'idle' | 'loading' | 'loaded' | 'no-git' | 'error';
  branch: string | null;
  lastError: string | null;
}

export function TitleBar({ version }: Props) {
  const projects = useProjectStore((s) => s.projects);
  const activeProjectId = useUiStore((s) => s.activeProjectId);
  const setShowSettingsModal = useUiStore((s) => s.setShowSettingsModal);
  const tabs = useSessionStore((s) => s.tabs);

  const activeProject: ProjectRow | null = useMemo(
    () =>
      activeProjectId ? projects.find((p) => p.id === activeProjectId) ?? null : null,
    [projects, activeProjectId],
  );

  const sessionCounts = useMemo(() => {
    if (!activeProjectId) return { running: 0, total: 0 };
    let running = 0;
    let total = 0;
    for (const t of tabs) {
      if (t.projectId !== activeProjectId) continue;
      total += 1;
      if (t.status === 'running') running += 1;
    }
    return { running, total };
  }, [tabs, activeProjectId]);

  const [branchState, setBranchState] = useState<BranchState>({
    status: 'idle',
    branch: null,
    lastError: null,
  });

  // Sprint 8 — claude-Binary-Health-Check (V7-C: User-freundliche Aktion vorne,
  // Details on-Demand). Der Banner erscheint nur, wenn der Pre-Check fehlschlägt;
  // Klick auf den Banner öffnet die Settings (claude_binary_path).
  const [claudeHealth, setClaudeHealth] = useState<
    | { kind: 'unknown' }
    | { kind: 'healthy' }
    | { kind: 'unhealthy'; hint: string }
  >({ kind: 'unknown' });

  useEffect(() => {
    let cancelled = false;
    void window.api.app.claudeHealth().then((result) => {
      if (cancelled) return;
      if (!result.ok) {
        setClaudeHealth({ kind: 'unhealthy', hint: result.error });
        return;
      }
      if (result.data.healthy) setClaudeHealth({ kind: 'healthy' });
      else setClaudeHealth({ kind: 'unhealthy', hint: result.data.hint });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Health-Re-Check bei PTY-Spawn-Fehler (TerminalTab feuert das CustomEvent,
  // wenn pty:create scheitert — siehe Phase-2-Erweiterung in Sprint 8).
  useEffect(() => {
    const handler = () => {
      void window.api.app.claudeHealth().then((result) => {
        if (!result.ok) {
          setClaudeHealth({ kind: 'unhealthy', hint: result.error });
          return;
        }
        if (result.data.healthy) setClaudeHealth({ kind: 'healthy' });
        else setClaudeHealth({ kind: 'unhealthy', hint: result.data.hint });
      });
    };
    window.addEventListener('td-claude-recheck', handler);
    return () => window.removeEventListener('td-claude-recheck', handler);
  }, []);

  // Branch-Loader: nur wenn aktives Projekt + Git-Repo vorhanden. Read-only IPC,
  // kein useRef-Guard nötig (Memory: Guard nur für Server-Mutationen).
  const loadBranch = useCallback(async () => {
    if (!activeProjectId) {
      setBranchState({ status: 'idle', branch: null, lastError: null });
      return;
    }
    setBranchState((prev) => ({ ...prev, status: 'loading' }));
    const result = await window.api.git.status({ projectId: activeProjectId });
    if (result.ok) {
      setBranchState({
        status: 'loaded',
        branch: result.data.branch,
        lastError: null,
      });
    } else if (result.code === 'NOT_A_GIT_REPO') {
      setBranchState({ status: 'no-git', branch: null, lastError: null });
    } else {
      setBranchState({ status: 'error', branch: null, lastError: result.error });
    }
  }, [activeProjectId]);

  // Trigger-Event-1: Projektwechsel → Branch neu laden.
  useEffect(() => {
    void loadBranch();
  }, [loadBranch]);

  // Trigger-Event-2: PreCommit-Send oder externer Branch-Wechsel-Hint
  // (CustomEvent 'td-git-refresh' kann von beliebigen Komponenten gefeuert
  // werden, sobald ein Git-State-Change zu erwarten ist).
  useEffect(() => {
    const handler = () => void loadBranch();
    window.addEventListener('td-git-refresh', handler);
    return () => window.removeEventListener('td-git-refresh', handler);
  }, [loadBranch]);

  const handleWindowAction = (action: 'minimize' | 'maximize' | 'close') => {
    void window.api.app.windowAction(action);
  };

  return (
    <header className="td-titlebar">
      <div className="td-brand">
        <span className="td-kanji" aria-hidden>匠</span>
        <span>
          <b>Takumi</b>Deck
        </span>
        <span className="td-version">v{version}</span>
      </div>

      <div className="td-titlebar-meta">
        {claudeHealth.kind === 'unhealthy' && (
          <button
            type="button"
            className="td-titlebar-meta-item warning td-titlebar-claude-banner"
            onClick={() => setShowSettingsModal(true)}
            title={`${claudeHealth.hint}\n\nKlick: Einstellungen → Allgemein → claude-Binary-Pfad`}
          >
            ⚠ claude-Binary nicht gefunden — anpassen
          </button>
        )}
        <UpdaterBanner />
        {activeProject ? (
          <span className="td-titlebar-meta-item" title="Aktives Projekt">
            <span aria-hidden>▣</span>{' '}
            <strong>{displayProjectName(activeProject)}</strong>
          </span>
        ) : (
          <span className="td-titlebar-meta-item">Kein Projekt aktiv</span>
        )}

        {activeProject && (
          <BranchBadge state={branchState} onRefresh={() => void loadBranch()} />
        )}

        {activeProject && (
          <span className="td-titlebar-meta-item" title="Sessions im aktiven Projekt">
            <span aria-hidden>⚆</span> {sessionCounts.running}/{sessionCounts.total} Sessions
          </span>
        )}
      </div>

      <div className="td-spacer" />

      {/* Sprint 9 (C5) — System-Status-Slot rechts vor den Icons nach Vorlage
          (app.jsx 276-279). Statisch im MVP — Phase 2 kann den Text dynamisch
          machen (z.B. „Markdown-Editor" wenn Mid-Pane auf Editor steht,
          „History" wenn HistoryPane offen ist). */}
      <span
        className="td-titlebar-meta-item td-titlebar-system-status"
        title="App-Modus + P90-Fenster"
      >
        Terminal · P90 {/* hardcoded 192 — Phase 2: aus settings.p90_window_hours ziehen */}192 h
      </span>

      <div className="td-icons">
        <button
          type="button"
          onClick={() => setShowSettingsModal(true)}
          title="Einstellungen (Ctrl+K)"
          aria-label="Einstellungen"
        >
          ⚙
        </button>
        <button
          type="button"
          onClick={() => handleWindowAction('minimize')}
          title="Minimieren"
          aria-label="Minimieren"
        >
          ─
        </button>
        <button
          type="button"
          onClick={() => handleWindowAction('maximize')}
          title="Maximieren / wiederherstellen"
          aria-label="Maximieren"
        >
          ▢
        </button>
        <button
          type="button"
          className="td-close"
          onClick={() => handleWindowAction('close')}
          title="Schließen"
          aria-label="Schließen"
        >
          ×
        </button>
      </div>
    </header>
  );
}

// Phase-2 Season-26: Auto-Update-Banner analog zum Claude-Health-Banner.
// Vier sichtbare States; 'idle' / 'checking' / 'no-update' / 'disabled-dev'
// rendern nichts (Banner wuerde sonst flackernd auf und zu gehen).
function UpdaterBanner() {
  const state = useUpdaterState();
  const [busy, setBusy] = useState(false);

  if (
    state.kind === 'idle' ||
    state.kind === 'checking' ||
    state.kind === 'no-update' ||
    state.kind === 'disabled-dev'
  ) {
    return null;
  }

  return (
    <UpdaterBannerBody
      state={state}
      busy={busy}
      onStartDownload={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await window.api.updater.startDownload();
        } finally {
          setBusy(false);
        }
      }}
      onInstall={async () => {
        if (busy) return;
        setBusy(true);
        try {
          await window.api.updater.quitAndInstall();
        } finally {
          setBusy(false);
        }
      }}
    />
  );
}

function UpdaterBannerBody({
  state,
  busy,
  onStartDownload,
  onInstall,
}: {
  state: Extract<
    UpdaterState,
    { kind: 'available' | 'downloading' | 'downloaded' | 'error' }
  >;
  busy: boolean;
  onStartDownload: () => void;
  onInstall: () => void;
}) {
  if (state.kind === 'available') {
    return (
      <button
        type="button"
        className="td-titlebar-meta-item td-titlebar-updater-banner"
        onClick={onStartDownload}
        disabled={busy}
        title={`Neue Version v${state.version} verfuegbar — klicken zum Herunterladen`}
      >
        📦 Update v{state.version} verfuegbar — Download
      </button>
    );
  }
  if (state.kind === 'downloading') {
    return (
      <span
        className="td-titlebar-meta-item td-titlebar-updater-banner"
        title={`Lade Update v${state.version}`}
      >
        ⬇ Lade v{state.version} … {state.percent}%
      </span>
    );
  }
  if (state.kind === 'downloaded') {
    return (
      <button
        type="button"
        className="td-titlebar-meta-item td-titlebar-updater-banner ready"
        onClick={onInstall}
        disabled={busy}
        title={`Update v${state.version} ist bereit — App neu starten zum Installieren`}
      >
        ✅ Update v{state.version} bereit — Jetzt installieren
      </button>
    );
  }
  return (
    <span
      className="td-titlebar-meta-item warning"
      title={state.message}
    >
      ⚠ Update-Fehler
    </span>
  );
}

function BranchBadge({
  state,
  onRefresh,
}: {
  state: BranchState;
  onRefresh: () => void;
}) {
  if (state.status === 'no-git') {
    return (
      <span className="td-titlebar-meta-item" title="Kein Git-Repository">
        <span aria-hidden>⎇</span> kein Git
      </span>
    );
  }
  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <span className="td-titlebar-meta-item">
        <span aria-hidden>⎇</span> …
      </span>
    );
  }
  if (state.status === 'error') {
    return (
      <span
        className="td-titlebar-meta-item warning"
        title={state.lastError ?? 'git status fehlgeschlagen'}
      >
        <span aria-hidden>⎇</span> ?
        <button
          type="button"
          className="td-titlebar-refresh"
          onClick={onRefresh}
          title="Branch erneut laden"
        >
          ↻
        </button>
      </span>
    );
  }
  return (
    <span className="td-titlebar-meta-item" title="Aktiver Git-Branch">
      <span aria-hidden>⎇</span> <strong>{state.branch}</strong>
      <button
        type="button"
        className="td-titlebar-refresh"
        onClick={onRefresh}
        title="Branch neu laden"
      >
        ↻
      </button>
    </span>
  );
}
