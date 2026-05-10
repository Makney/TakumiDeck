import { useEffect, useMemo, useState } from 'react';
import type {
  ClaudeMdFrontmatter,
  GitFileChange,
  GitStatusResult,
  ProjectRow,
} from '@shared/types';
import { findSensitiveFiles } from '../components/sensitiveFiles';

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
  onClose,
}: Props) {
  const [state, setState] = useState<LoadState>({
    status: null,
    loading: true,
    loadError: null,
    hasGit: true,
  });
  const [sent, setSent] = useState(false);

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
  const changedFiles = state.status?.files ?? [];
  const sensitive = useMemo(
    () => findSensitiveFiles(changedFiles.map((f) => f.path)),
    [changedFiles],
  );

  const canSend =
    state.hasGit &&
    !state.loading &&
    state.loadError === null &&
    hasActiveTerminal &&
    changedFiles.length > 0 &&
    !sent;

  const handleSend = (): void => {
    // Trigger-Phrase ans aktive Terminal schicken via Bracketed-Paste-Event.
    // Newline anhängen, damit claude den Prompt direkt verarbeitet, statt darauf
    // zu warten, dass der User Enter drückt.
    window.dispatchEvent(
      new CustomEvent<{ text: string }>('td-template-send', {
        detail: { text: `${triggerPhrase}\n` },
      }),
    );
    setSent(true);
    // Nach kurzer Bestätigungs-Anzeige automatisch schließen.
    setTimeout(() => onClose(), 800);
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
              Projekt „{project.name}" ist kein Git-Repository — kein commit-Trigger
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
