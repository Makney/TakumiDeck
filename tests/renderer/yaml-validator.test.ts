import { describe, it, expect } from 'vitest';
import {
  extractFrontmatter,
  validateClaudeMdYaml,
} from '../../src/renderer/components/yamlValidator';

// Sprint 7 — Pure-Logik-Tests für die Inline-YAML-Validation der CLAUDE.md
// (Q4 Variante B: Debounce kommt vom CM6-Linter; diese Funktion ist die
// reine Validation, kein Side-Effect, kein Timer).

describe('extractFrontmatter', () => {
  it('liefert Body + startLine bei korrektem Frontmatter (LF)', () => {
    const src = '---\nfoo: 1\nbar: 2\n---\n\n# Heading\n';
    const block = extractFrontmatter(src);
    expect(block).not.toBeNull();
    expect(block!.body).toBe('foo: 1\nbar: 2');
    expect(block!.startLine).toBe(2);
  });

  it('akzeptiert CRLF-Datei-Anfang', () => {
    const src = '---\r\nfoo: 1\r\n---\r\n';
    const block = extractFrontmatter(src);
    expect(block).not.toBeNull();
    expect(block!.body).toBe('foo: 1');
  });

  it('null, wenn die Datei nicht mit --- startet', () => {
    expect(extractFrontmatter('# CLAUDE.md\n')).toBeNull();
    expect(extractFrontmatter('')).toBeNull();
  });

  it('null, wenn der schließende --- fehlt', () => {
    const src = '---\nfoo: 1\n# heading without closing\n';
    expect(extractFrontmatter(src)).toBeNull();
  });
});

describe('validateClaudeMdYaml', () => {
  it('ok=true, wenn kein Frontmatter da ist (legitim laut Architektur 5)', () => {
    const result = validateClaudeMdYaml('# Just markdown\n');
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('ok=true bei valider workbench-Section', () => {
    const src = `---
workbench:
  project_name: TakumiDeck
  trigger_phrases:
    docs_update: ist korrekt umgesetzt
    commit: commit
---

# TakumiDeck
`;
    const result = validateClaudeMdYaml(src);
    expect(result.ok).toBe(true);
  });

  it('ok=false bei kaputtem YAML mit Position', () => {
    const src = `---
workbench:
  trigger_phrases: { docs_update: 'x', commit:
---
`;
    const result = validateClaudeMdYaml(src);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    const err = result.errors[0]!;
    // Position muss in die Datei (nicht nur in den YAML-Block) zeigen.
    if (err.line !== null) {
      expect(err.line).toBeGreaterThanOrEqual(2);
    }
    expect(err.message.length).toBeGreaterThan(0);
  });

  it('Tabs in Indentation → YAML-Fehler', () => {
    // YAML verbietet Tabs in Indentation.
    const src = '---\nworkbench:\n\tfoo: 1\n---\n';
    const result = validateClaudeMdYaml(src);
    expect(result.ok).toBe(false);
  });

  it('Zeilennummer mappt auf die Quell-Datei (nicht auf den YAML-Block intern)', () => {
    // Block-interne Zeile 2 = Datei-Zeile 3 (1=---, 2=foo, 3=bar).
    const src = '---\nfoo: 1\nbar: : invalid\n---\n';
    const result = validateClaudeMdYaml(src);
    expect(result.ok).toBe(false);
    const err = result.errors[0]!;
    if (err.line !== null) {
      // js-yaml reportet meist die Fehlerzeile selbst, gelegentlich die nächste —
      // wir prüfen, dass die Zeilennummer mindestens IM YAML-Block-Bereich liegt
      // und nicht z.B. 0 oder 1 (was auf eine fehlerhafte Block-Offset-Rechnung
      // hindeuten würde).
      expect(err.line).toBeGreaterThanOrEqual(2);
      expect(err.line).toBeLessThanOrEqual(5);
    }
  });
});
