import { describe, it, expect } from 'vitest';
import { normalize } from '../../src/renderer/components/fileBrowserPrefs';

// Phase-2 Season-29.5: defensives Parsen der localStorage-Prefs. Wir testen
// nur die `normalize`-Pure-Funktion — der Disk-IO ueber localStorage ist im
// jsdom-Test-Env nicht der Punkt; Round-Trip-Korrektheit ergibt sich aus
// normalize(JSON.parse(JSON.stringify(prefs))).

describe('normalize (FileBrowserPrefs)', () => {
  it('valides Objekt geht durch', () => {
    const result = normalize({ query: '.ts', extensions: ['.ts', '.json'] });
    expect(result.query).toBe('.ts');
    expect(result.extensions).toEqual(['.ts', '.json']);
  });

  it('null/undefined → Default-Prefs (.md, leere Endungen)', () => {
    const result = normalize(null);
    expect(result.query).toBe('.md');
    expect(result.extensions).toEqual([]);
  });

  it('falscher Top-Level-Typ → Default-Prefs', () => {
    expect(normalize('garbage').query).toBe('.md');
    expect(normalize(42).extensions).toEqual([]);
  });

  it('fehlende Felder → einzelne Defaults', () => {
    const onlyQuery = normalize({ query: '.tsx' });
    expect(onlyQuery.query).toBe('.tsx');
    expect(onlyQuery.extensions).toEqual([]);

    const onlyExts = normalize({ extensions: ['.css'] });
    expect(onlyExts.query).toBe('.md');
    expect(onlyExts.extensions).toEqual(['.css']);
  });

  it('falsche Feldtypen werden auf Defaults korrigiert', () => {
    const result = normalize({ query: 123, extensions: 'oops' });
    expect(result.query).toBe('.md');
    expect(result.extensions).toEqual([]);
  });

  it('extensions-Array mit Schrott-Elementen → nur die gueltigen Strings', () => {
    const result = normalize({
      query: '',
      extensions: ['.ts', 42, null, '', '.json'],
    });
    expect(result.extensions).toEqual(['.ts', '.json']);
  });
});
