import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  safeDisposeAddon,
  safeDisposeTerminal,
  type DisposableLike,
} from '../../src/renderer/components/safeDispose';

// Pure-Helper-Tests fuer den Bugfix 2026-05-19 (Crash bei Close aktiver Session).
// Hintergrund: @xterm/addon-webgl@0.19.0 wirft in seinem internen dispose-Pfad
// eine TypeError, wenn der WebGL-Renderer beim Tab-Close noch nicht voll
// initialisiert ist. Ohne ErrorBoundary zerlegt das den Renderer-Tree. Die
// Helper kapseln den try/catch-Pattern, damit der Aufrufer ihn nicht jedes
// Mal selbst anlegt — und damit das Vertrags-Verhalten testbar bleibt.

describe('safeDisposeAddon', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('ruft addon.dispose auf, wenn der Addon nicht null ist', () => {
    const disposeMock = vi.fn();
    const addon: DisposableLike = { dispose: disposeMock };
    safeDisposeAddon(addon, 'test-addon');
    expect(disposeMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('ist No-op bei null (bequem fuer optionale Refs)', () => {
    // Der Aufrufer setzt die Ref nach Context-Loss-Tausch auf null — der
    // Cleanup-Code muss damit umgehen, ohne explizit auf null zu pruefen.
    expect(() => safeDisposeAddon(null, 'noop-case')).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('schluckt Exceptions aus addon.dispose und loggt mit Label', () => {
    // Das ist der eigentliche Bugfix-Pfad: @xterm/addon-webgl wirft beim
    // Dispose vor voller Init eine TypeError. Helper darf nicht propagieren,
    // sonst zerlegt es den React-Cleanup.
    const boom = new TypeError("Cannot read properties of undefined (reading '_isDisposed')");
    const addon: DisposableLike = {
      dispose: () => {
        throw boom;
      },
    };
    expect(() => safeDisposeAddon(addon, 'webgl')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    // Label muss in der Log-Message vorkommen, sonst ist DevTools-Diagnose
    // bei mehreren parallelen Tabs nicht zuordenbar.
    expect(warnSpy.mock.calls[0]?.[0]).toContain('webgl');
    expect(warnSpy.mock.calls[0]?.[1]).toBe(boom);
  });
});

describe('safeDisposeTerminal', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('ruft terminal.dispose auf', () => {
    const disposeMock = vi.fn();
    const terminal: DisposableLike = { dispose: disposeMock };
    safeDisposeTerminal(terminal, 'xterm');
    expect(disposeMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('schluckt Exceptions aus terminal.dispose und loggt mit Label', () => {
    // Defense-in-Depth: selbst wenn der pre-Dispose des WebGL-Addons den
    // bekannten Bug abfaengt, kann xterms eigene AddonManager-Schleife noch
    // einmal in den disposed Addon laufen und werfen. Helper darf nicht
    // propagieren.
    const boom = new Error('xterm internal dispose chain failed');
    const terminal: DisposableLike = {
      dispose: () => {
        throw boom;
      },
    };
    expect(() => safeDisposeTerminal(terminal, 'xterm')).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy.mock.calls[0]?.[0]).toContain('xterm');
    expect(warnSpy.mock.calls[0]?.[1]).toBe(boom);
  });
});
