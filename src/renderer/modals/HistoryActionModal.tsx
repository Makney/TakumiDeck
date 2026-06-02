import { useEffect, useState } from 'react';
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
  // Sprint-8-Settings-Default. Greift nur, wenn die Session keinen
  // `current_model` mehr in der DB hat (Architektur 6.2 Default-Hierarchie:
  // Per-Session > Global-Default). Null nur, solange App.tsx die Settings
  // noch lädt — extrem kurzes Fenster.
  defaultModel: string | null;
  // Aktuelle Terminal-Font-Size aus den Settings — für die Initial-cols/rows-
  // Schätzung beim Resume. Wird wie die anderen Resume-Pfade (TabContainer,
  // LeftSidebar, HistoryPane) durchgereicht, statt hier 14 hart zu setzen.
  terminalFontSize: number;
  onClose: () => void;
}

export function HistoryActionModal({
  entry,
  defaultModel,
  terminalFontSize,
  onClose,
}: Props) {
  const setHistorySelected = useUiStore((s) => s.setHistorySelected);
  const setMainView = useUiStore((s) => s.setMainView);
  const addTab = useSessionStore((s) => s.addTab);
  const setActive = useSessionStore((s) => s.setActive);
  const setStatus = useSessionStore((s) => s.setStatus);
  const tabs = useSessionStore((s) => s.tabs);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  // Season 37 (Worktree-Support): gesetzt, wenn der Worktree der archivierten
  // Session uncommittete/ungepushte Aenderungen hat — dann fragt das Modal nach,
  // statt den Worktree (und damit die Arbeit) stillschweigend zu entfernen.
  const [worktreeDirty, setWorktreeDirty] = useState<{
    uncommittedCount: number;
    ahead: number;
  } | null>(null);

  const canResume =
    entry.status !== 'archived' && entry.status !== 'running';
  const canArchive = entry.status !== 'archived';

  // Esc schließt das Modal — gleicher Handler wie in den anderen Modalen
  // (Architektur 6.0.1: Esc + Backdrop + ×-Button als drei Schließpfade).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
          customTypeLabel: entry.custom_type_label,
          model: entry.current_model ?? defaultModel ?? 'claude-sonnet-4-6',
          initialNotes: entry.notes_md,
        });
      }
      // Sprint 9 — cols/rows aus aktueller Mid-Column-Breite, sonst
      // schneidet xterm den Welcome-Output ab (siehe estimateTerminalCols).
      // Font-Size aus den Settings (wie die übrigen Resume-Pfade) — die
      // Schätzung gilt nur für die ersten ~100 ms, bis der Tab gemountet ist
      // und fit() die echten Werte schickt.
      const { cols, rows } = estimateTerminalCols(terminalFontSize);
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
    // Season 37: Worktree-Cleanup. No-op fuer normale Sessions (der Handler
    // liefert removed=false/dirty=false). Bei einem dirty Worktree fragt das
    // Modal nach, statt force zu entfernen.
    const wt = await window.api.git.worktreeRemove({ sessionId: entry.id, force: false });
    if (wt.ok && wt.data.dirty) {
      setWorktreeDirty({
        uncommittedCount: wt.data.uncommittedCount,
        ahead: wt.data.ahead,
      });
      setBusy(false);
      return; // Modal bleibt offen mit der Rueckfrage
    }
    onClose();
  };

  // Season 37: Worktree trotz uncommitteter/ungepushter Aenderungen entfernen.
  const handleForceRemoveWorktree = async () => {
    setError(null);
    setBusy(true);
    const wt = await window.api.git.worktreeRemove({ sessionId: entry.id, force: true });
    if (!wt.ok) {
      setError(`Worktree-Entfernen fehlgeschlagen: ${wt.error}`);
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
                  : entry.type === 'custom' && entry.custom_type_label
                    ? entry.custom_type_label
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

          {/* Season 37: Rueckfrage, wenn der Worktree der archivierten Session
              noch uncommittete/ungepushte Aenderungen haelt. */}
          {worktreeDirty && (
            <div className="td-history-action-worktree-warn">
              <p>
                Der Worktree dieser Session wurde <strong>nicht entfernt</strong>:
                {worktreeDirty.uncommittedCount > 0 && (
                  <> {worktreeDirty.uncommittedCount} uncommittete Datei(en)</>
                )}
                {worktreeDirty.uncommittedCount > 0 && worktreeDirty.ahead > 0 && ' ·'}
                {worktreeDirty.ahead > 0 && (
                  <> {worktreeDirty.ahead} ungepushte(r) Commit(s)</>
                )}
                . Die Session ist bereits archiviert.
              </p>
              <div className="td-history-action-worktree-actions">
                <button
                  type="button"
                  className="td-action-btn ghost"
                  onClick={onClose}
                  disabled={busy}
                  title="Worktree mit den Aenderungen behalten"
                >
                  Worktree behalten
                </button>
                <button
                  type="button"
                  className="td-action-btn"
                  onClick={handleForceRemoveWorktree}
                  disabled={busy}
                  title="Worktree trotzdem entfernen — uncommittete Aenderungen gehen verloren"
                  style={{ borderColor: 'var(--td-red)', color: 'var(--td-red)' }}
                >
                  ⚠ Trotzdem entfernen
                </button>
              </div>
            </div>
          )}

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
