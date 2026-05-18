import { describe, it, expect, vi } from 'vitest';
import {
  AutoUpdaterWrapper,
  type ElectronUpdaterLike,
} from '../../src/main/updater/auto-updater';
import type { UpdaterState } from '@shared/types';

// Phase-2 Season-26 — Wrapper-State-Machine.
//
// Test-Strategie: wir injizieren ein Mock-ElectronUpdaterLike, das
//   1) die `on`-Listener pro Event-Name in einer Map speichert,
//   2) Methoden (checkForUpdates, downloadUpdate, quitAndInstall) stubbt,
//   3) keine echten Netzwerk-Calls macht.
//
// Tests treiben die State-Maschine, indem sie die gespeicherten Listener
// explizit feuern — so isolieren wir die Wrapper-Logik vom Innenleben
// von electron-updater.

interface MockUpdater extends ElectronUpdaterLike {
  emit(event: string, ...args: unknown[]): void;
  callsCheckForUpdates: number;
  callsDownloadUpdate: number;
  callsQuitAndInstall: number;
  callsSetFeedURL: number;
}

function createMockUpdater(): MockUpdater {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const mock: MockUpdater = {
    autoDownload: true, // default-true, soll vom Wrapper auf false gekippt werden
    autoInstallOnAppQuit: true,
    callsCheckForUpdates: 0,
    callsDownloadUpdate: 0,
    callsQuitAndInstall: 0,
    callsSetFeedURL: 0,
    setFeedURL() {
      mock.callsSetFeedURL += 1;
    },
    on(event: string, listener: (...args: unknown[]) => void) {
      const existing = listeners.get(event) ?? [];
      existing.push(listener);
      listeners.set(event, existing);
      return mock;
    },
    async checkForUpdates() {
      mock.callsCheckForUpdates += 1;
      return undefined;
    },
    async downloadUpdate() {
      mock.callsDownloadUpdate += 1;
      return [];
    },
    quitAndInstall() {
      mock.callsQuitAndInstall += 1;
    },
    emit(event: string, ...args: unknown[]) {
      const handlers = listeners.get(event) ?? [];
      for (const h of handlers) h(...args);
    },
  };
  return mock;
}

function makeWrapper(opts: { isPackaged?: boolean; currentVersion?: string } = {}) {
  const updater = createMockUpdater();
  const pushes: UpdaterState[] = [];
  const wrapper = new AutoUpdaterWrapper({
    updater,
    isPackaged: opts.isPackaged ?? true,
    currentVersion: opts.currentVersion ?? '0.2.1',
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    push: (s) => pushes.push(s),
  });
  return { wrapper, updater, pushes };
}

describe('AutoUpdaterWrapper — Initialisierung', () => {
  it('Dev-Modus (isPackaged=false) → disabled-dev, keine setFeedURL-Aufrufe', () => {
    const { wrapper, updater, pushes } = makeWrapper({
      isPackaged: false,
      currentVersion: '0.2.1',
    });
    wrapper.initialize();
    expect(wrapper.getState()).toEqual({ kind: 'disabled-dev', currentVersion: '0.2.1' });
    expect(updater.callsSetFeedURL).toBe(0);
    expect(pushes).toEqual([{ kind: 'disabled-dev', currentVersion: '0.2.1' }]);
  });

  it('Packaged-Modus → setFeedURL + autoDownload/autoInstallOnAppQuit kippen auf false', () => {
    const { wrapper, updater } = makeWrapper({ isPackaged: true });
    wrapper.initialize();
    expect(updater.callsSetFeedURL).toBe(1);
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    // State bleibt 'idle' bis zum ersten check().
    expect(wrapper.getState()).toEqual({ kind: 'idle' });
  });

  it('Doppelte initialize-Aufrufe sind idempotent', () => {
    const { wrapper, updater } = makeWrapper();
    wrapper.initialize();
    wrapper.initialize();
    expect(updater.callsSetFeedURL).toBe(1);
  });
});

describe('AutoUpdaterWrapper — Event-Pipeline', () => {
  it('checking-for-update → State checking', () => {
    const { wrapper, updater } = makeWrapper();
    wrapper.initialize();
    updater.emit('checking-for-update');
    expect(wrapper.getState()).toEqual({ kind: 'checking' });
  });

  it('update-available → State available mit version + releaseDate', () => {
    const { wrapper, updater, pushes } = makeWrapper();
    wrapper.initialize();
    updater.emit('update-available', {
      version: '0.2.2',
      releaseDate: '2026-05-18T12:00:00.000Z',
    });
    expect(wrapper.getState()).toEqual({
      kind: 'available',
      version: '0.2.2',
      releaseDate: '2026-05-18T12:00:00.000Z',
    });
    // Push wurde gefeuert (initial disabled-dev nicht, weil isPackaged=true,
    // also vor dem Event ist `pushes` leer; danach genau ein Eintrag).
    expect(pushes).toHaveLength(1);
  });

  it('update-not-available → State no-update mit currentVersion', () => {
    const { wrapper, updater } = makeWrapper();
    wrapper.initialize();
    updater.emit('update-not-available', { version: '0.2.1' });
    expect(wrapper.getState()).toMatchObject({ kind: 'no-update', currentVersion: '0.2.1' });
  });

  it('update-downloaded → State downloaded', () => {
    const { wrapper, updater } = makeWrapper();
    wrapper.initialize();
    updater.emit('update-available', { version: '0.2.2' });
    updater.emit('update-downloaded', { version: '0.2.2' });
    expect(wrapper.getState()).toEqual({ kind: 'downloaded', version: '0.2.2' });
  });

  it('error-Event → State error mit Message', () => {
    const { wrapper, updater } = makeWrapper();
    wrapper.initialize();
    updater.emit('error', new Error('Network unreachable'));
    expect(wrapper.getState()).toMatchObject({
      kind: 'error',
      message: 'Network unreachable',
    });
  });

  it('download-progress nur durchgereicht, wenn ein "available" vorausging', () => {
    const { wrapper, updater } = makeWrapper();
    wrapper.initialize();
    // Stray progress-Event ohne vorheriges available — kein State-Sprung.
    updater.emit('download-progress', { percent: 50 });
    expect(wrapper.getState()).toEqual({ kind: 'idle' });
    // Nach available + progress → downloading mit version + gerundetem percent.
    updater.emit('update-available', { version: '0.2.2' });
    updater.emit('download-progress', { percent: 33.7 });
    expect(wrapper.getState()).toEqual({
      kind: 'downloading',
      version: '0.2.2',
      percent: 34,
    });
  });

  it('download-progress clampt percent auf [0, 100]', () => {
    const { wrapper, updater } = makeWrapper();
    wrapper.initialize();
    updater.emit('update-available', { version: '0.2.2' });
    updater.emit('download-progress', { percent: 123.5 });
    expect(wrapper.getState()).toMatchObject({ kind: 'downloading', percent: 100 });
    updater.emit('download-progress', { percent: -5 });
    expect(wrapper.getState()).toMatchObject({ kind: 'downloading', percent: 0 });
  });
});

describe('AutoUpdaterWrapper — Methoden', () => {
  it('check() im Dev-Modus → kein checkForUpdates-Aufruf', async () => {
    const { wrapper, updater } = makeWrapper({ isPackaged: false });
    wrapper.initialize();
    await wrapper.check();
    expect(updater.callsCheckForUpdates).toBe(0);
  });

  it('check() im Packaged-Modus → checkForUpdates wird einmal aufgerufen', async () => {
    const { wrapper, updater } = makeWrapper();
    wrapper.initialize();
    await wrapper.check();
    expect(updater.callsCheckForUpdates).toBe(1);
  });

  it('check()-Wurf landet in State error', async () => {
    const { wrapper, updater } = makeWrapper();
    wrapper.initialize();
    updater.checkForUpdates = async () => {
      throw new Error('boom');
    };
    const state = await wrapper.check();
    expect(state).toMatchObject({ kind: 'error', message: 'boom' });
  });

  it('startDownload() ohne available-State → no-op, kein downloadUpdate-Aufruf', async () => {
    const { wrapper, updater } = makeWrapper();
    wrapper.initialize();
    // State ist 'idle' — startDownload soll nichts tun.
    const result = await wrapper.startDownload();
    expect(result).toEqual({ kind: 'idle' });
    expect(updater.callsDownloadUpdate).toBe(0);
  });

  it('startDownload() im available-State → optimistisch downloading + downloadUpdate', async () => {
    const { wrapper, updater } = makeWrapper();
    wrapper.initialize();
    updater.emit('update-available', { version: '0.2.2' });
    await wrapper.startDownload();
    expect(updater.callsDownloadUpdate).toBe(1);
    // Optimistischer Sprung auf downloading mit percent=0, bevor das erste
    // progress-Event ueberhaupt kommt — sonst sieht der Banner einen
    // Dead-Click.
    expect(wrapper.getState()).toEqual({
      kind: 'downloading',
      version: '0.2.2',
      percent: 0,
    });
  });

  it('quitAndInstall() ohne downloaded-State → no-op', () => {
    const { wrapper, updater } = makeWrapper();
    wrapper.initialize();
    wrapper.quitAndInstall();
    expect(updater.callsQuitAndInstall).toBe(0);
  });

  it('quitAndInstall() nach downloaded-State → ein Aufruf', () => {
    const { wrapper, updater } = makeWrapper();
    wrapper.initialize();
    updater.emit('update-available', { version: '0.2.2' });
    updater.emit('update-downloaded', { version: '0.2.2' });
    wrapper.quitAndInstall();
    expect(updater.callsQuitAndInstall).toBe(1);
  });
});
