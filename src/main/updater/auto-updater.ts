// Phase-2 Season-26: Duenner Wrapper um electron-updater's autoUpdater.
//
// State-Machine, die zwischen Main und Renderer ausgetauscht wird. Die rohen
// electron-updater-Events werden in `UpdaterState`-Snapshots uebersetzt, der
// Renderer-Banner kann auf das discriminated-union-`kind` matchen statt selbst
// auf Events zu hoeren.
//
// Test-Strategie: Der Wrapper bekommt das `autoUpdater`-Singleton via DI als
// `ElectronUpdaterLike`. Tests injizieren einen Mock-EventEmitter und pruefen
// die State-Uebergaenge ohne echten Network-Call.

import type { UpdaterState } from '@shared/types';
import type { Logger } from '../logger';

// GitHub-Provider-Koordinaten. Hardcoded, weil das Repo Single-Target ist —
// der Renderer hat keinen Bedarf, das umzukonfigurieren.
export const GITHUB_OWNER = 'Makney';
export const GITHUB_REPO = 'TakumiDeck';

// Minimaler Vertrag, den der Wrapper vom electron-updater-Singleton braucht.
// Reduziert auf genau die Events + Methoden, die wir nutzen — so kann der Test
// einen 30-Zeilen-Mock-EventEmitter unterschieben statt das ganze Modul zu
// re-implementieren.
export interface ElectronUpdaterLike {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  setFeedURL(options: { provider: 'github'; owner: string; repo: string }): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  on(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(): void;
}

export interface AutoUpdaterWrapperDeps {
  updater: ElectronUpdaterLike;
  isPackaged: boolean;
  currentVersion: string;
  log: Pick<Logger, 'info' | 'warn' | 'error'>;
  push: (state: UpdaterState) => void;
}

function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  return 'Unbekannter Update-Fehler';
}

export class AutoUpdaterWrapper {
  private state: UpdaterState = { kind: 'idle' };
  private initialized = false;
  // Wenn der User auf "Download" geklickt hat, merken wir uns die Version aus
  // dem 'available'-Snapshot — `download-progress` selbst liefert keine.
  private downloadingVersion: string | null = null;

  constructor(private readonly deps: AutoUpdaterWrapperDeps) {}

  initialize(): void {
    if (this.initialized) return;
    this.initialized = true;

    if (!this.deps.isPackaged) {
      // Dev-Modus: electron-updater wuerde gegen GitHub queryen und beim
      // ersten 'error'-Event einen unnoetigen Banner zeigen. State bleibt
      // explizit auf 'disabled-dev' — Renderer rendert dort keinen Banner.
      this.setState({ kind: 'disabled-dev', currentVersion: this.deps.currentVersion });
      return;
    }

    this.deps.updater.autoDownload = false;
    this.deps.updater.autoInstallOnAppQuit = false;
    try {
      this.deps.updater.setFeedURL({
        provider: 'github',
        owner: GITHUB_OWNER,
        repo: GITHUB_REPO,
      });
    } catch (e) {
      // Defensiv: setFeedURL-Wurf wuerde sonst den ganzen App-Start kippen.
      this.deps.log.warn('[updater] setFeedURL fehlgeschlagen', e);
      this.setState({ kind: 'error', message: describeError(e), checkedAt: Date.now() });
      return;
    }

    this.deps.updater.on('checking-for-update', () => {
      this.setState({ kind: 'checking' });
    });
    this.deps.updater.on('update-available', (info: { version: string; releaseDate?: string }) => {
      this.downloadingVersion = info.version;
      this.setState({
        kind: 'available',
        version: info.version,
        releaseDate: info.releaseDate ?? null,
      });
    });
    this.deps.updater.on('update-not-available', (info: { version: string }) => {
      this.downloadingVersion = null;
      this.setState({
        kind: 'no-update',
        checkedAt: Date.now(),
        currentVersion: info?.version ?? this.deps.currentVersion,
      });
    });
    this.deps.updater.on('download-progress', (progress: { percent: number }) => {
      if (this.downloadingVersion === null) return;
      const percent = Math.max(0, Math.min(100, Math.round(progress?.percent ?? 0)));
      this.setState({
        kind: 'downloading',
        version: this.downloadingVersion,
        percent,
      });
    });
    this.deps.updater.on('update-downloaded', (info: { version: string }) => {
      this.setState({
        kind: 'downloaded',
        version: info?.version ?? this.downloadingVersion ?? this.deps.currentVersion,
      });
      this.downloadingVersion = null;
    });
    this.deps.updater.on('error', (err: Error) => {
      this.deps.log.warn('[updater] error event', err);
      this.setState({
        kind: 'error',
        message: describeError(err),
        checkedAt: Date.now(),
      });
      this.downloadingVersion = null;
    });

    this.deps.log.info('[updater] initialisiert', {
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      currentVersion: this.deps.currentVersion,
    });
  }

  getState(): UpdaterState {
    return this.state;
  }

  async check(): Promise<UpdaterState> {
    if (!this.deps.isPackaged) return this.state;
    try {
      await this.deps.updater.checkForUpdates();
    } catch (e) {
      // electron-updater feuert das 'error'-Event meistens parallel — falls
      // nicht (synchron-Wurf vor dem ersten Event), patchen wir den State hier.
      this.deps.log.warn('[updater] checkForUpdates-Wurf', e);
      this.setState({ kind: 'error', message: describeError(e), checkedAt: Date.now() });
    }
    return this.state;
  }

  async startDownload(): Promise<UpdaterState> {
    if (!this.deps.isPackaged) return this.state;
    if (this.state.kind !== 'available') return this.state;
    // Optimistisch auf 'downloading' kippen, damit der Banner sofort reagiert
    // (electron-updater's erstes 'download-progress'-Event kommt erst nach dem
    // ersten Chunk — bei kleinen Updates spuerbar verzoegert).
    this.downloadingVersion = this.state.version;
    this.setState({ kind: 'downloading', version: this.state.version, percent: 0 });
    try {
      await this.deps.updater.downloadUpdate();
    } catch (e) {
      this.deps.log.warn('[updater] downloadUpdate-Wurf', e);
      this.setState({ kind: 'error', message: describeError(e), checkedAt: Date.now() });
      this.downloadingVersion = null;
    }
    return this.state;
  }

  quitAndInstall(): void {
    if (this.state.kind !== 'downloaded') return;
    this.deps.updater.quitAndInstall();
  }

  private setState(next: UpdaterState): void {
    this.state = next;
    this.deps.push(next);
  }
}
