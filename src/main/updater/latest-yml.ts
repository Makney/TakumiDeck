// Phase-2 Season-26: latest.yml-Generator fuer electron-updater + Forge.
//
// Forge schreibt die Datei NICHT selbst (das ist eine electron-builder-Konvention).
// Wir generieren sie post-`npm run make` aus dem Squirrel-Setup.exe-Output und
// laden sie zusammen mit Setup.exe + win32-zip ins GitHub-Release hoch (siehe
// docs/release/VERSIONIERUNG.md Schritt 10).
//
// Format-Referenz: https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/providers/GitHubProvider.ts
// Minimaler GitHub-Provider-Schema (yaml):
//   version: 0.2.2
//   files:
//     - url: TakumiDeck-0.2.2 Setup.exe
//       sha512: <base64 sha-512 der Datei>
//       size: <byte-laenge>
//   path: TakumiDeck-0.2.2 Setup.exe
//   sha512: <base64 sha-512>
//   releaseDate: '2026-05-18T12:34:56.000Z'
//
// `path` + `sha512` auf Top-Level sind Legacy-Felder, die der Provider trotzdem
// liest — wir schreiben sie defensiv mit, damit auch aeltere electron-updater-
// Clients (falls jemand das Paket downgraded) noch updaten koennen.

import { createHash } from 'node:crypto';
import { statSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';

export interface LatestYmlInputs {
  version: string;
  setupExePath: string;
  releaseDate?: Date;
}

export interface LatestYmlFileDriver {
  stat(path: string): { size: number };
  read(path: string): Buffer;
}

export const realLatestYmlFileDriver: LatestYmlFileDriver = {
  stat(path) {
    const s = statSync(path);
    return { size: s.size };
  },
  read(path) {
    return readFileSync(path);
  },
};

export interface LatestYmlMeta {
  version: string;
  fileName: string;
  size: number;
  sha512: string;
  releaseDate: string;
}

// Pure-Funktion, separat von der File-I/O, damit die Tests die Berechnung
// (SHA-512-Base64, Format-Zeitstempel) ohne tmp-Files pruefen koennen.
export function buildLatestYmlContent(meta: LatestYmlMeta): string {
  return [
    `version: ${meta.version}`,
    `files:`,
    `  - url: ${meta.fileName}`,
    `    sha512: ${meta.sha512}`,
    `    size: ${meta.size}`,
    `path: ${meta.fileName}`,
    `sha512: ${meta.sha512}`,
    `releaseDate: '${meta.releaseDate}'`,
    ``,
  ].join('\n');
}

// Einstiegspunkt fuers Build-Script. Liest die Setup.exe ueber den injectablen
// Driver, berechnet sha512 + size und gibt sowohl das YAML als auch die rohen
// Meta-Felder zurueck (Meta hilft beim Logging im Build-Script).
export function buildLatestYml(
  inputs: LatestYmlInputs,
  driver: LatestYmlFileDriver = realLatestYmlFileDriver,
): { yaml: string; meta: LatestYmlMeta } {
  const { size } = driver.stat(inputs.setupExePath);
  const data = driver.read(inputs.setupExePath);
  const sha512 = createHash('sha512').update(data).digest('base64');
  const releaseDate = (inputs.releaseDate ?? new Date()).toISOString();
  const meta: LatestYmlMeta = {
    version: inputs.version,
    fileName: basename(inputs.setupExePath),
    size,
    sha512,
    releaseDate,
  };
  return { yaml: buildLatestYmlContent(meta), meta };
}
