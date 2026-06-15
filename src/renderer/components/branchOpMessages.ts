import type {
  GitCheckoutResult,
  GitFetchResult,
  GitPullResult,
} from '@shared/types';

// Season 38 (Pull/Fetch/Branch-Switch): Pure-Helper, die ein IPC-Ergebnis in
// eine deutsche Toast-/Hinweis-Zeile uebersetzen. Bewusst von den Komponenten
// getrennt, damit beide Oberflaechen (Sidebar-Panel + TitleBar-Dropdown) exakt
// gleich formulieren und die Logik testbar bleibt.

export function describeCheckoutResult(r: GitCheckoutResult): string {
  switch (r.status) {
    case 'switched':
      return r.stashed
        ? `Auf „${r.branch}" gewechselt — lokale Aenderungen gestasht`
        : `Auf „${r.branch}" gewechselt`;
    case 'checked-out-elsewhere':
      return `„${r.branch}" ist bereits in einem anderen Worktree ausgecheckt`;
    case 'dirty':
      return 'Working-Tree hat uncommittete Aenderungen';
  }
}

export function describeFetchResult(r: GitFetchResult): string {
  return r.status === 'fetched'
    ? 'Fetch abgeschlossen'
    : 'Kein Remote konfiguriert — nichts zu holen';
}

export function describePullResult(r: GitPullResult): string {
  switch (r.status) {
    case 'pulled':
      return `Pull: ${r.filesChanged} Datei(en), +${r.insertions}/−${r.deletions}`;
    case 'up-to-date':
      return 'Bereits aktuell — nichts zu pullen';
    case 'conflict':
      return `Merge-Konflikt in ${r.conflictFiles.length} Datei(en) — Pull zurueckgerollt`;
    case 'dirty':
      return 'Working-Tree hat Aenderungen — erst committen oder verwerfen';
    case 'no-upstream':
      return 'Kein Upstream-Branch gesetzt — Pull nicht moeglich';
    case 'no-remote':
      return 'Kein Remote konfiguriert';
  }
}
