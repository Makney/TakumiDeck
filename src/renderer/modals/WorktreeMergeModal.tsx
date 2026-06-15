import { useEffect, useState } from 'react';
import type {
  GitWorktreeMergePreviewResult,
  GitWorktreeMergeStrategy,
} from '@shared/types';

// WorktreeMergeModal (Phase 3 — In-App-Merge).
//
// Fuehrt den Branch einer Worktree-Session nach main/master zurueck. Der Merge
// laeuft serverseitig IM Haupt-Checkout (git:worktree-merge) — der muss dafuer
// auf dem Basis-Ref stehen und sauber sein. Das Modal zeigt diese Vorbedingungen
// vorab (git:worktree-merge-preview) und blockt den Button, statt einen Merge
// in den falschen Branch zu riskieren.
//
// Drei Ausgaenge:
//   - Erfolg → optionaler Cleanup (Worktree weg + Branch geloescht), onMerged().
//   - Konflikt → Server hat zurueckgerollt (Repo sauber), Modal listet die
//     Konfliktdateien; der User loest sie im Hauptordner manuell.
//   - Fast-forward nicht moeglich (nur strategy='ff-only') → Hinweis, andere
//     Strategie waehlen.

interface Props {
  sessionId: string;
  onClose: () => void;
  // Wird nach erfolgreichem Merge aufgerufen — der Aufrufer refresht dann seine
  // Worktree-Ansicht (der Worktree ist nach Cleanup ggf. weg).
  onMerged: () => void;
}

type Phase = 'loading' | 'form' | 'merging' | 'conflict';

const STRATEGY_LABELS: Record<GitWorktreeMergeStrategy, string> = {
  'merge-commit': 'Merge-Commit (--no-ff)',
  squash: 'Squash',
  'ff-only': 'Fast-forward only',
};

const STRATEGY_HINTS: Record<GitWorktreeMergeStrategy, string> = {
  'merge-commit': 'Erzeugt immer einen Merge-Commit; Branch-Verlauf bleibt sichtbar.',
  squash: 'Fasst alle Branch-Commits zu einem zusammen (linearer Verlauf).',
  'ff-only': 'Nur, wenn der Basis-Branch nicht divergiert ist — sonst Abbruch.',
};

export function WorktreeMergeModal({ sessionId, onClose, onMerged }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [preview, setPreview] = useState<GitWorktreeMergePreviewResult | null>(null);
  const [fileCount, setFileCount] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflictFiles, setConflictFiles] = useState<string[]>([]);
  const [ffFailed, setFfFailed] = useState(false);

  const [strategy, setStrategy] = useState<GitWorktreeMergeStrategy>('merge-commit');
  const [removeWorktree, setRemoveWorktree] = useState(true);
  const [deleteBranch, setDeleteBranch] = useState(true);

  // Esc schliesst — gleicher Schliesspfad wie in den anderen Modalen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Vorab-Stand + Datei-Anzahl laden.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      window.api.git.worktreeMergePreview({ sessionId }),
      window.api.git.worktreeDiff({ sessionId }),
    ]).then(([prevRes, diffRes]) => {
      if (cancelled) return;
      if (!prevRes.ok) {
        setLoadError(prevRes.error);
        setPhase('form');
        return;
      }
      setPreview(prevRes.data);
      if (diffRes.ok && diffRes.data.hasWorktree) {
        setFileCount(diffRes.data.files.length);
      }
      setPhase('form');
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Vorbedingungs-Auswertung fuer Banner + Button-Disable.
  const baseMismatch =
    preview !== null &&
    preview.hasWorktree &&
    preview.mainCurrentBranch !== preview.baseRef;
  const mainDirty = preview !== null && preview.hasWorktree && !preview.mainClean;
  const nothingToMerge = preview !== null && preview.hasWorktree && preview.ahead === 0;
  const worktreeDirty =
    preview !== null && preview.hasWorktree && preview.worktreeUncommittedCount > 0;

  const canMerge =
    phase === 'form' &&
    preview !== null &&
    preview.hasWorktree &&
    !baseMismatch &&
    !mainDirty &&
    !nothingToMerge;

  const handleMerge = async () => {
    setError(null);
    setPhase('merging');
    const result = await window.api.git.worktreeMerge({
      sessionId,
      strategy,
      removeWorktree,
      deleteBranch,
    });
    if (!result.ok) {
      setError(result.error);
      setPhase('form');
      return;
    }
    if (result.data.conflicted) {
      setConflictFiles(result.data.conflictFiles);
      setPhase('conflict');
      return;
    }
    if (result.data.ffFailed) {
      setFfFailed(true);
      setPhase('form');
      return;
    }
    // Erfolg.
    onMerged();
    onClose();
  };

  return (
    <div className="td-modal-backdrop" onClick={onClose}>
      <div
        className="td-modal td-merge-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="td-modal-header">
          <div className="td-modal-title">Worktree nach main mergen</div>
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
          {phase === 'loading' ? (
            <div className="td-skeleton">Lade Merge-Vorschau…</div>
          ) : loadError ? (
            <div className="td-history-action-error">
              Merge-Vorschau fehlgeschlagen: {loadError}
            </div>
          ) : preview === null || !preview.hasWorktree ? (
            <div className="td-skeleton">
              Diese Session läuft nicht in einem Worktree — kein Branch zum Mergen.
            </div>
          ) : phase === 'conflict' ? (
            <div className="td-merge-conflict">
              <p>
                <strong>Merge-Konflikt</strong> — der Merge wurde abgebrochen und der
                Hauptordner wieder sauber hinterlassen. Folgende Dateien kollidieren und
                müssen manuell gelöst werden (z.B. im Hauptordner via Terminal/Editor):
              </p>
              <ul className="td-merge-conflict-files">
                {conflictFiles.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              {/* Kopfzeile: Branch → Basis, Umfang. */}
              <div className="td-merge-summary">
                <span className="td-merge-branch">{preview.branch}</span>
                <span className="td-merge-arrow">→</span>
                <span className="td-merge-base">{preview.baseRef}</span>
                <span className="td-merge-scope">
                  {fileCount !== null ? `${fileCount} Datei(en) · ` : ''}
                  {preview.ahead} Commit(s) voraus
                  {preview.behind > 0 ? ` · ${preview.behind} hinterher` : ''}
                </span>
              </div>

              {/* Blockierende Vorbedingungen. */}
              {baseMismatch && (
                <div className="td-merge-block">
                  Haupt-Checkout steht auf <strong>{preview.mainCurrentBranch || '(detached)'}</strong>,
                  nicht auf <strong>{preview.baseRef}</strong>. Wechsle dort den Branch,
                  bevor du mergst.
                </div>
              )}
              {mainDirty && (
                <div className="td-merge-block">
                  Der Haupt-Checkout hat uncommittete Änderungen. Bitte erst committen
                  oder verwerfen, dann mergen.
                </div>
              )}
              {nothingToMerge && !baseMismatch && !mainDirty && (
                <div className="td-merge-block">
                  Der Branch ist <strong>{preview.baseRef}</strong> nicht voraus — nichts zu mergen.
                </div>
              )}

              {/* Nicht-blockierende Warnungen. */}
              {worktreeDirty && (
                <div className="td-merge-warn">
                  ⚠ {preview.worktreeUncommittedCount} uncommittete Datei(en) im Worktree
                  werden <strong>nicht</strong> mitgemergt — nur committete Commits wandern
                  nach {preview.baseRef}.
                </div>
              )}
              {ffFailed && (
                <div className="td-merge-warn">
                  Fast-forward nicht möglich — der Basis-Branch ist divergiert. Wähle
                  „Merge-Commit“ oder „Squash“.
                </div>
              )}

              {/* Strategie-Wahl. */}
              <fieldset className="td-merge-fieldset" disabled={phase === 'merging'}>
                <legend>Strategie</legend>
                {(Object.keys(STRATEGY_LABELS) as GitWorktreeMergeStrategy[]).map((s) => (
                  <label key={s} className="td-merge-radio">
                    <input
                      type="radio"
                      name="merge-strategy"
                      checked={strategy === s}
                      onChange={() => {
                        setStrategy(s);
                        setFfFailed(false);
                      }}
                    />
                    <span className="td-merge-radio-label">{STRATEGY_LABELS[s]}</span>
                    <span className="td-merge-radio-hint">{STRATEGY_HINTS[s]}</span>
                  </label>
                ))}
              </fieldset>

              {/* Cleanup-Optionen. */}
              <div className="td-merge-cleanup">
                <label className="td-merge-check">
                  <input
                    type="checkbox"
                    checked={removeWorktree}
                    disabled={phase === 'merging'}
                    onChange={(e) => setRemoveWorktree(e.target.checked)}
                  />
                  Worktree danach entfernen
                </label>
                <label className="td-merge-check">
                  <input
                    type="checkbox"
                    checked={deleteBranch}
                    disabled={phase === 'merging'}
                    onChange={(e) => setDeleteBranch(e.target.checked)}
                  />
                  Branch danach löschen
                </label>
              </div>

              {error && <div className="td-history-action-error">{error}</div>}
            </>
          )}
        </div>

        <div className="td-modal-footer td-history-action-footer">
          <span style={{ flex: 1 }} />
          {phase === 'conflict' ? (
            <button type="button" className="td-action-btn primary" onClick={onClose}>
              Schließen
            </button>
          ) : (
            <>
              <button
                type="button"
                className="td-action-btn ghost"
                onClick={onClose}
                disabled={phase === 'merging'}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="td-action-btn primary"
                onClick={handleMerge}
                disabled={!canMerge}
                title={canMerge ? 'Branch nach Basis-Branch mergen' : 'Vorbedingungen nicht erfüllt'}
              >
                {phase === 'merging' ? 'Merge läuft…' : '⤺ Mergen'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
