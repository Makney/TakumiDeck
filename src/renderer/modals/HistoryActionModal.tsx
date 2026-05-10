import { useState } from 'react';
import type { SessionHistoryEntry } from '@shared/types';
import { useUiStore } from '../stores/ui';
import { useSessionStore } from '../stores/sessions';
import { fmtTokens } from '../components/fmtTokens';
import { estimateTerminalCols } from '../components/estimateTerminalCols';

// HistoryActionModal (Sprint 9).
//
// Klick auf einen Verlauf-Eintrag in der linken Sidebar-Quickliste öffnet
// dieses kleine Auswahl-Modal statt der HistoryPane-Replace-View. Drei
// Wege aus dem Modal heraus:
//
//   - Resume: Session als Tab öffnen + claude-Prozess wieder hochfahren.
//   - Archivieren: Status auf `archived` patchen (mit Inline-Confirmation).
//   - „Im Verlauf öffnen": Standard-HistoryPane mit Vorauswahl — für die
//     ausführliche Tabellen-Ansicht (alle Sessions des Projekts).
//
// Resume-Logik ist absichtlich dupliziert (statt aus der HistoryPane
// extrahiert), weil das Modal stand-alone ist und sonst eine geteilte
// Hook-Funktion bräuchte; bei zwei Aufrufstellen ist Inline einfacher.

interface Props {
  entry: SessionHistoryEntry;
  onClose: () => void;
}

export function HistoryActionModal({ entry, onClose }: Props) {
  const setHistorySelected = useUiStore((s) => s.setHistorySelected);
  const setMainView = useUiStore((s) => s.setMainView);
  const addTab = useSessionStore((s) => s.addTab);
  const setActive = useSessionStore((s) => s.setActive);
  const setStatus = useSessionStore((s) => s.setStatus);
  const tabs = useSessionStore((s) => s.tabs);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  const canResume =
    entry.status !== 'archived' && entry.status !== 'running';
  const canArchive = entry.status !== 'archived';

  const handleResume = async () => {
    setError(null);
    setBusy(true);
    try {
      // Wenn schon ein Tab für diese Session offen ist, nur fokussieren.
      const existing = tabs.find((t) => t.sessionId === entry.id);
      if (!existing) {
        addTab({
          sessionId: entry.id,
          projectId: entry.project_id,
          title: entry.title,
          type: entry.type,
          model: entry.current_model ?? 'claude-sonnet-4-6',
          cwd: entry.cwd,
          initialNotes: entry.notes_md,
        });
      }
      // Sprint 9 — cols/rows aus aktueller Mid-Column-Breite, sonst
      // schneidet xterm den Welcome-Output ab (siehe estimateTerminalCols).
      // Default-Font-Size 14 ist robust für die ersten ~100 ms bis der
      // Tab gemountet ist und fit() die echten Werte schickt.
      const { cols, rows } = estimateTerminalCols(14);
      const result = await window.api.sessions.resume({
        sessionId: entry.id,
        cols,
        rows,
      });
      if (!result.ok) {
        setError(`Resume fehlgeschlagen: ${result.error}`);
        setBusy(false);
        return;
      }
      setStatus(entry.id, 'running');
      setActive(entry.id);
      setMainView('terminals');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const handleArchive = async () => {
    if (!archiveConfirm) {
      setArchiveConfirm(true);
      return;
    }
    setError(null);
    setBusy(true);
    const result = await window.api.sessions.archive({ sessionId: entry.id });
    if (!result.ok) {
      setError(`Archivieren fehlgeschlagen: ${result.error}`);
      setBusy(false);
      return;
    }
    onClose();
  };

  const handleOpenInHistory = () => {
    setHistorySelected(entry.id);
    setMainView('history');
    onClose();
  };

  const totalTokens = entry.tokens_in + entry.tokens_out;
  const dateStr = new Date(entry.started_at).toLocaleString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="td-modal-backdrop" onClick={onClose}>
      <div
        className="td-modal td-history-action-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="td-modal-header">
          <div className="td-modal-title">{entry.title}</div>
          <button
            type="button"
            className="td-modal-close"
            onClick={onClose}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        <div className="td-modal-body">
          <div className="td-history-action-meta">
            <div>
              <span className="td-history-action-meta-label">Typ</span>
              <span className="td-history-action-meta-value">
                {entry.season_number !== null
                  ? `Season ${entry.season_number}`
                  : entry.type}
              </span>
            </div>
            <div>
              <span className="td-history-action-meta-label">Status</span>
              <span className="td-history-action-meta-value">{entry.status}</span>
            </div>
            <div>
              <span className="td-history-action-meta-label">Modell</span>
              <span className="td-history-action-meta-value">
                {entry.current_model ?? '—'}
              </span>
            </div>
            <div>
              <span className="td-history-action-meta-label">Gestartet</span>
              <span className="td-history-action-meta-value">{dateStr}</span>
            </div>
            <div>
              <span className="td-history-action-meta-label">Tokens</span>
              <span className="td-history-action-meta-value">
                {fmtTokens(totalTokens)}{' '}
                <span className="td-history-action-meta-sub">
                  ({entry.message_count} Msg)
                </span>
              </span>
            </div>
          </div>

          {error && <div className="td-history-action-error">{error}</div>}
        </div>

        <div className="td-modal-footer td-history-action-footer">
          <button
            type="button"
            className="td-action-btn ghost"
            onClick={handleOpenInHistory}
            disabled={busy}
            title="Vollständige Verlauf-Tabelle öffnen"
          >
            → Im Verlauf öffnen
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className={`td-action-btn ${archiveConfirm ? 'ghost' : ''}`}
            onClick={handleArchive}
            disabled={busy || !canArchive}
            title={
              !canArchive
                ? 'Session ist bereits archiviert'
                : archiveConfirm
                  ? 'Klick erneut zum Bestätigen'
                  : 'Session archivieren'
            }
            style={
              archiveConfirm
                ? { borderColor: 'var(--td-red)', color: 'var(--td-red)' }
                : undefined
            }
          >
            {archiveConfirm ? '⚠ Wirklich archivieren?' : '⌧ Archivieren'}
          </button>
          <button
            type="button"
            className="td-action-btn primary"
            onClick={handleResume}
            disabled={busy || !canResume}
            title={
              !canResume
                ? entry.status === 'archived'
                  ? 'Archivierte Sessions können nicht resumed werden'
                  : 'Session läuft bereits'
                : 'Session als Tab öffnen und claude-Prozess starten'
            }
          >
            ↻ Resume
          </button>
        </div>
      </div>
    </div>
  );
}
