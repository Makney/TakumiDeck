import { err, ok } from '@shared/result';
import type { IpcResult } from '@shared/types';
import { resolveExecutable } from './binary';
import type { Logger } from '../logger';

// Phase-2 Season-31: Shell-Resolution fuer den 'terminal'-Session-Typ.
//
// Erste Stufe pwsh.exe (PowerShell 7+), zweite Stufe powershell.exe (Win11-Default,
// immer vorhanden). Wir bevorzugen pwsh, weil es die modernen Operatoren (&&, ||,
// ?:, ??) und das aktuelle PSReadLine mitbringt — wer es nicht installiert hat,
// faellt sauber auf die Built-in-PowerShell zurueck.
//
// Eigener Helper statt preSpawnCheck, weil die Pre-Spawn-Logik fuer claude-Spawns
// dort (Binary-Pfad aus settings.claude_binary_path + cwd-Existenz) eine andere
// Verantwortung hat. Der terminal-Pfad braucht ausserdem den Fallback, den die
// Single-Lookup-Variante nicht bieten kann.

export interface TerminalShellResult {
  resolvedShell: string;
  // Welche der beiden Stufen tatsaechlich getroffen hat — fuer Log-Ausgaben +
  // Test-Assertions sichtbar machen.
  source: 'pwsh' | 'powershell';
}

export function resolveTerminalShell(log: Logger): IpcResult<TerminalShellResult> {
  // Stufe 1: pwsh.exe via PATH.
  const pwshLookup = resolveExecutable('pwsh.exe');
  if (pwshLookup.ok) {
    return ok({ resolvedShell: pwshLookup.resolved, source: 'pwsh' });
  }
  log.info(`[terminal-shell] pwsh.exe nicht im PATH (${pwshLookup.error}), fallback auf powershell.exe`);
  // Stufe 2: powershell.exe (Win11-Default, immer vorhanden).
  const winLookup = resolveExecutable('powershell.exe');
  if (winLookup.ok) {
    return ok({ resolvedShell: winLookup.resolved, source: 'powershell' });
  }
  return err(
    `Weder pwsh.exe noch powershell.exe im PATH gefunden: ${winLookup.error}`,
    'TERMINAL_SHELL_NOT_FOUND',
  );
}
