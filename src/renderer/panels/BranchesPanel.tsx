import { useState } from 'react';
import type { GitBranchInfo } from '@shared/types';
import { useUiStore } from '../stores/ui';
import { useBranchControl } from '../components/useBranchControl';
import {
  describeCheckoutResult,
  describeFetchResult,
  describePullResult,
} from '../components/branchOpMessages';

// BranchesPanel (Season 38 — Pull/Fetch/Branch-Switch).
//
// Viertes Sidebar-Panel unter „Projekte". Zeigt die lokalen Branches des
// aktiven Projekt-Haupt-Checkouts mit Tracking-Info (ahead/behind) und erlaubt:
//   - Branch-Switch per Klick (bei dirty Working-Tree mit Stash-Rueckfrage),
//   - Fetch (`git fetch --all --prune`),
//   - Pull fuer den aktuellen Branch (Konflikt → Datei-Liste, Pull zurueckgerollt).
//
// Branches, die in einem Linked-Worktree belegt sind, sind nicht klickbar
// (Git laesst denselben Branch nicht zweimal auschecken) — konsistent mit
// Season 37.

interface Props {
  projectId: string | null;
}

export function BranchesPanel({ projectId }: Props) {
  const flashToast = useUiStore((s) => s.flashToast);
  const { overview, loading, error, busy, switchTo, fetch, pull } =
    useBranchControl(projectId);

  // Branch, der auf die Stash-Rueckfrage wartet (Switch kam mit status='dirty').
  const [pendingDirty, setPendingDirty] = useState<string | null>(null);
  // Konfliktdateien des letzten Pull (status='conflict') — Block bleibt sichtbar,
  // bis der User ihn schliesst.
  const [pullConflicts, setPullConflicts] = useState<string[] | null>(null);

  // Kein aktives Projekt → Panel komplett ausblenden (wie bei „kein Projekt").
  if (!projectId) return null;

  const hasGit = overview?.hasGit ?? false;
  const hasRemote = overview?.hasRemote ?? false;

  const handleSwitch = async (branch: string) => {
    const r = await switchTo(branch, false);
    if (!r) return;
    if (r.status === 'dirty') {
      setPendingDirty(branch);
      return;
    }
    flashToast(describeCheckoutResult(r));
  };

  const handleConfirmStashSwitch = async () => {
    if (!pendingDirty) return;
    const branch = pendingDirty;
    setPendingDirty(null);
    const r = await switchTo(branch, true);
    if (r) flashToast(describeCheckoutResult(r));
  };

  const handleFetch = async () => {
    const r = await fetch();
    if (r) flashToast(describeFetchResult(r));
  };

  const handlePull = async () => {
    const r = await pull();
    if (!r) return;
    if (r.status === 'conflict') {
      setPullConflicts(r.conflictFiles);
      return;
    }
    flashToast(describePullResult(r));
  };

  return (
    <div className="td-panel td-panel-branches">
      <div className="td-panel-head">
        <div className="td-panel-title">Branches</div>
        <div className="td-panel-actions">
          <button
            type="button"
            className="td-icon-btn"
            title={
              hasRemote
                ? 'Fetch (git fetch --all --prune)'
                : 'Kein Remote konfiguriert'
            }
            onClick={() => void handleFetch()}
            disabled={!hasGit || !hasRemote || busy}
          >
            ⟳
          </button>
          <button
            type="button"
            className="td-icon-btn"
            title={
              hasRemote
                ? 'Pull (git pull) fuer den aktuellen Branch'
                : 'Kein Remote konfiguriert'
            }
            onClick={() => void handlePull()}
            disabled={!hasGit || !hasRemote || busy}
          >
            ⤓
          </button>
        </div>
      </div>
      <div className="td-panel-body">
        {error && <div className="td-sidebar-error">{error}</div>}
        {loading && !overview && <div className="td-skeleton">Lade Branches…</div>}
        {overview && !hasGit && (
          <div className="td-sidebar-empty-soft">Kein Git-Repository.</div>
        )}

        {pullConflicts && (
          <div className="td-branch-conflict">
            <div className="td-branch-conflict-head">
              <strong>Merge-Konflikt</strong> — Pull wurde zurueckgerollt, der
              Haupt-Checkout ist wieder sauber. Diese Dateien kollidieren:
            </div>
            <ul className="td-merge-conflict-files">
              {pullConflicts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
            <button
              type="button"
              className="td-action-btn ghost"
              onClick={() => setPullConflicts(null)}
            >
              Schliessen
            </button>
          </div>
        )}

        {pendingDirty && (
          <div className="td-branch-dirty-confirm">
            <div>
              Working-Tree hat uncommittete Aenderungen. Vor dem Wechsel auf{' '}
              <strong>{pendingDirty}</strong> stashen?
            </div>
            <div className="td-branch-dirty-actions">
              <button
                type="button"
                className="td-action-btn ghost"
                onClick={() => setPendingDirty(null)}
                disabled={busy}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="td-action-btn primary"
                onClick={() => void handleConfirmStashSwitch()}
                disabled={busy}
              >
                Stashen &amp; wechseln
              </button>
            </div>
          </div>
        )}

        {hasGit && overview && (
          <div className="td-list td-branch-list">
            {overview.detached && (
              <div className="td-branch-detached" title="HEAD ist detached">
                detached @ {overview.current}
              </div>
            )}
            {overview.branches.map((b) => (
              <BranchRow
                key={b.name}
                branch={b}
                disabled={busy}
                onSwitch={() => void handleSwitch(b.name)}
              />
            ))}
            {overview.branches.length === 0 && (
              <div className="td-sidebar-empty-soft">Keine lokalen Branches.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function BranchRow({
  branch,
  disabled,
  onSwitch,
}: {
  branch: GitBranchInfo;
  disabled: boolean;
  onSwitch: () => void;
}) {
  const lockedInWorktree = branch.checkedOutPath !== null && !branch.isCurrent;
  // Klickbar nur, wenn nicht aktuell, nicht in einem Worktree belegt, nicht busy.
  const clickable = !branch.isCurrent && !lockedInWorktree && !disabled;
  const title = branch.isCurrent
    ? 'Aktueller Branch'
    : lockedInWorktree
      ? `In Worktree ausgecheckt: ${branch.checkedOutPath}`
      : `Auf „${branch.name}" wechseln`;

  return (
    <div
      className={`td-branch-row${branch.isCurrent ? ' current' : ''}${
        lockedInWorktree ? ' locked' : ''
      }${clickable ? ' clickable' : ''}`}
      onClick={clickable ? onSwitch : undefined}
      title={title}
    >
      <span className="td-branch-mark" aria-hidden>
        {branch.isCurrent ? '●' : lockedInWorktree ? '⊗' : '⎇'}
      </span>
      <span className="td-branch-name">{branch.name}</span>
      {branch.upstream !== null && (branch.ahead > 0 || branch.behind > 0) && (
        <span className="td-branch-track">
          {branch.ahead > 0 && (
            <span className="td-branch-ahead" title={`${branch.ahead} Commit(s) voraus`}>
              ↑{branch.ahead}
            </span>
          )}
          {branch.behind > 0 && (
            <span className="td-branch-behind" title={`${branch.behind} Commit(s) hinterher`}>
              ↓{branch.behind}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
