import { describe, it, expect } from 'vitest';
import {
  detectLanguageId,
  isPreviewableMarkdown,
  loadLanguageExtension,
} from '../../src/renderer/components/editorLanguage';

// Season 36 — Pure-Logik-Tests fuer die Suffix-basierte Sprach-Erkennung und
// den Lazy-Loader. Deckt nur das in dieser Season neu eingefuehrte Verhalten.

describe('detectLanguageId', () => {
  it('mappt die statisch gebundelten Sprachen', () => {
    expect(detectLanguageId('docs/CHANGELOG.md')).toBe('markdown');
    expect(detectLanguageId('README.markdown')).toBe('markdown');
    expect(detectLanguageId('config.yaml')).toBe('yaml');
    expect(detectLanguageId('config.yml')).toBe('yaml');
  });

  it('mappt die Lazy-Sprachen aus dem Briefing', () => {
    expect(detectLanguageId('src/app.js')).toBe('javascript');
    expect(detectLanguageId('src/app.jsx')).toBe('jsx');
    expect(detectLanguageId('src/app.ts')).toBe('typescript');
    expect(detectLanguageId('src/app.tsx')).toBe('tsx');
    expect(detectLanguageId('main.py')).toBe('python');
    expect(detectLanguageId('lib.rs')).toBe('rust');
    expect(detectLanguageId('main.go')).toBe('go');
    expect(detectLanguageId('package.json')).toBe('json');
    expect(detectLanguageId('styles.css')).toBe('css');
    expect(detectLanguageId('index.html')).toBe('html');
    expect(detectLanguageId('index.htm')).toBe('html');
  });

  it('hat Fallbacks fuer die ungewoehnlichen Modul-Endungen', () => {
    expect(detectLanguageId('esm.mjs')).toBe('javascript');
    expect(detectLanguageId('cjs-mod.cjs')).toBe('javascript');
    expect(detectLanguageId('types.mts')).toBe('typescript');
    expect(detectLanguageId('types.cts')).toBe('typescript');
  });

  it('behandelt die Sonderfaelle ohne CM6-Paket als plaintext', () => {
    expect(detectLanguageId('Cargo.toml')).toBe('plaintext');
    expect(detectLanguageId('schema.proto')).toBe('plaintext');
    expect(detectLanguageId('setup.ini')).toBe('plaintext');
  });

  it('faellt fuer unbekannte Endungen auf plaintext zurueck', () => {
    expect(detectLanguageId('data.xyz')).toBe('plaintext');
    expect(detectLanguageId('archive.tar')).toBe('plaintext');
  });

  it('behandelt Dotfiles und endungslose Pfade als plaintext', () => {
    expect(detectLanguageId('.gitignore')).toBe('plaintext');
    expect(detectLanguageId('Makefile')).toBe('plaintext');
    expect(detectLanguageId('docs/LICENSE')).toBe('plaintext');
  });

  it('ist case-insensitiv bei der Endung', () => {
    expect(detectLanguageId('NOTES.MD')).toBe('markdown');
    expect(detectLanguageId('App.TS')).toBe('typescript');
    expect(detectLanguageId('Page.HTML')).toBe('html');
  });

  it('wertet nur die letzte Endung im Dateinamen aus', () => {
    expect(detectLanguageId('component.test.ts')).toBe('typescript');
    expect(detectLanguageId('archive.tar.gz')).toBe('plaintext');
    expect(detectLanguageId('config.local.json')).toBe('json');
  });
});

describe('isPreviewableMarkdown', () => {
  it('ist nur fuer echte Markdown-Files true', () => {
    expect(isPreviewableMarkdown('docs/CHANGELOG.md')).toBe(true);
    expect(isPreviewableMarkdown('README.markdown')).toBe(true);
  });

  it('ist fuer YAML/JSON/Code/plaintext false', () => {
    expect(isPreviewableMarkdown('config.yaml')).toBe(false);
    expect(isPreviewableMarkdown('package.json')).toBe(false);
    expect(isPreviewableMarkdown('src/app.ts')).toBe(false);
    expect(isPreviewableMarkdown('Cargo.toml')).toBe(false);
  });
});

describe('loadLanguageExtension', () => {
  it('liefert eine Extension fuer Lazy-Sprachen', async () => {
    expect(await loadLanguageExtension('javascript')).not.toBeNull();
    expect(await loadLanguageExtension('typescript')).not.toBeNull();
    expect(await loadLanguageExtension('tsx')).not.toBeNull();
    expect(await loadLanguageExtension('python')).not.toBeNull();
    expect(await loadLanguageExtension('rust')).not.toBeNull();
    expect(await loadLanguageExtension('go')).not.toBeNull();
    expect(await loadLanguageExtension('json')).not.toBeNull();
    expect(await loadLanguageExtension('css')).not.toBeNull();
    expect(await loadLanguageExtension('html')).not.toBeNull();
  });

  it('liefert null fuer die synchron gebundelten und grammatiklosen Sprachen', async () => {
    // markdown/yaml setzt der Editor synchron, plaintext hat keine Grammatik —
    // fuer diese drei gibt es nichts nachzuladen.
    expect(await loadLanguageExtension('markdown')).toBeNull();
    expect(await loadLanguageExtension('yaml')).toBeNull();
    expect(await loadLanguageExtension('plaintext')).toBeNull();
  });

  it('cacht den Lade-Promise pro Sprache (kein doppelter Import)', () => {
    const first = loadLanguageExtension('python');
    const second = loadLanguageExtension('python');
    expect(first).toBe(second);
  });
});
