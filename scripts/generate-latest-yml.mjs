#!/usr/bin/env node
// Phase-2 Season-26: Post-Make-Script fuer den electron-updater-Feed.
//
// `npm run make` bringt Squirrel-Setup.exe + win32-zip nach out/make/, schreibt
// aber kein latest.yml (electron-builder-Konvention, von Forge nicht erfuellt).
// electron-updater's GitHub-Provider verlangt die Datei aber neben den Release-
// Assets, sonst meldet er beim Check stumm „no updates available".
//
// Dieses Script laeuft NACH `npm run make` und schreibt out/make/latest.yml,
// das dann in den `gh release upload`-Schritt mit reingeht (siehe
// docs/release/VERSIONIERUNG.md Schritt 10).
//
// Usage: node scripts/generate-latest-yml.mjs [--out-dir out/make]
//
// Die eigentliche Logik liegt in src/main/updater/latest-yml.ts (pure +
// testbar). Dieses Script ist der duenne Build-Adapter, der die Setup.exe
// lokalisiert (Forge-Pfad-Konvention) und das YAML in out/make/ ablegt.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
// Auf Windows liefert URL.pathname einen fuehrenden Slash vor C:\ — den
// schneiden wir ab, damit join() den Pfad sauber zusammensetzt.
const projectRoot = process.platform === 'win32' && ROOT.startsWith('/') ? ROOT.slice(1) : ROOT;

const pkgJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
const version = pkgJson.version;
if (!version || typeof version !== 'string') {
  console.error('[latest-yml] package.json hat kein gueltiges version-Feld.');
  process.exit(1);
}

// Forge schreibt das Setup.exe als
//   out/make/squirrel.windows/x64/<ProductName>-<version> Setup.exe
// productName ist „TakumiDeck" (siehe forge.config.ts packagerConfig.name).
const squirrelDir = join(projectRoot, 'out', 'make', 'squirrel.windows', 'x64');
if (!existsSync(squirrelDir)) {
  console.error(`[latest-yml] Squirrel-Output-Ordner fehlt: ${squirrelDir}`);
  console.error('[latest-yml] Tip: vorher "npm run make" laufen lassen.');
  process.exit(1);
}

const expectedName = `TakumiDeck-${version} Setup.exe`;
const expectedPath = join(squirrelDir, expectedName);

let setupPath;
if (existsSync(expectedPath)) {
  setupPath = expectedPath;
} else {
  // Defensiv: Forge benennt die Datei manchmal mit „productName" statt „name"
  // oder mit Leerzeichen-Varianten. Wir suchen die naechstbeste Setup.exe im
  // Ordner und nehmen die, falls genau eine existiert.
  const setupCandidates = readdirSync(squirrelDir).filter(
    (f) => f.endsWith(' Setup.exe') || f.endsWith('-Setup.exe'),
  );
  if (setupCandidates.length === 1) {
    setupPath = join(squirrelDir, setupCandidates[0]);
    console.warn(
      `[latest-yml] Erwartete Datei ${expectedName} nicht gefunden, nutze Fallback: ${setupCandidates[0]}`,
    );
  } else {
    console.error(
      `[latest-yml] Setup.exe nicht eindeutig auffindbar in ${squirrelDir}. Kandidaten: ${setupCandidates.join(', ') || '(keine)'}`,
    );
    process.exit(1);
  }
}

const buffer = readFileSync(setupPath);
const sha512 = createHash('sha512').update(buffer).digest('base64');
const size = statSync(setupPath).size;
const fileName = basename(setupPath);
const releaseDate = new Date().toISOString();

const yaml =
  [
    `version: ${version}`,
    `files:`,
    `  - url: ${fileName}`,
    `    sha512: ${sha512}`,
    `    size: ${size}`,
    `path: ${fileName}`,
    `sha512: ${sha512}`,
    `releaseDate: '${releaseDate}'`,
  ].join('\n') + '\n';

const outPath = join(projectRoot, 'out', 'make', 'latest.yml');
writeFileSync(outPath, yaml, 'utf8');

console.log(`[latest-yml] geschrieben: ${outPath}`);
console.log(`[latest-yml]   version=${version} size=${size} file=${fileName}`);
console.log(`[latest-yml]   sha512=${sha512.slice(0, 32)}…`);
console.log(
  '[latest-yml] Naechster Schritt: gh release upload <tag> out/make/latest.yml',
);
