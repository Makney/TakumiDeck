import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  AppSettings,
  ProjectRow,
  SessionHistoryEntry,
  SessionStatus,
  SessionType,
} from '@shared/types';
import { DEFAULT_PROJECT_ID } from '@shared/constants';
import { useSessionStore } from '../stores/sessions';
import { useUiStore } from '../stores/ui';
import { displayProjectName } from '../components/displayProjectName';
import { estimateTerminalCols } from '../components/estimateTerminalCols';

// HistoryPane (Sprint 6, Q4 Variante A — Replace-View statt Modal).
//
// Lädt Sessions des aktiven Projekts via session:history, rendert eine Tabelle
// mit Filter-Bar und Detail-Pane (Notizen + Token-Total + Resume).
//
// Q5 Variante A: Resume-Klick auf eine Session, deren Tab bereits offen ist,
// fokussiert den existierenden Tab statt einen zweiten Spawn zu starten.
//
// Q8 Variante A: Sessions des Legacy-Buckets (DEFAULT_PROJECT_ID) sind sichtbar
// mit einem Hinweis-Banner — der TECH_SCHULDEN-Eintrag „Sprint-2/3-Legacy
// UI-blind bis Sprint 6" wird damit aufgelöst.

const TYPE_OPTIONS: SessionType[] = ['feature', 'bug', 'review', 'docs-sync'];
const TYPE_LABELS: Record<SessionType, string> = {
  feature: 'Feature',
  bug: 'Bug',
  review: 'Review',
  'docs-sync': 'Docs-Sync',
};

const STATUS_OPTIONS: SessionStatus[] = [
  'running',
  'idle',
  'completed',
  'interrupted',
  'error',
  'archived',
];
const STATUS_LABELS: Record<SessionStatus, string> = {
  running: 'läuft',
  waiting: 'wartet',
  idle: 'idle',
  completed: 'abgeschlossen',
  archived: 'archiviert',
  interrupted: 'unterbrochen',
  error: 'Fehler',
};

const MODEL_LABELS: Record<string, string> = {
  'claude-opus-4-7': 'Opus 4.7',
  'claude-opus-4-6': 'Opus 4.6',
  'claude-sonnet-4-6': 'Sonnet 4.6',
  'claude-sonnet-4-5': 'Sonnet 4.5',
  'claude-haiku-4-5': 'Haiku 4.5',
};

interface Props {
  project: ProjectRow;
  settings: AppSettings;
}

export function HistoryPane({ project, settings }: Props) {
  const [entries, setEntries] = useState<SessionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<SessionType[]>([]);
  const [selectedStatuses, setSelectedStatuses] = useState<SessionStatus[]>([]);
  const [query, setQuery] = useState('');
  const [archiveConfirmId, setArchiveConfirmId] = useState<string | null>(null);
  // Sprint 8 — gezielter Resume-Fehler-Hint für SESSION_NO_CLAUDE_UUID
  // (TECH_SCHULDEN „Pre-Hotfix-Sessions ohne JSONL-Antwort sind dauerhaft
  // resume-tot"). Direkt-Archivieren-Knopf statt nackter Fehlermeldung.
  const [resumeError, setResumeError] = useState<{
    sessionId: string;
    code: string | undefined;
    message: string;
  } | null>(null);

  const tabs = useSessionStore((s) => s.tabs);
  const addTab = useSessionStore((s) => s.addTab);
  const setActiveTab = useSessionStore((s) => s.setActive);
  const setStatus = useSessionStore((s) => s.setStatus);
  const setMainView = useUiStore((s) => s.setMainView);
  const selectedId = useUiStore((s) => s.historySelectedId);
  const setSelectedId = useUiStore((s) => s.setHistorySelected);

  // Filter-Reset bei Project-Wechsel — der UiStore räumt selectedId beim
  // Project-Wechsel selbst auf (siehe ui.ts), daher hier nur die Filter.
  useEffect(() => {
    setSelectedTypes([]);
    setSelectedStatuses([]);
    setQuery('');
    setArchiveConfirmId(null);
  }, [project.id]);

  // Live-Query bei jedem Filter-Change. Read-only-IPC, kein Side-Effect-Guard nötig
  // (Memory: useRef-Guard nur für Server-Mutationen). Default-Filter blendet
  // `archived` aus — sonst füllen alte weggeräumte Sessions die Liste; der User
  // muss `archived` explizit als Status-Filter wählen, um sie zu sehen.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const effectiveStatuses =
      selectedStatuses.length === 0
        ? (['running', 'idle', 'completed', 'interrupted', 'error'] as SessionStatus[])
        : selectedStatuses;
    void window.api.sessions
      .history({
        projectId: project.id,
        types: selectedTypes,
        statuses: effectiveStatuses,
        query: query.trim(),
      })
      .then((result) => {
        if (cancelled) return;
        if (result.ok) {
          setEntries(result.data);
        } else {
          setError(result.error);
          setEntries([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project.id, selectedTypes, selectedStatuses, query]);

  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  );

  const toggleType = (t: SessionType) => {
    setSelectedTypes((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };
  const toggleStatus = (s: SessionStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  };

  const handleResume = useCallback(
    async (entry: SessionHistoryEntry) => {
      // Q5 Variante A: existierenden Tab fokussieren statt zweiten Spawn.
      const existing = tabs.find((t) => t.sessionId === entry.id);
      if (existing) {
        setActiveTab(entry.id);
        setMainView('terminals');
        return;
      }
      if (entry.status === 'archived') {
        // Lifecycle erlaubt archived → running explizit NICHT (Sprint-3-State-Machine).
        setError('Archivierte Sessions können nicht resumed werden.');
        return;
      }
      // Tab in den Store legen — TerminalTab mountet, needsSpawn=false (kein
      // pty:create), Listener subscriben sich. Status running als optimistische
      // Annahme; das session:resume-IPC patcht den Lifecycle im Main.
      addTab({
        sessionId: entry.id,
        projectId: entry.project_id,
        title: entry.title,
        type: entry.type,
        model: entry.current_model ?? 'claude-sonnet-4-6',
        initialNotes: entry.notes_md,
      });
      // Sprint-9-Konsistenz mit TabContainer.handleResume: cols/rows aus der
      // aktuellen Mid-Column-Breite schätzen statt 80×24 hardcoded.
      const { cols, rows } = estimateTerminalCols(settings.terminal_font_size);
      const result = await window.api.sessions.resume({
        sessionId: entry.id,
        cols,
        rows,
      });
      if (!result.ok) {
        // Spezial-Fall SESSION_NO_CLAUDE_UUID (Sprint-6/7-Resume-Hotfix-Lücke):
        // Pre-Hotfix-Session ohne JSONL — Resume ist dauerhaft tot. Statt einer
        // nackten Fehlermeldung im globalen Error-Slot zeigen wir eine
        // gezielte Hint-Box im Detail-Pane mit Direkt-Archivieren.
        if (result.code === 'SESSION_NO_CLAUDE_UUID') {
          setResumeError({
            sessionId: entry.id,
            code: result.code,
            message: result.error,
          });
          return;
        }
        setError(`Resume fehlgeschlagen: ${result.error}`);
        return;
      }
      setResumeError(null);
      setStatus(entry.id, 'running');
      setMainView('terminals');
    },
    [tabs, addTab, setActiveTab, setStatus, setMainView, settings.terminal_font_size],
  );

  // Sprint 8 — Direkt-Archivieren ohne Confirm-Step für Resume-tote Sessions
  // (SESSION_NO_CLAUDE_UUID-Hint). Der Hint im Detail-Pane ist die
  // Confirm-Stufe, also bringt ein zweiter Klick keinen Mehrwert.
  const handleArchiveDirect = useCallback(
    async (entry: SessionHistoryEntry) => {
      const result = await window.api.sessions.archive({ sessionId: entry.id });
      if (!result.ok) {
        setError(`Archivieren fehlgeschlagen: ${result.error}`);
        return;
      }
      setResumeError(null);
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status: 'archived' as const } : e)),
      );
    },
    [],
  );

  const handleArchive = useCallback(
    async (entry: SessionHistoryEntry) => {
      // Zwei-Stufen-Confirmation: erster Klick aktiviert die Bestätigung,
      // zweiter Klick führt die Aktion aus. Verhindert versehentliche Archives,
      // ohne ein zusätzliches Modal-Overlay zu rendern.
      if (archiveConfirmId !== entry.id) {
        setArchiveConfirmId(entry.id);
        return;
      }
      const result = await window.api.sessions.archive({ sessionId: entry.id });
      setArchiveConfirmId(null);
      if (!result.ok) {
        setError(`Archivieren fehlgeschlagen: ${result.error}`);
        return;
      }
      // Liste lokal aktualisieren — refresh holt sie sonst per filter-Useeffect-Re-Run.
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, status: 'archived' as const } : e)),
      );
      // Bei aktivem Status-Filter ohne archived: Selection auf null, sonst zeigt
      // das Detail-Pane weiter den nun ausgeblendeten Eintrag.
      if (
        selectedStatuses.length > 0 &&
        !selectedStatuses.includes('archived')
      ) {
        setSelectedId(null);
      }
    },
    [archiveConfirmId, selectedStatuses, setSelectedId],
  );

  // Confirm-Marker abräumen, wenn der User die Selektion wechselt — sonst „klebt"
  // der Bestätigungs-Zustand auf der falschen Zeile.
  useEffect(() => {
    if (archiveConfirmId !== null && archiveConfirmId !== selectedId) {
      setArchiveConfirmId(null);
    }
  }, [selectedId, archiveConfirmId]);

  const isLegacy = project.id === DEFAULT_PROJECT_ID;

  return (
    <div className="td-history-pane">
      {isLegacy && (
        <div className="td-history-banner">
          Sessions aus Sprint 2/3, bevor der Workspace-Scanner echte Projekte erkannt
          hat. Resume bleibt funktionsfähig — neue Sessions starten direkt im erkannten
          Projekt.
        </div>
      )}

      <div className="td-history-header">
        <div className="td-history-title">
          Verlauf · {displayProjectName(project)}
          <span className="td-history-count">
            {loading ? '…' : `${entries.length} Sessions`}
          </span>
        </div>
        <button
          type="button"
          className="td-btn td-btn-ghost"
          onClick={() => setMainView('terminals')}
        >
          Zurück zu Tabs
        </button>
      </div>

      <div className="td-history-filters">
        <div className="td-history-filter-group">
          <span className="td-history-filter-label">Typ</span>
          <div className="td-form-pills">
            {TYPE_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                className={`td-pill ${selectedTypes.includes(t) ? 'active' : ''}`}
                onClick={() => toggleType(t)}
              >
                {TYPE_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="td-history-filter-group">
          <span className="td-history-filter-label">Status</span>
          <div className="td-form-pills">
            {STATUS_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className={`td-pill ${selectedStatuses.includes(s) ? 'active' : ''}`}
                onClick={() => toggleStatus(s)}
              >
                {STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="td-history-filter-group td-history-filter-query">
          <span className="td-history-filter-label">Suche</span>
          <input
            type="text"
            className="td-form-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Volltext im Titel"
          />
        </div>
      </div>

      {error && <div className="td-history-error">{error}</div>}

      <div className="td-history-body">
        <div className="td-history-table-wrap">
          <table className="td-history-table">
            <thead>
              <tr>
                <th className="td-history-col-season">#</th>
                <th className="td-history-col-type">Typ</th>
                <th>Name</th>
                <th>Status</th>
                <th>Modell</th>
                <th className="td-history-col-date">Datum</th>
                <th className="td-history-col-notes" title="Notizen vorhanden">📝</th>
                <th className="td-history-col-tokens">Tokens</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className={selectedId === entry.id ? 'selected' : ''}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <td className="td-history-col-season">
                    {entry.type === 'feature' && entry.season_number !== null
                      ? `#${entry.season_number}`
                      : ''}
                  </td>
                  <td className="td-history-col-type">{TYPE_LABELS[entry.type]}</td>
                  <td>{entry.title}</td>
                  <td>
                    <span className={`td-status-dot ${entry.status}`} aria-hidden />
                    <span className="td-history-status-label">
                      {STATUS_LABELS[entry.status]}
                    </span>
                  </td>
                  <td>{entry.current_model ? (MODEL_LABELS[entry.current_model] ?? entry.current_model) : '—'}</td>
                  <td className="td-history-col-date">{formatDate(entry.started_at)}</td>
                  <td className="td-history-col-notes">
                    {entry.notes_md.trim().length > 0 ? '✓' : ''}
                  </td>
                  <td className="td-history-col-tokens">
                    {(entry.tokens_in + entry.tokens_out).toLocaleString('de-DE')}
                  </td>
                </tr>
              ))}
              {!loading && entries.length === 0 && (
                <tr>
                  <td colSpan={8} className="td-history-empty">
                    {isLegacy
                      ? 'Keine Legacy-Sessions mehr — der Bucket leert sich beim nächsten App-Start automatisch.'
                      : 'Keine Sessions im Filter. Starte eine neue über die Tabs-Ansicht.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <aside className="td-history-detail">
          {selectedEntry ? (
            <HistoryDetail
              entry={selectedEntry}
              archiveConfirmActive={archiveConfirmId === selectedEntry.id}
              resumeBlockedHint={
                resumeError && resumeError.sessionId === selectedEntry.id
                  ? resumeError
                  : null
              }
              onResume={() => void handleResume(selectedEntry)}
              onArchive={() => void handleArchive(selectedEntry)}
              onArchiveDirect={() => void handleArchiveDirect(selectedEntry)}
              onCancelArchive={() => setArchiveConfirmId(null)}
            />
          ) : (
            <div className="td-history-detail-empty">
              Klick auf eine Session links für Notizen + Resume.
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

interface HistoryDetailProps {
  entry: SessionHistoryEntry;
  archiveConfirmActive: boolean;
  // Sprint 8: bei SESSION_NO_CLAUDE_UUID setzt der Resume-Handler den Hint —
  // Detail-Pane rendert dann eine Hint-Box mit Direkt-Archivieren-Knopf.
  resumeBlockedHint: { code: string | undefined; message: string } | null;
  onResume: () => void;
  onArchive: () => void;
  onArchiveDirect: () => void;
  onCancelArchive: () => void;
}

function HistoryDetail({
  entry,
  archiveConfirmActive,
  resumeBlockedHint,
  onResume,
  onArchive,
  onArchiveDirect,
  onCancelArchive,
}: HistoryDetailProps) {
  // Resume ist in der State-Machine (Sprint 3) für completed/interrupted/error/idle
  // erlaubt; running ist „läuft schon", archived ist Endzustand.
  const canResume =
    entry.status === 'completed' ||
    entry.status === 'interrupted' ||
    entry.status === 'error' ||
    entry.status === 'idle' ||
    entry.status === 'running';
  // Archive nur sinnvoll für nicht-archived und nicht-running. Running würde
  // einen aktiven PTY hinterlassen — den darf der User über × auf dem Tab killen,
  // archiv ist die Phase nach completed/interrupted/error.
  const canArchive =
    entry.status === 'completed' ||
    entry.status === 'interrupted' ||
    entry.status === 'error' ||
    entry.status === 'idle';
  return (
    <div className="td-history-detail-body">
      <div className="td-history-detail-header">
        <div className="td-history-detail-title">
          {entry.type === 'feature' && entry.season_number !== null
            ? `Season #${entry.season_number} · `
            : ''}
          {entry.title}
        </div>
        <div className="td-history-detail-meta">
          {STATUS_LABELS[entry.status]} · {formatDate(entry.started_at)}
          {entry.ended_at !== null ? ` → ${formatDate(entry.ended_at)}` : ''}
        </div>
      </div>

      <div className="td-history-detail-tokens">
        <div>
          <span className="td-history-detail-tokens-label">In</span>
          <strong>{entry.tokens_in.toLocaleString('de-DE')}</strong>
        </div>
        <div>
          <span className="td-history-detail-tokens-label">Out</span>
          <strong>{entry.tokens_out.toLocaleString('de-DE')}</strong>
        </div>
        <div>
          <span className="td-history-detail-tokens-label">Messages</span>
          <strong>{entry.message_count}</strong>
        </div>
      </div>

      <div className="td-history-detail-notes">
        <div className="td-history-detail-notes-label">Notizen</div>
        {entry.notes_md.trim().length > 0 ? (
          <pre>{entry.notes_md}</pre>
        ) : (
          <div className="td-history-detail-notes-empty">Keine Notizen.</div>
        )}
      </div>

      {resumeBlockedHint && resumeBlockedHint.code === 'SESSION_NO_CLAUDE_UUID' && (
        <div className="td-history-resume-blocked">
          <div className="td-history-resume-blocked-title">
            ⓘ Resume nicht möglich
          </div>
          <div className="td-history-resume-blocked-body">
            Diese Session stammt aus der Zeit vor dem Sprint-6-Resume-Hotfix und
            hat nie eine claude-Antwort produziert — die externe UUID ist nicht
            mehr rekonstruierbar. Resume bleibt dauerhaft tot.
          </div>
          <button
            type="button"
            className="td-btn td-btn-danger"
            onClick={onArchiveDirect}
          >
            Direkt archivieren
          </button>
        </div>
      )}

      <div className="td-history-detail-actions">
        {entry.status !== 'archived' && canArchive && (
          archiveConfirmActive ? (
            <div className="td-history-archive-confirm">
              <span className="td-form-meta">
                Wirklich archivieren? Session ist danach nicht mehr resume-fähig.
              </span>
              <button type="button" className="td-btn td-btn-ghost" onClick={onCancelArchive}>
                Abbrechen
              </button>
              <button
                type="button"
                className="td-btn td-btn-danger"
                onClick={onArchive}
              >
                Ja, archivieren
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="td-btn td-btn-ghost"
              onClick={onArchive}
              title="Session in den Archiv-Status verschieben (kein Resume mehr)"
            >
              Archivieren
            </button>
          )
        )}
        <button
          type="button"
          className="td-btn td-btn-primary"
          onClick={onResume}
          disabled={!canResume}
          title={
            canResume
              ? 'Session fortsetzen oder Tab fokussieren, falls bereits offen'
              : 'Status erlaubt kein Resume'
          }
        >
          {entry.status === 'running' ? 'Tab fokussieren' : 'Resume'}
        </button>
      </div>
    </div>
  );
}

function formatDate(epochMs: number): string {
  const d = new Date(epochMs);
  // Lokale Zeit auf zwei Zeilen wäre zu viel — kompakte ISO-ähnliche Form, ohne Sekunden.
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}
