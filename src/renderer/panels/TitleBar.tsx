import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GitBranchInfo, ProjectRow, UpdaterState } from '@shared/types';
import { useProjectStore } from '../stores/projects';
import { useSessionStore } from '../stores/sessions';
import { useUiStore } from '../stores/ui';
import { displayProjectName } from '../components/displayProjectName';
import { describeCheckoutResult } from '../components/branchOpMessages';
import { useUpdaterState } from '../components/useUpdaterState';
import logoUrl from '../assets/logo.png';

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
  // P90-Fenster (Stunden) aus den Settings — gleiche Quelle wie PlanPane, damit
  // die TitleBar-Anzeige bei einer Settings-Aenderung nicht auf 192 h haengt.
  p90WindowHours: number;
}

interface BranchState {
  status: 'idle' | 'loading' | 'loaded' | 'no-git' | 'error';
  branch: string | null;
  lastError: string | null;
}

export function TitleBar({ version, p90WindowHours }: Props) {
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

  // Bereich-PANELS-Review 4.3: gemeinsame Auswerte-Logik fuer beide Health-
  // Trigger (Initial-Check + Re-Check). Vorher war der result.ok/healthy-Block
  // in beiden Effekten dupliziert.
  const applyHealthResult = useCallback(
    (result: Awaited<ReturnType<typeof window.api.app.claudeHealth>>) => {
      if (!result.ok) {
        setClaudeHealth({ kind: 'unhealthy', hint: result.error });
        return;
      }
      if (result.data.healthy) setClaudeHealth({ kind: 'healthy' });
      else setClaudeHealth({ kind: 'unhealthy', hint: result.data.hint });
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void window.api.app.claudeHealth().then((result) => {
      if (cancelled) return;
      applyHealthResult(result);
    });
    return () => {
      cancelled = true;
    };
  }, [applyHealthResult]);

  // Health-Re-Check bei PTY-Spawn-Fehler (TerminalTab feuert das CustomEvent,
  // wenn pty:create scheitert — siehe Phase-2-Erweiterung in Sprint 8).
  useEffect(() => {
    const handler = () => {
      void window.api.app.claudeHealth().then(applyHealthResult);
    };
    window.addEventListener('td-claude-recheck', handler);
    return () => window.removeEventListener('td-claude-recheck', handler);
  }, [applyHealthResult]);

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
        <img src={logoUrl} alt="" className="td-brand-logo" aria-hidden />
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

        {activeProject && activeProjectId && (
          <BranchBadge
            state={branchState}
            projectId={activeProjectId}
            onRefresh={() => void loadBranch()}
          />
        )}

        {activeProject && (
          <span className="td-titlebar-meta-item" title="Sessions im aktiven Projekt">
            <span aria-hidden>⚆</span> {sessionCounts.running}/{sessionCounts.total} Sessions
          </span>
        )}
      </div>

      <div className="td-spacer" />

      {/* Sprint 9 (C5) — System-Status-Slot rechts vor den Icons nach Vorlage
          (app.jsx 276-279). Der Modus-Text („Terminal") ist noch statisch —
          Phase 2 kann ihn dynamisch machen (z.B. „Markdown-Editor" wenn Mid-Pane
          auf Editor steht, „History" wenn HistoryPane offen ist). Das P90-Fenster
          kommt aus den Settings. */}
      <span
        className="td-titlebar-meta-item td-titlebar-system-status"
        title="App-Modus + P90-Fenster"
      >
        Terminal · P90 {p90WindowHours} h
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
  projectId,
  onRefresh,
}: {
  state: BranchState;
  projectId: string;
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
    <BranchSwitcher branch={state.branch ?? ''} projectId={projectId} onRefresh={onRefresh} />
  );
}

// Season 38: Branch-Badge mit Switch-Dropdown. Laedt die Branch-Liste erst beim
// Oeffnen (kein Dauer-Fetch im Header). Switch laeuft ohne Auto-Stash — bei
// dirty Working-Tree verweist der Toast aufs Sidebar-Branches-Panel, wo die
// Stash-Rueckfrage sitzt.
function BranchSwitcher({
  branch,
  projectId,
  onRefresh,
}: {
  branch: string;
  projectId: string;
  onRefresh: () => void;
}) {
  const flashToast = useUiStore((s) => s.flashToast);
  const [open, setOpen] = useState(false);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  // Click-away schliesst das Dropdown.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) {
      setLoading(true);
      void window.api.git.branchOverview({ projectId }).then((res) => {
        setLoading(false);
        setBranches(res.ok ? res.data.branches : []);
      });
    }
  };

  const handleSwitch = async (target: GitBranchInfo) => {
    if (target.isCurrent || target.checkedOutPath !== null) return;
    setBusy(true);
    try {
      const res = await window.api.git.checkout({ projectId, branch: target.name, autoStash: false });
      if (!res.ok) {
        flashToast(res.error);
        return;
      }
      if (res.data.status === 'switched') {
        // Globales Branch-Refresh (TitleBar-Badge + Sidebar-Panel laden neu).
        window.dispatchEvent(new CustomEvent('td-git-refresh'));
        flashToast(describeCheckoutResult(res.data));
        setOpen(false);
      } else if (res.data.status === 'dirty') {
        flashToast('Working-Tree nicht sauber — im Branches-Panel „Stashen & wechseln"');
        setOpen(false);
      } else {
        flashToast(describeCheckoutResult(res.data));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="td-titlebar-meta-item td-branch-switcher" ref={wrapRef}>
      <button
        type="button"
        className="td-branch-switcher-btn"
        onClick={toggle}
        title="Branch wechseln"
        disabled={busy}
      >
        <span aria-hidden>⎇</span> <strong>{branch}</strong> <span aria-hidden>▾</span>
      </button>
      <button
        type="button"
        className="td-titlebar-refresh"
        onClick={onRefresh}
        title="Branch neu laden"
      >
        ↻
      </button>
      {open && (
        <div className="td-branch-switcher-menu">
          {loading && <div className="td-branch-switcher-empty">Lade…</div>}
          {!loading && branches.length === 0 && (
            <div className="td-branch-switcher-empty">Keine Branches.</div>
          )}
          {!loading &&
            branches.map((b) => {
              const locked = b.checkedOutPath !== null && !b.isCurrent;
              return (
                <button
                  key={b.name}
                  type="button"
                  className={`td-branch-switcher-item${b.isCurrent ? ' current' : ''}${
                    locked ? ' locked' : ''
                  }`}
                  onClick={() => void handleSwitch(b)}
                  disabled={b.isCurrent || locked || busy}
                  title={
                    locked
                      ? `In Worktree ausgecheckt: ${b.checkedOutPath}`
                      : b.isCurrent
                        ? 'Aktueller Branch'
                        : `Auf „${b.name}" wechseln`
                  }
                >
                  <span aria-hidden>{b.isCurrent ? '●' : locked ? '⊗' : '⎇'}</span> {b.name}
                </button>
              );
            })}
        </div>
      )}
    </span>
  );
}
