import { describe, it, expect } from 'vitest';
import {
  isSensitiveFile,
  findSensitiveFiles,
} from '../../src/renderer/components/sensitiveFiles';

// Sprint 7 — Tests für den Sensitive-File-Detector (Pre-Commit-Modal-Warnung).
// Sprint 8 / Bereich-8-Review — Pattern-Set verbreitert: *secret* (Substring),
// *token* (Substring), id_rsa-Varianten, credentials.{json,yaml,yml}.

describe('isSensitiveFile', () => {
  it('matched .env exact', () => {
    expect(isSensitiveFile('.env')).toBe(true);
    expect(isSensitiveFile('.env.local')).toBe(true);
    expect(isSensitiveFile('.env.production')).toBe(true);
    expect(isSensitiveFile('.env.development.local')).toBe(true);
  });

  it('matched alles mit „secret" im Basename', () => {
    expect(isSensitiveFile('secrets.json')).toBe(true);
    expect(isSensitiveFile('secrets.yaml')).toBe(true);
    expect(isSensitiveFile('secrets.toml')).toBe(true);
    expect(isSensitiveFile('secrets.txt')).toBe(true);
    // Bereich-8-Review: Substring-Match, fängt auch nicht-secrets.-Files
    expect(isSensitiveFile('mysecrets.txt')).toBe(true);
    expect(isSensitiveFile('api-secret.txt')).toBe(true);
    expect(isSensitiveFile('my_secret_config.json')).toBe(true);
  });

  it('matched alles mit „token" im Basename', () => {
    expect(isSensitiveFile('auth-token.txt')).toBe(true);
    expect(isSensitiveFile('github_token.env')).toBe(true);
    expect(isSensitiveFile('access_token.json')).toBe(true);
  });

  it('matched SSH-Private-Keys (id_rsa und Varianten)', () => {
    expect(isSensitiveFile('id_rsa')).toBe(true);
    expect(isSensitiveFile('id_dsa')).toBe(true);
    expect(isSensitiveFile('id_ecdsa')).toBe(true);
    expect(isSensitiveFile('id_ed25519')).toBe(true);
    // Mit Endung (.pub ist eigentlich der Public-Key — wir warnen lieber zu viel als zu wenig)
    expect(isSensitiveFile('id_rsa.pub')).toBe(true);
  });

  it('matched credentials.{json,yaml,yml}', () => {
    expect(isSensitiveFile('credentials.json')).toBe(true);
    expect(isSensitiveFile('credentials.yaml')).toBe(true);
    expect(isSensitiveFile('credentials.yml')).toBe(true);
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

  it('matched PKCS#12-Keystores (*.pfx / *.p12)', () => {
    expect(isSensitiveFile('client.pfx')).toBe(true);
    expect(isSensitiveFile('keystore.p12')).toBe(true);
    expect(isSensitiveFile('certs/server.PFX')).toBe(true);
  });

  it('matched Registry-Auth-Files (.npmrc / .pypirc) und .htpasswd', () => {
    expect(isSensitiveFile('.npmrc')).toBe(true);
    expect(isSensitiveFile('.pypirc')).toBe(true);
    expect(isSensitiveFile('.htpasswd')).toBe(true);
    // Nur der exakte Basename — kein False-Positive auf abgeleitete Namen
    expect(isSensitiveFile('npmrc.example')).toBe(false);
  });

  it('case-insensitive', () => {
    expect(isSensitiveFile('.ENV')).toBe(true);
    expect(isSensitiveFile('Server.KEY')).toBe(true);
    expect(isSensitiveFile('SECRETS.JSON')).toBe(true);
    expect(isSensitiveFile('ID_RSA')).toBe(true);
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
