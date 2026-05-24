import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppSettings,
  ClaudeMdFrontmatter,
  GitFileChange,
  GitStatusResult,
  ProjectRow,
} from '@shared/types';
import { findSensitiveFiles } from '../components/sensitiveFiles';
import { canSendCommitTrigger } from '../components/preCommitGate';
import { useUiStore } from '../stores/ui';

// PreCommitModal (Sprint 7, Phase 7, Architektur 6.7).
//
// Q3 Variante A: eigener Modal, kein Inline-Drawer in der Action-Bar — der
// Trigger-Phrase-Send geht real an Claude und committed echte Dateien;
// ein bewusster Fokus-Wechsel ist Schutz, kein Friction-Bug.
//
// Aufbau:
//   - Branch-Anzeige + Counts
//   - Liste der geänderten Files mit Status-Mark
//   - Sensitive-File-Warnung (Q7 Variante A: hartcoded Patterns)
//   - „Send 'commit' to active session"-Button (sendet Trigger-Phrase aus
//     workbench.trigger_phrases.commit via td-template-send-CustomEvent —
//     Sprint-6-Bracketed-Paste-Mechanik)
//   - kein-Active-Terminal: Send-Button disabled mit klarem Hinweis
//   - kein-Git-Repo: Modal zeigt nur den Hinweis + Schließen-Button
//
// Wir RUFEN den Commit NICHT selbst (Architektur 6.7: „Kein eigener Commit
// durch die App"). Der Commit läuft über Claude Code, das die Trigger-Phrase
// als Befehls-Anker nutzt.

interface Props {
  project: ProjectRow;
  frontmatter: ClaudeMdFrontmatter | null;
  hasActiveTerminal: boolean;
  // Sprint-8: User-konfigurierbare Sensitive-Patterns aus den Settings.
  // Werden additiv zu den hartcoded Defaults ausgewertet.
  sensitivePatterns: AppSettings['sensitive_file_patterns'];
  onClose: () => void;
}

interface LoadState {
  status: GitStatusResult | null;
  loading: boolean;
  loadError: string | null;
  hasGit: boolean;
}

export function PreCommitModal({
  project,
  frontmatter,
  hasActiveTerminal,
  sensitivePatterns,
  onClose,
}: Props) {
  const [state, setState] = useState<LoadState>({
    status: null,
    loading: true,
    loadError: null,
    hasGit: true,
  });
  const [sent, setSent] = useState(false);
  // Phase-2 Season-29.5: harter Confirm-Gate fuer sensitive Files. User muss
  // die Checkbox explizit anhaken, bevor der Send-Button entsperrt. Bei
  // Modal-Re-Open ist der State automatisch auf false (frischer useState).
  const [sensitiveConfirmed, setSensitiveConfirmed] = useState(false);
  // Auto-Close-Timer-Handle nach erfolgreichem Trigger-Send. Cleanup beim
  // Unmount, sonst kann der Timer ein neu geoeffnetes Modal versehentlich
  // schliessen.
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, []);

  // Phase-2 Season-11: Frontmatter beim Modal-Open frisch laden. Sonst zeigt
  // der Commit-Trigger (workbench.trigger_phrases.commit) den Stand vom letzten
  // Project-Switch — wenn der User die Trigger-Phrase zwischenzeitlich in
  // CLAUDE.md geaendert hat, war die alte Phrase stale.
  const loadActiveProjectFrontmatter = useUiStore((s) => s.loadActiveProjectFrontmatter);
  useEffect(() => {
    void loadActiveProjectFrontmatter(project.id);
  }, [project.id, loadActiveProjectFrontmatter]);

  // Beim Mount git:status pullen. Read-only IPC, kein useRef-Guard
  // (Memory-Konvention: Guard nur für Server-Mutationen).
  useEffect(() => {
    let cancelled = false;
    void window.api.git.status({ projectId: project.id }).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setState({
          status: result.data,
          loading: false,
          loadError: null,
          hasGit: true,
        });
      } else if (result.code === 'NOT_A_GIT_REPO') {
        setState({ status: null, loading: false, loadError: null, hasGit: false });
      } else {
        setState({
          status: null,
          loading: false,
          loadError: result.error,
          hasGit: true,
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  // Esc schließt das Modal — gleicher Handler wie in den anderen Modals.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const triggerPhrase = frontmatter?.workbench.trigger_phrases.commit ?? 'commit';
  // changedFiles muss stabilisiert sein, sonst läuft das nachfolgende useMemo
  // bei jedem Render erneut (logical-or auf state.status?.files erzeugt jedes
  // Mal eine neue Array-Referenz).
  const changedFiles = useMemo(
    () => state.status?.files ?? [],
    [state.status],
  );
  const sensitive = useMemo(
    () => findSensitiveFiles(changedFiles.map((f) => f.path), sensitivePatterns),
    [changedFiles, sensitivePatterns],
  );

  const canSend = canSendCommitTrigger({
    hasGit: state.hasGit,
    loading: state.loading,
    loadError: state.loadError,
    hasActiveTerminal,
    changedFileCount: changedFiles.length,
    sensitiveFileCount: sensitive.length,
    sensitiveConfirmed,
    sent,
  });

  const handleSend = (): void => {
    // Trigger-Phrase ans aktive Terminal schicken via Bracketed-Paste-Event.
    // Phase-2 Season-3: submit: true → TerminalTab feuert nach dem Paste ein
    // separates \r an die PTY. Ein Newline IM Bracketed-Paste-Block wird von
    // claude-codes TUI als Shift+Enter (Newline einfügen) interpretiert, nicht
    // als Absende-Enter — daher Phrase ohne \n pasten und CR außerhalb senden.
    window.dispatchEvent(
      new CustomEvent<{ text: string; submit: boolean }>('td-template-send', {
        detail: { text: triggerPhrase, submit: true },
      }),
    );
    setSent(true);
    // Sprint 8 (V3-B): Header-Bar weiß nach erfolgreichem commit-Trigger nicht
    // automatisch, dass sich Branch-State ändern könnte (z.B. Detached-HEAD bei
    // Rebase, oder Working-Tree-Clean nach Commit). td-git-refresh-Event lädt
    // den Cache nach — billig, weil git:status read-only ist.
    window.dispatchEvent(new CustomEvent('td-git-refresh'));
    // Nach kurzer Bestaetigungs-Anzeige automatisch schliessen. Handle in
    // einem Ref halten, damit Unmount den Timer abbricht (s.o.).
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, 800);
  };

  return (
    <div className="td-modal-backdrop" onClick={onClose}>
      <div
        className="td-modal td-precommit-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="td-modal-header">
          <div className="td-modal-title">Commit-Trigger an Claude senden</div>
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
          {state.loading && <div className="td-skeleton">Lade git status…</div>}

          {!state.loading && !state.hasGit && (
            <div className="td-precommit-empty">
              Projekt „{project.name}“ ist kein Git-Repository — kein commit-Trigger
              möglich. Initialisiere das Repo via <code>git init</code>.
            </div>
          )}

          {!state.loading && state.loadError !== null && (
            <div className="td-md-error">
              git status fehlgeschlagen: {state.loadError}
            </div>
          )}

          {!state.loading && state.hasGit && state.status !== null && (
            <>
              <div className="td-precommit-meta">
                <span className="td-precommit-label">Branch</span>
                <code className="td-precommit-branch">{state.status.branch}</code>
                {state.status.ahead > 0 && (
                  <span className="td-precommit-ahead">↑ {state.status.ahead}</span>
                )}
                {state.status.behind > 0 && (
                  <span className="td-precommit-behind">↓ {state.status.behind}</span>
                )}
              </div>

              {sensitive.length > 0 && (
                <div className="td-precommit-warning">
                  <strong>⚠ Sensitive Dateien im Working-Tree:</strong>
                  <ul>
                    {sensitive.map((p) => (
                      <li key={p}>
                        <code>{p}</code>
                      </li>
                    ))}
                  </ul>
                  Prüfe, ob diese Dateien wirklich committed werden sollen, bevor
                  du den Trigger sendest.
                  {/* Phase-2 Season-29.5: harter Confirm-Gate. Send disabled,
                      bis der User die sensitive-Liste explizit bestaetigt. */}
                  <label className="td-precommit-confirm">
                    <input
                      type="checkbox"
                      checked={sensitiveConfirmed}
                      onChange={(e) => setSensitiveConfirmed(e.target.checked)}
                    />
                    <span>
                      Ich habe diese Dateien geprueft und moechte sie trotzdem committen.
                    </span>
                  </label>
                </div>
              )}

              {changedFiles.length === 0 ? (
                <div className="td-precommit-empty">
                  Keine geänderten Dateien — Working-Tree ist sauber.
                </div>
              ) : (
                <>
                  <div className="td-precommit-label">
                    Geänderte Dateien ({changedFiles.length})
                  </div>
                  <div className="td-precommit-files">
                    {changedFiles.map((f) => (
                      <FileRow key={f.path} file={f} sensitive={sensitive.includes(f.path)} />
                    ))}
                  </div>
                </>
              )}

              <div className="td-precommit-trigger-info">
                Trigger-Phrase aus <code>CLAUDE.md</code>:{' '}
                <code className="td-precommit-trigger">{triggerPhrase}</code>
              </div>
            </>
          )}
        </div>
        <div className="td-modal-footer">
          <button type="button" className="td-action-btn" onClick={onClose}>
            Abbrechen
          </button>
          <button
            type="button"
            className="td-action-btn primary"
            disabled={!canSend}
            onClick={handleSend}
            title={
              !state.hasGit
                ? 'Kein Git-Repository'
                : !hasActiveTerminal
                ? 'Keine aktive Terminal-Session'
                : changedFiles.length === 0
                ? 'Keine geänderten Dateien'
                : sensitive.length > 0 && !sensitiveConfirmed
                ? 'Bitte sensitive Dateien zuerst bestaetigen'
                : 'Trigger-Phrase ans aktive Terminal senden'
            }
          >
            {sent ? '✓ Gesendet' : `Send „${triggerPhrase}" an aktive Session`}
          </button>
        </div>
      </div>
    </div>
  );
}

interface FileRowProps {
  file: GitFileChange;
  sensitive: boolean;
}

function FileRow({ file, sensitive }: FileRowProps) {
  const mark = file.worktreeStatus !== 'unchanged' ? file.worktreeStatus : file.indexStatus;
  return (
    <div className={`td-precommit-file ${mark}${sensitive ? ' sensitive' : ''}`}>
      <span className="td-precommit-file-mark">{markChar(mark)}</span>
      <span className="td-precommit-file-path">{file.path}</span>
      {sensitive && <span className="td-precommit-file-warn">⚠ sensitive</span>}
    </div>
  );
}

function markChar(s: GitFileChange['worktreeStatus']): string {
  switch (s) {
    case 'modified':
      return 'M';
    case 'added':
      return 'A';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'untracked':
      return '?';
    case 'copied':
      return 'C';
    case 'unmerged':
      return 'U';
    default:
      return '·';
  }
}
