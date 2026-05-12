import { describe, it, expect } from 'vitest';
import {
  detectFromBuffer,
  getPatternVersion,
  PATTERN_VERSIONS,
  DEFAULT_PATTERN_VERSION_ID,
} from '../../src/shared/tui-patterns';

// Schema-Test pro Claude-Code-Version (Phase-2 Season-1, Sprint-9-Backlog-Anker
// „Versionierte Pattern-Definition mit Schema-Test pro Claude-Code-Version").
//
// Jede Version bringt ihre eigenen Fixtures mit; diese Schleife rollt sie aus,
// sodass neue Pattern-Versionen automatisch unter den Test-Pass fallen. Eine
// Version ist „grün", wenn alle Fixtures die erwartete Klassifikation liefern.

describe('PATTERN_VERSIONS — Schema-Tests pro Claude-Code-Version', () => {
  it('mindestens eine Version definiert', () => {
    expect(PATTERN_VERSIONS.length).toBeGreaterThan(0);
  });

  it('DEFAULT_PATTERN_VERSION_ID zeigt auf eine registrierte Version', () => {
    const ids = PATTERN_VERSIONS.map((v) => v.id);
    expect(ids).toContain(DEFAULT_PATTERN_VERSION_ID);
  });

  for (const version of PATTERN_VERSIONS) {
    describe(`Version ${version.id} — ${version.description}`, () => {
      it('hat Fixtures definiert', () => {
        expect(version.fixtures.length).toBeGreaterThan(0);
      });

      for (const fixture of version.fixtures) {
        it(`Fixture: ${fixture.description}`, () => {
          const result = detectFromBuffer({
            lines: fixture.lines,
            bufferChanged: fixture.bufferChanged,
            versionId: version.id,
          });
          expect(result).toBe(fixture.expected);
        });
      }
    });
  }
});

// ---- detectFromBuffer Edge-Cases (versions-übergreifend) ------------------

describe('detectFromBuffer — Edge-Cases', () => {
  it('leere lines + bufferChanged=false → idle', () => {
    expect(detectFromBuffer({ lines: [], bufferChanged: false })).toBe('idle');
  });

  it('leere lines + bufferChanged=true → idle (kein Inhalt zum Klassifizieren)', () => {
    // Auch ein „running"-Hint kann ohne Inhalt nicht zu running werden — wir kürzen
    // Trailing-Empty-Lines weg, was bei []-Input das gleiche Ergebnis ergibt: idle.
    expect(detectFromBuffer({ lines: [], bufferChanged: true })).toBe('idle');
  });

  it('nur Whitespace-Zeilen → idle', () => {
    expect(
      detectFromBuffer({ lines: ['   ', '\t', ''], bufferChanged: true }),
    ).toBe('idle');
  });

  it('Permission-Prompt hat Vorrang vor Waiting-Pattern', () => {
    // Letzte Zeile sieht aus wie ein Waiting-Prompt (`>` allein), aber der Tail
    // enthält auch eine „Do you want to…"-Frage — permission-prompt gewinnt.
    const lines = [
      'Bash: ls -la',
      'Do you want to continue?',
      '> ',
    ];
    expect(detectFromBuffer({ lines, bufferChanged: false })).toBe(
      'permission-prompt',
    );
  });

  it('unbekannte versionId fällt auf Default zurück', () => {
    const version = getPatternVersion('unbekannt');
    expect(version.id).toBe(DEFAULT_PATTERN_VERSION_ID);
  });

  it('detectFromBuffer ohne versionId nutzt Default', () => {
    const result = detectFromBuffer({
      lines: ['> '],
      bufferChanged: false,
    });
    expect(result).toBe('waiting');
  });
});
