import { describe, it, expect, vi, beforeEach } from 'vitest';

// Phase-2 Season-31: Tests fuer den Shell-Resolver des 'terminal'-Session-Typs.
// Wir mocken `resolveExecutable`, damit die Tests nicht von der echten PATH-
// Aufloesung des Test-Runners abhaengen — auf CI laeuft das Modul z.B. unter
// Linux ohne pwsh.exe.

vi.mock('../../src/main/pty/binary', () => ({
  resolveExecutable: vi.fn(),
}));

import { resolveTerminalShell } from '../../src/main/pty/terminalShell';
import { resolveExecutable } from '../../src/main/pty/binary';

const mockedResolve = vi.mocked(resolveExecutable);

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

describe('resolveTerminalShell', () => {
  beforeEach(() => {
    mockedResolve.mockReset();
  });

  it('bevorzugt pwsh.exe, wenn im PATH gefunden', () => {
    mockedResolve.mockImplementation((name: string) => {
      if (name === 'pwsh.exe') {
        return { ok: true, resolved: 'C:\\Program Files\\PowerShell\\7\\pwsh.exe' };
      }
      return { ok: false, error: 'unerwartet' };
    });
    const log = makeLogger();
    const result = resolveTerminalShell(log);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.source).toBe('pwsh');
    expect(result.data.resolvedShell).toBe('C:\\Program Files\\PowerShell\\7\\pwsh.exe');
    // Fallback darf nicht angefasst worden sein, wenn pwsh schon trifft.
    expect(mockedResolve).toHaveBeenCalledTimes(1);
    expect(mockedResolve).toHaveBeenCalledWith('pwsh.exe');
  });

  it('faellt auf powershell.exe zurueck, wenn pwsh.exe nicht im PATH ist', () => {
    mockedResolve.mockImplementation((name: string) => {
      if (name === 'pwsh.exe') {
        return { ok: false, error: 'nicht gefunden' };
      }
      if (name === 'powershell.exe') {
        return { ok: true, resolved: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' };
      }
      return { ok: false, error: 'unerwartet' };
    });
    const log = makeLogger();
    const result = resolveTerminalShell(log);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.source).toBe('powershell');
    expect(result.data.resolvedShell).toMatch(/powershell\.exe$/);
    // Beide Stufen muessen geprueft worden sein.
    expect(mockedResolve).toHaveBeenCalledTimes(2);
    expect(mockedResolve).toHaveBeenNthCalledWith(1, 'pwsh.exe');
    expect(mockedResolve).toHaveBeenNthCalledWith(2, 'powershell.exe');
    // Fallback-Pfad loggt einen Hinweis (fuer Debug-Sessions, in denen pwsh
    // erwartet wurde, aber nicht installiert ist).
    expect(log.info).toHaveBeenCalled();
  });

  it('liefert TERMINAL_SHELL_NOT_FOUND, wenn beide Stufen scheitern', () => {
    mockedResolve.mockReturnValue({ ok: false, error: 'nicht gefunden' });
    const log = makeLogger();
    const result = resolveTerminalShell(log);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('TERMINAL_SHELL_NOT_FOUND');
    expect(result.error).toContain('Weder pwsh.exe noch powershell.exe');
  });
});
