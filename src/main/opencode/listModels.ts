import { spawnSync } from 'node:child_process';
import type { OpencodeModelsResult } from '@shared/types';
import { parseOpencodeModels } from '@shared/opencode';
import { resolveExecutable } from '../pty/binary';
import type { Logger } from '../logger';

// Season 39 (Opencode): listet die verfuegbaren opencode-Modelle via
// `opencode models`. Wird vom IPC-Handler `opencode:list-models` aufgerufen,
// wenn der User im NewSessionModal den Typ „Opencode" waehlt.
//
// Die Funktion wirft nie — jeder Fehlerpfad wird in ein `available=false`-
// Ergebnis mit `reason` uebersetzt, damit der Renderer einen sauberen Hinweis
// statt eines IPC-Rejects bekommt. Der Runner ist injizierbar, damit der Test
// ohne echte opencode-Installation laeuft.

export type OpencodeModelsRunner = (binaryPath: string, args: string[]) => string;

export interface ListOpencodeModelsInput {
  enabled: boolean;
  binaryPath: string;
  log?: Logger;
  // Optional: Override fuer Tests. Default ruft `opencode models` via spawnSync.
  runner?: OpencodeModelsRunner;
}

// Default-Runner: ruft die Binary einmalig synchron auf. Auf Windows laufen die
// npm-Shims als `.cmd`, die spawnSync nur mit `shell: true` ausfuehren kann.
function defaultRunner(binaryPath: string, args: string[]): string {
  const isWin = process.platform === 'win32';
  const res = spawnSync(binaryPath, args, {
    encoding: 'utf-8',
    windowsHide: true,
    // .cmd/.bat brauchen die Shell; args sind hier fix (['models']), kein
    // Renderer-Input fliesst in den Call.
    shell: isWin,
    timeout: 10_000,
  });
  if (res.error) throw res.error;
  if (typeof res.status === 'number' && res.status !== 0) {
    const stderr = (res.stderr ?? '').toString().trim();
    throw new Error(`opencode models exit ${res.status}${stderr ? `: ${stderr}` : ''}`);
  }
  return res.stdout ?? '';
}

export function listOpencodeModels(input: ListOpencodeModelsInput): OpencodeModelsResult {
  if (!input.enabled) {
    return { available: false, models: [], reason: 'disabled' };
  }
  // Binary aufloesen, damit ein fehlendes opencode eine klare Diagnose liefert
  // statt eines kryptischen spawn-Fehlers.
  const lookup = resolveExecutable(input.binaryPath);
  if (!lookup.ok) {
    input.log?.info(`[opencode] Binary nicht gefunden: ${lookup.error}`);
    return { available: false, models: [], reason: 'not-found', error: lookup.error };
  }
  const runner = input.runner ?? defaultRunner;
  try {
    const stdout = runner(lookup.resolved, ['models']);
    const models = parseOpencodeModels(stdout);
    if (models.length === 0) {
      // Kein Modell — opencode laeuft, hat aber keine konfigurierten Provider.
      return {
        available: false,
        models: [],
        reason: 'error',
        error: 'opencode hat keine Modelle gemeldet. Sind Provider in opencode konfiguriert?',
      };
    }
    return { available: true, models };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    input.log?.warn(`[opencode] models-Aufruf fehlgeschlagen: ${message}`);
    return { available: false, models: [], reason: 'error', error: message };
  }
}
