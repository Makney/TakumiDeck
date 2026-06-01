// Auto-Update (Phase-2 Season-26): electron-updater-State zwischen Main + Renderer.

// Phase-2 Season-26: Auto-Update-State, der zwischen Main und Renderer
// fliesst. Discriminated Union nach `kind` — der Banner im Header rendert
// nur, wenn `kind` in {available, downloading, downloaded, error} liegt.
// `version`/`releaseDate` kommen aus electron-updater's UpdateInfo; bei
// 'error' ist `message` der schon abgeschliffene Hinweistext (Stacktrace
// landet im Logger, nicht im UI).
export type UpdaterState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'no-update'; checkedAt: number; currentVersion: string }
  | { kind: 'available'; version: string; releaseDate: string | null }
  | { kind: 'downloading'; version: string; percent: number }
  | { kind: 'downloaded'; version: string }
  | { kind: 'error'; message: string; checkedAt: number }
  | { kind: 'disabled-dev'; currentVersion: string };

export interface UpdaterStatePushEvent {
  state: UpdaterState;
}
