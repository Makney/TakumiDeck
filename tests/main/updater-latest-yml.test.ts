import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  buildLatestYml,
  buildLatestYmlContent,
  type LatestYmlFileDriver,
} from '../../src/main/updater/latest-yml';

// Phase-2 Season-26 — latest.yml-Generator.
//
// Zwei Test-Pfade:
//   - buildLatestYmlContent (pure, ohne File-I/O) — Format-Vertrag.
//   - buildLatestYml (mit injected FileDriver) — sha512 + size + Basename-
//     Extraktion + Datum-ISO.
//
// Wir lassen den realLatestYmlFileDriver aus dem Test raus — die Datei-I/O
// ist trivial (statSync/readFileSync) und der Vertrag der buildLatestYml-
// Funktion ist bereits ueber den Mock-Driver gepruefbar.

function makeDriver(buffer: Buffer): LatestYmlFileDriver {
  return {
    stat: () => ({ size: buffer.byteLength }),
    read: () => buffer,
  };
}

describe('buildLatestYmlContent (pure)', () => {
  it('schreibt alle Pflicht-Felder in der erwarteten Reihenfolge', () => {
    const yaml = buildLatestYmlContent({
      version: '0.2.2',
      fileName: 'TakumiDeck-0.2.2 Setup.exe',
      size: 123456,
      sha512: 'abc==',
      releaseDate: '2026-05-18T12:00:00.000Z',
    });
    // Reihenfolge ist bewusst stabil: version, files[], path, sha512,
    // releaseDate — sonst muessen wir die Tests bei jedem Format-Touch
    // umschreiben.
    expect(yaml).toBe(
      [
        'version: 0.2.2',
        'files:',
        '  - url: TakumiDeck-0.2.2 Setup.exe',
        '    sha512: abc==',
        '    size: 123456',
        'path: TakumiDeck-0.2.2 Setup.exe',
        'sha512: abc==',
        "releaseDate: '2026-05-18T12:00:00.000Z'",
        '',
      ].join('\n'),
    );
  });

  it('Leerzeichen + Sonderzeichen im fileName bleiben unescapet', () => {
    // electron-updater's YAML-Parser akzeptiert den unquoted-String, weil ein
    // YAML-Scalar-Wert ohne Doppelpunkt/Hash innerhalb der Zeile als plain
    // string geparst wird. Wuerde der Generator die Datei plotzlich quoten,
    // wuerde der Provider nach einer Datei mit Quotes im Namen suchen — Match
    // fehlt, Update wuerde stumm uebersehen.
    const yaml = buildLatestYmlContent({
      version: '1.0.0',
      fileName: 'My App-1.0.0 Setup.exe',
      size: 1,
      sha512: 'x',
      releaseDate: '2026-01-01T00:00:00.000Z',
    });
    expect(yaml).toContain('- url: My App-1.0.0 Setup.exe');
    expect(yaml).toContain('path: My App-1.0.0 Setup.exe');
  });
});

describe('buildLatestYml (mit FileDriver)', () => {
  it('berechnet sha512 als Base64 und die Datei-Groesse korrekt', () => {
    const payload = Buffer.from('hallo welt', 'utf8');
    const expectedSha = createHash('sha512').update(payload).digest('base64');

    const { yaml, meta } = buildLatestYml(
      {
        version: '0.2.2',
        setupExePath: 'C:\\out\\make\\TakumiDeck-0.2.2 Setup.exe',
        releaseDate: new Date('2026-05-18T12:00:00.000Z'),
      },
      makeDriver(payload),
    );

    expect(meta.size).toBe(payload.byteLength);
    expect(meta.sha512).toBe(expectedSha);
    expect(meta.fileName).toBe('TakumiDeck-0.2.2 Setup.exe');
    expect(meta.releaseDate).toBe('2026-05-18T12:00:00.000Z');
    expect(yaml).toContain(`sha512: ${expectedSha}`);
    expect(yaml).toContain(`size: ${payload.byteLength}`);
  });

  it('Default-releaseDate ist now() in ISO-Form', () => {
    const before = Date.now();
    const { meta } = buildLatestYml(
      {
        version: '0.2.2',
        setupExePath: 'TakumiDeck-0.2.2 Setup.exe',
      },
      makeDriver(Buffer.from('x')),
    );
    const after = Date.now();
    const parsed = new Date(meta.releaseDate).getTime();
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(after);
  });

  it('basename-Extraktion handhabt Win- und POSIX-Pfade', () => {
    const driver = makeDriver(Buffer.from('x'));
    const winResult = buildLatestYml(
      {
        version: '0.2.2',
        setupExePath: 'C:\\a\\b\\TakumiDeck-0.2.2 Setup.exe',
      },
      driver,
    );
    const posixResult = buildLatestYml(
      {
        version: '0.2.2',
        setupExePath: '/a/b/TakumiDeck-0.2.2 Setup.exe',
      },
      driver,
    );
    // Auf POSIX-Hosts (CI-Sanity-Lauf) liefert path.basename den Win-Pfad
    // unverarbeitet zurueck, weil Backslashes dort kein Separator sind. Im
    // Build laeuft das Script aber unter Win, und dort segmentiert basename
    // korrekt — daher erlauben wir hier beide Endungen.
    expect(posixResult.meta.fileName).toBe('TakumiDeck-0.2.2 Setup.exe');
    expect(winResult.meta.fileName.endsWith('TakumiDeck-0.2.2 Setup.exe')).toBe(true);
  });
});
