import { useEffect, useState } from 'react';
import type { ProjectRow } from '@shared/types';
import { displayProjectName } from '../components/displayProjectName';

// RemoveProjectModal (Phase-2 Season-8).
//
// Bestätigungs-Dialog für „Projekt aus Liste entfernen". Der Hinweis-Text macht
// transparent, dass die historischen Sessions im Legacy-Bucket weiterleben — wer
// hier klickt, will das Projekt aus der Sidebar werfen, nicht den Verlauf löschen.
// Die Confirmation ist ein eigener Modal statt Inline-„⚠ Wirklich?", weil der
// erklärende Text in einem einzelnen Button-Wechsel nicht unterzubringen wäre.

interface Props {
  project: ProjectRow;
  // Optional: Zahl der offenen Tabs des Projekts. Wird im Body angezeigt, damit
  // der User vor dem OK weiß, dass dabei laufende PTYs geschlossen werden.
  openTabCount: number;
  busy: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

export function RemoveProjectModal({
  project,
  openTabCount,
  busy,
  error,
  onConfirm,
  onClose,
}: Props) {
  // Lokale Confirm-Stufe: erster Klick auf „Entfernen" zeigt eine zweite Bestätigung;
  // zweiter Klick triggert tatsächlich. Doppel-Confirmation analog zum
  // HistoryActionModal — der erklärende Text steht im Body, die Stufe sitzt
  // im Footer-Button.
  const [confirmStage, setConfirmStage] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const handlePrimary = () => {
    if (!confirmStage) {
      setConfirmStage(true);
      return;
    }
    onConfirm();
  };

  return (
    <div
      className="td-modal-backdrop"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        className="td-modal td-remove-project-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="td-remove-project-title"
      >
        <div className="td-modal-header">
          <div className="td-modal-title" id="td-remove-project-title">
            Projekt aus Liste entfernen
          </div>
          <button
            type="button"
            className="td-modal-close"
            onClick={onClose}
            disabled={busy}
            aria-label="Schließen"
          >
            ×
          </button>
        </div>

        <div className="td-modal-body">
          <p className="td-remove-project-lead">
            <strong>{displayProjectName(project)}</strong> wird aus der Projekt-
            Liste entfernt.
          </p>
          <p className="td-remove-project-hint">
            Sessions und Verlauf bleiben erhalten und wandern in den Legacy-Bucket.
            Der Projekt-Ordner auf der Festplatte wird nicht angefasst.
          </p>
          {openTabCount > 0 && (
            <p className="td-remove-project-warn">
              ⚠ {openTabCount === 1
                ? '1 offener Session-Tab'
                : `${openTabCount} offene Session-Tabs`}{' '}
              {openTabCount === 1 ? 'wird' : 'werden'} geschlossen
              (laufende PTYs werden beendet, Sessions wandern in den Verlauf).
            </p>
          )}
          {error && <div className="td-remove-project-error">{error}</div>}
        </div>

        <div className="td-modal-footer td-remove-project-footer">
          <button
            type="button"
            className="td-action-btn ghost"
            onClick={onClose}
            disabled={busy}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="td-action-btn"
            onClick={handlePrimary}
            disabled={busy}
            style={
              confirmStage
                ? { borderColor: 'var(--td-red)', color: 'var(--td-red)' }
                : undefined
            }
            title={
              confirmStage
                ? 'Klick erneut zum Bestätigen'
                : 'Projekt aus der Liste entfernen'
            }
          >
            {confirmStage ? '⚠ Wirklich entfernen?' : '⌧ Entfernen'}
          </button>
        </div>
      </div>
    </div>
  );
}
