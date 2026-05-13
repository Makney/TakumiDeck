import { describe, it, expect } from 'vitest';
import {
  formatLetzteEntscheidungen,
  formatTechSchuldenRelevant,
  parseMarkdownSections,
} from '../../src/main/templates/docsParser';

describe('parseMarkdownSections', () => {
  it('splittet auf `##`-Headings und ignoriert `#`-Datei-Titel', () => {
    const md = [
      '# Dateititel',
      '',
      'Einleitung.',
      '',
      '## Erster Eintrag',
      '',
      'Body A',
      '',
      '## Zweiter Eintrag',
      'Body B',
    ].join('\n');
    const sections = parseMarkdownSections(md);
    expect(sections).toEqual([
      { title: 'Erster Eintrag', body: 'Body A' },
      { title: 'Zweiter Eintrag', body: 'Body B' },
    ]);
  });

  it('trimmt trailing `---`-Trennlinien aus dem Body', () => {
    const md = ['## A', 'Inhalt', '', '---', '', '## B', 'B-Inhalt'].join('\n');
    const sections = parseMarkdownSections(md);
    expect(sections[0]?.body).toBe('Inhalt');
    expect(sections[1]?.body).toBe('B-Inhalt');
  });

  it('ignoriert `##`-Treffer innerhalb von Code-Bloecken', () => {
    const md = [
      '## Real',
      'vor dem Block',
      '```',
      '## NICHT als Heading werten',
      '```',
      'nach dem Block',
    ].join('\n');
    const sections = parseMarkdownSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.title).toBe('Real');
    expect(sections[0]?.body).toContain('## NICHT als Heading werten');
  });

  it('liefert leeres Array, wenn die Datei keine `##`-Sections enthaelt', () => {
    expect(parseMarkdownSections('# Nur Titel\n\nText')).toEqual([]);
  });
});

describe('formatTechSchuldenRelevant', () => {
  const sample = [
    '# Technische Schulden',
    '',
    'Einleitung, die ignoriert wird.',
    '',
    '## Schuld A',
    '',
    '**Bereich:** tsconfig.json',
    '',
    '**Was:** Compiler-Option steht auf false.',
    '',
    '**Risiko:** schwammig.',
    '',
    '---',
    '',
    '## Schuld B ✅',
    '',
    '**Bereich:** package.json',
    '',
    '**Was:** war frueher ein Problem.',
    '',
    '---',
    '',
    '## Schuld C',
    '',
    '**Bereich:** main.ts',
    '',
    '**Was:** Hack mit Risiko.',
    '',
    '---',
    '',
    '## Schuld D',
    '',
    '**Bereich:** renderer',
    '',
    '**Was:** verzoegerte Loesung.',
  ].join('\n');

  it('liefert Top-N offene Eintraege in Datei-Reihenfolge', () => {
    const result = formatTechSchuldenRelevant(sample, 3);
    expect(result).toBe(
      [
        '- Schuld A',
        '  Bereich: tsconfig.json',
        '  Was: Compiler-Option steht auf false.',
        '',
        '- Schuld C',
        '  Bereich: main.ts',
        '  Was: Hack mit Risiko.',
        '',
        '- Schuld D',
        '  Bereich: renderer',
        '  Was: verzoegerte Loesung.',
      ].join('\n'),
    );
  });

  it('filtert Eintraege mit ✅ im Titel raus', () => {
    const result = formatTechSchuldenRelevant(sample, 10);
    expect(result).not.toContain('Schuld B');
  });

  it('limit=0 liefert leeren String', () => {
    expect(formatTechSchuldenRelevant(sample, 0)).toBe('');
  });

  it('limit=1 liefert nur den ersten offenen Eintrag', () => {
    const result = formatTechSchuldenRelevant(sample, 1);
    expect(result).toContain('Schuld A');
    expect(result).not.toContain('Schuld C');
    expect(result).not.toContain('Schuld D');
  });

  it('liefert leeren String, wenn keine offenen Eintraege existieren', () => {
    const allResolved = '# Titel\n\n## Erledigt A ✅\n\n## Erledigt B ✅';
    expect(formatTechSchuldenRelevant(allResolved, 3)).toBe('');
  });

  it('Eintrag ohne Bereich-Label wird als META gefiltert', () => {
    // Echter Eintrag MUSS `**Bereich:**` tragen — sonst META.
    const md = '# Titel\n\n## Schuld ohne Felder\n\nFreitext-Body.';
    expect(formatTechSchuldenRelevant(md, 3)).toBe('');
  });

  it('Meta-Sections (Unterschied/Wann/Format) werden NICHT in die Top-3 aufgenommen', () => {
    const md = [
      '# Technische Schulden',
      '',
      '## Unterschied zu anderen Dokumenten',
      '',
      '- ENTSCHEIDUNGEN.md haelt …',
      '- FEATURES.md haelt …',
      '',
      '## Wann kommt ein Eintrag hier rein?',
      '',
      '- Temporaere Loesung …',
      '',
      '## Format pro Eintrag',
      '',
      '- `##`-Ueberschrift mit Titel.',
      '',
      '---',
      '',
      '## Echte Schuld',
      '',
      '**Bereich:** tsconfig.json',
      '',
      '**Was:** Compiler-Option steht auf false.',
    ].join('\n');
    const result = formatTechSchuldenRelevant(md, 3);
    expect(result).toContain('Echte Schuld');
    expect(result).not.toContain('Unterschied zu anderen Dokumenten');
    expect(result).not.toContain('Wann kommt ein Eintrag hier rein?');
    expect(result).not.toContain('Format pro Eintrag');
  });
});

describe('formatLetzteEntscheidungen', () => {
  const sample = [
    '# Design-Entscheidungen',
    '',
    'Einleitung, die ignoriert wird.',
    '',
    '## Trigger-Phrasen-Schnellbuttons',
    '',
    '**Entscheidung:** Die Action-Bar rendert pro Eintrag eine Pille. Der Catchall greift.',
    '',
    '**Varianten:**',
    '- A …',
    '- B (gewaehlt)',
    '',
    '---',
    '',
    '## Screenshot-Drop',
    '',
    '**Entscheidung:** Ablage in userData-Screenshots.',
    '',
    '---',
    '',
    '## TUI-State-Detection',
    '',
    '**Entscheidung:** Renderer pusht waiting, Main pusht idle.',
    '',
    '---',
    '',
    '## Vier-Eintrag',
    '',
    '**Entscheidung:** Wird ignoriert, weil Top-3.',
  ].join('\n');

  it('liefert Top-3 Eintraege mit Entscheidung-Zeile', () => {
    const result = formatLetzteEntscheidungen(sample, 3);
    expect(result).toBe(
      [
        '- Trigger-Phrasen-Schnellbuttons',
        '  Entscheidung: Die Action-Bar rendert pro Eintrag eine Pille. Der Catchall greift.',
        '',
        '- Screenshot-Drop',
        '  Entscheidung: Ablage in userData-Screenshots.',
        '',
        '- TUI-State-Detection',
        '  Entscheidung: Renderer pusht waiting, Main pusht idle.',
      ].join('\n'),
    );
  });

  it('vierter Eintrag wird bei limit=3 unterschlagen', () => {
    expect(formatLetzteEntscheidungen(sample, 3)).not.toContain('Vier-Eintrag');
  });

  it('limit=0 liefert leeren String', () => {
    expect(formatLetzteEntscheidungen(sample, 0)).toBe('');
  });

  it('Eintrag ohne Entscheidung-Label wird als META gefiltert', () => {
    const md = '## Nur Titel\n\nFreitext.';
    expect(formatLetzteEntscheidungen(md, 1)).toBe('');
  });

  it('Meta-Sections (Wann/Format) werden NICHT in die Top-3 aufgenommen', () => {
    const md = [
      '# Design-Entscheidungen',
      '',
      '## Wann kommt ein Eintrag hier rein?',
      '',
      '- Scope-Frage mit mehreren Loesungen.',
      '',
      '## Format pro Eintrag',
      '',
      '- `##`-Heading mit Titel.',
      '',
      '---',
      '',
      '## Echte Entscheidung',
      '',
      '**Entscheidung:** Variante B gewinnt.',
    ].join('\n');
    const result = formatLetzteEntscheidungen(md, 3);
    expect(result).toContain('Echte Entscheidung');
    expect(result).not.toContain('Wann kommt ein Eintrag hier rein?');
    expect(result).not.toContain('Format pro Eintrag');
  });

  it('mehrzeilige Entscheidung-Zeile wird zusammengezogen', () => {
    const md = [
      '## A',
      '',
      '**Entscheidung:** Zeile eins',
      'Zeile zwei',
      'Zeile drei',
      '',
      '**Grund:** Folgt danach.',
    ].join('\n');
    expect(formatLetzteEntscheidungen(md, 1)).toBe(
      '- A\n  Entscheidung: Zeile eins Zeile zwei Zeile drei',
    );
  });
});
