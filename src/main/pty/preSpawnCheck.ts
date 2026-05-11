import fs from 'node:fs';
import { err, ok } from '@shared/result';
import type { IpcResult } from '@shared/types';
import { resolveExecutable } from './binary';
import type { Logger } from '../logger';

// Bereich-4-Review (W-1): gemeinsame Pre-Spawn-Validation für pty:create und
// session:resume. Beide Handler hatten denselben Block kopiert (Binary-Lookup
// + cwd-Existenz-Prüfung mit identischen Error-Codes). Konsolidiert.
//
// Rückgabe: aufgelöster absoluter Binary-Pfad. Bei Fail liefert der Helper
// einen Result-Err mit dem passenden Code zurück, den der aufrufende Handler
// direkt weiterreichen kann.

export interface PreSpawnCheckInput {
  binaryPath: string;
  cwd: string;
  log: Logger;
  label: string;
  // Optional: zusätzlicher Hinweis für die cwd-Fehlermeldung. pty:create zeigt
  // den settings.json-Pfad, session:resume merkt an, dass der Ordner umbenannt
  // worden sein könnte.
  cwdMissingHint?: string;
}

export function preSpawnCheck(input: PreSpawnCheckInput): IpcResult<{ resolvedBinary: string }> {
  // Binary auflösen — sonst wirft ConPTY den Fehler erst aus einem Worker-Thread
  // und reißt (ohne uncaughtException-Handler) den Main-Prozess um.
  const lookup = resolveExecutable(input.binaryPath);
  if (!lookup.ok) {
    input.log.warn(`[${input.label}] Binary nicht auflösbar: ${lookup.error}`);
    return err(lookup.error, 'PTY_BINARY_NOT_FOUND');
  }
  // cwd-Existenz — sonst wirft ConPTY ERROR_DIRECTORY (267).
  if (!fs.existsSync(input.cwd)) {
    const hint = input.cwdMissingHint ? ` ${input.cwdMissingHint}` : '';
    const msg = `Working-Directory existiert nicht: ${input.cwd}.${hint}`;
    input.log.warn(`[${input.label}] ${msg}`);
    return err(msg, 'PTY_CWD_NOT_FOUND');
  }
  return ok({ resolvedBinary: lookup.resolved });
}
