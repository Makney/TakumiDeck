import { describe, it, expect } from 'vitest';
import { extractTemplateBody } from '../../src/renderer/components/templateBody';

describe('extractTemplateBody', () => {
  it('liefert den ersten Code-Fence-Inhalt unter "## Vorlage"', () => {
    const md = [
      '# Season-Prompt-Template',
      '',
      'Erklärtext, der nicht in den Prompt soll.',
      '',
      '## Vorlage (Inhalt)',
      '```',
      'Season {{NEXT_SEASON_NR}}: {{FEATURE_NAME}}',
      'Aufgabe: {{AUFGABE}}',
      '```',
      '',
      '## Beispiel',
      '... das hier auch nicht ...',
    ].join('\n');
    expect(extractTemplateBody(md)).toBe(
      'Season {{NEXT_SEASON_NR}}: {{FEATURE_NAME}}\nAufgabe: {{AUFGABE}}',
    );
  });

  it('akzeptiert "## Vorlage" ohne Klammern-Zusatz', () => {
    const md = ['## Vorlage', '```', 'pure prompt', '```'].join('\n');
    expect(extractTemplateBody(md)).toBe('pure prompt');
  });

  it('akzeptiert Heading-Level 3 (### Vorlage)', () => {
    const md = ['### Vorlage', '```', 'pure prompt', '```'].join('\n');
    expect(extractTemplateBody(md)).toBe('pure prompt');
  });

  it('Heading-Match ist case-insensitive', () => {
    const md = ['## vorlage (inhalt)', '```', 'pure prompt', '```'].join('\n');
    expect(extractTemplateBody(md)).toBe('pure prompt');
  });

  it('Fallback: liefert vollen Content, wenn kein Vorlage-Heading existiert', () => {
    const md = '# Titel\n\nFreier Markdown-Text ohne Vorlage-Sektion.';
    expect(extractTemplateBody(md)).toBe(md);
  });

  it('Fallback: liefert vollen Content, wenn unter dem Heading kein Fence kommt', () => {
    const md = ['## Vorlage', '', 'kein Fence, nur Fliesstext.', ''].join('\n');
    expect(extractTemplateBody(md)).toBe(md);
  });

  it('Fallback: liefert vollen Content, wenn der Fence nie geschlossen wird', () => {
    const md = ['## Vorlage', '```', 'never closes...'].join('\n');
    expect(extractTemplateBody(md)).toBe(md);
  });

  it('toleriert Tilde-Fences anstelle von Backticks', () => {
    const md = ['## Vorlage', '~~~', 'tilde body', '~~~'].join('\n');
    expect(extractTemplateBody(md)).toBe('tilde body');
  });

  it('toleriert Info-String nach den Backticks (```text)', () => {
    const md = ['## Vorlage', '```text', 'mit info-string', '```'].join('\n');
    expect(extractTemplateBody(md)).toBe('mit info-string');
  });

  it('toleriert Einleitungstext zwischen Heading und Fence', () => {
    const md = [
      '## Vorlage (Inhalt)',
      '',
      'Kurzer Hinweis ueber den Block.',
      '',
      '```',
      'der Prompt',
      '```',
    ].join('\n');
    expect(extractTemplateBody(md)).toBe('der Prompt');
  });

  it('bricht ab, wenn vor dem Fence schon ein neues ##-Heading kommt', () => {
    const md = [
      '## Vorlage',
      '',
      '## Weiteres Heading',
      '```',
      'gehoert nicht zur Vorlage',
      '```',
    ].join('\n');
    expect(extractTemplateBody(md)).toBe(md);
  });

  it('trimmt fuehrende und nachgestellte Leerzeilen innerhalb des Fence', () => {
    const md = ['## Vorlage', '```', '', 'eigentlicher Prompt', '', '```'].join('\n');
    expect(extractTemplateBody(md)).toBe('eigentlicher Prompt');
  });

  it('beruehrt {{...}}-Tokens nicht', () => {
    const md = ['## Vorlage', '```', '{{FEATURE_NAME}} → {{AUFGABE}}', '```'].join('\n');
    expect(extractTemplateBody(md)).toBe('{{FEATURE_NAME}} → {{AUFGABE}}');
  });
});
