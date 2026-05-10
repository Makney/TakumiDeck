import { describe, it, expect } from 'vitest';
import {
  isSensitiveFile,
  findSensitiveFiles,
} from '../../src/renderer/components/sensitiveFiles';

// Sprint 7 — Tests für den Sensitive-File-Detector (Pre-Commit-Modal-Warnung,
// Q7 Variante A: hartcoded Patterns: .env(.*), secrets.*, *.key, *.pem).

describe('isSensitiveFile', () => {
  it('matched .env exact', () => {
    expect(isSensitiveFile('.env')).toBe(true);
    expect(isSensitiveFile('.env.local')).toBe(true);
    expect(isSensitiveFile('.env.production')).toBe(true);
    expect(isSensitiveFile('.env.development.local')).toBe(true);
  });

  it('matched secrets.* (egal welche Endung)', () => {
    expect(isSensitiveFile('secrets.json')).toBe(true);
    expect(isSensitiveFile('secrets.yaml')).toBe(true);
    expect(isSensitiveFile('secrets.toml')).toBe(true);
    expect(isSensitiveFile('secrets.txt')).toBe(true);
  });

  it('matched *.key', () => {
    expect(isSensitiveFile('private.key')).toBe(true);
    expect(isSensitiveFile('id_rsa.key')).toBe(true);
    expect(isSensitiveFile('certs/server.key')).toBe(true);
  });

  it('matched *.pem', () => {
    expect(isSensitiveFile('cert.pem')).toBe(true);
    expect(isSensitiveFile('certs/ca.pem')).toBe(true);
  });

  it('case-insensitive', () => {
    expect(isSensitiveFile('.ENV')).toBe(true);
    expect(isSensitiveFile('Server.KEY')).toBe(true);
    expect(isSensitiveFile('SECRETS.JSON')).toBe(true);
  });

  it('matched NICHT bei harmlosen Files', () => {
    expect(isSensitiveFile('README.md')).toBe(false);
    expect(isSensitiveFile('package.json')).toBe(false);
    expect(isSensitiveFile('docs/notes/api.md')).toBe(false);
    expect(isSensitiveFile('src/main.ts')).toBe(false);
  });

  it('matched NICHT, wenn nur der Pfad „pem" enthält, der Basename aber nicht', () => {
    // Wichtig für Defensiv-Korrektheit: Pfad-Matches dürfen keine False-Positives
    // erzeugen, sonst wird der Pre-Commit-Panel mit Quatsch-Warnungen vermüllt.
    expect(isSensitiveFile('docs/keyboard-notes.md')).toBe(false);
    expect(isSensitiveFile('apps/keyhouse/index.ts')).toBe(false);
    expect(isSensitiveFile('docs/pemtopics.md')).toBe(false);
  });

  it('matched NICHT, wenn .env-Präfix ohne Punkt-Trenner kommt', () => {
    expect(isSensitiveFile('.envrc')).toBe(false); // direnv-File, harmlos
    expect(isSensitiveFile('.environment')).toBe(false);
  });

  it('respektiert exakten Trenner für secrets.', () => {
    expect(isSensitiveFile('mysecrets.txt')).toBe(false);
    expect(isSensitiveFile('secrets')).toBe(false); // ohne Endung, nicht sensitiv
  });
});

describe('findSensitiveFiles', () => {
  it('liefert nur die sensitiven Pfade aus einer Liste', () => {
    const all = [
      'README.md',
      '.env',
      'src/main.ts',
      'secrets.json',
      'docs/notes.md',
      'certs/server.key',
    ];
    expect(findSensitiveFiles(all)).toEqual([
      '.env',
      'secrets.json',
      'certs/server.key',
    ]);
  });

  it('leeres Input → leeres Output', () => {
    expect(findSensitiveFiles([])).toEqual([]);
  });
});
