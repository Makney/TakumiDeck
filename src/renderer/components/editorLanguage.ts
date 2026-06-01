import type { Extension } from '@codemirror/state';

// Season 36 — Sprach-Erkennung + Lazy-Loading der CodeMirror-6-Sprachpakete.
//
// Bis Season 35 kannte der Editor nur Markdown + YAML; Programmiersprachen-
// Files liefen ohne Highlighting im Plain-Text-Modus. Dieses Modul leitet die
// Sprache aus dem Datei-Suffix ab und laedt das passende CM6-Paket erst beim
// ersten Treffer nach (dynamic import → eigener Vite-Chunk), damit der
// Initial-Bundle nicht alle Grammatiken mitschleppt.

// Sprach-Kennung. 'markdown'/'yaml' liegen statisch im Editor-Bundle (haeufigste
// Files, kein Lazy-Flash beim Oeffnen). Der Rest wird lazy geladen.
// 'plaintext' = bewusst keine Grammatik (Sonderfaelle + unbekannte Endungen).
export type EditorLanguageId =
  | 'markdown'
  | 'yaml'
  | 'json'
  | 'javascript'
  | 'jsx'
  | 'typescript'
  | 'tsx'
  | 'python'
  | 'rust'
  | 'go'
  | 'css'
  | 'html'
  | 'plaintext';

// Suffix → Sprache. Endungen ohne Punkt, lowercase. Die `.mjs`/`.cjs`/`.mts`/
// `.cts`-Eintraege sind die im Briefing geforderten Fallbacks fuer die
// ungewoehnlichen Modul-Endungen.
const EXTENSION_LANGUAGE_MAP: Record<string, EditorLanguageId> = {
  md: 'markdown',
  markdown: 'markdown',
  yaml: 'yaml',
  yml: 'yaml',
  json: 'json',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'jsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'tsx',
  py: 'python',
  pyi: 'python',
  rs: 'rust',
  go: 'go',
  css: 'css',
  html: 'html',
  htm: 'html',
};

// Sonderfaelle ohne offizielles CM6-Paket: bleiben bewusst Plain-Text, aber
// dokumentiert — damit klar ist, dass das eine Entscheidung und kein
// vergessenes Mapping ist. Erweiterbar, falls spaeter eine Grammatik dazukommt.
const PLAINTEXT_EXTENSIONS = new Set(['toml', 'proto', 'ini']);

// Endung aus einem Forward-Slash-Pfad ziehen, lowercase, ohne Punkt.
function extractExtension(filePath: string): string {
  const base = filePath.slice(filePath.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  // dot <= 0 → kein Suffix oder Dotfile (z.B. `.gitignore`) → kein Suffix.
  if (dot <= 0) return '';
  return base.slice(dot + 1).toLowerCase();
}

export function detectLanguageId(filePath: string): EditorLanguageId {
  const ext = extractExtension(filePath);
  if (ext === '') return 'plaintext';
  if (PLAINTEXT_EXTENSIONS.has(ext)) return 'plaintext';
  return EXTENSION_LANGUAGE_MAP[ext] ?? 'plaintext';
}

// Nur echte Markdown-Files bekommen den Preview-Toggle. YAML/JSON/Code laufen
// editor-only — bei ihnen blendet die Toolbar die Preview-Pillen aus.
export function isPreviewableMarkdown(filePath: string): boolean {
  return detectLanguageId(filePath) === 'markdown';
}

// Geladene Pakete cacht der Modul-Loader selbst; dieser Promise-Cache verhindert
// zusaetzlich doppelte Import-Anlaeufe bei schnellem Datei-Wechsel.
const lazyCache = new Map<EditorLanguageId, Promise<Extension | null>>();

async function importLanguage(langId: EditorLanguageId): Promise<Extension | null> {
  switch (langId) {
    case 'json': {
      const { json } = await import('@codemirror/lang-json');
      return json();
    }
    case 'javascript': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript();
    }
    case 'jsx': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ jsx: true });
    }
    case 'typescript': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ typescript: true });
    }
    case 'tsx': {
      const { javascript } = await import('@codemirror/lang-javascript');
      return javascript({ jsx: true, typescript: true });
    }
    case 'python': {
      const { python } = await import('@codemirror/lang-python');
      return python();
    }
    case 'rust': {
      const { rust } = await import('@codemirror/lang-rust');
      return rust();
    }
    case 'go': {
      const { go } = await import('@codemirror/lang-go');
      return go();
    }
    case 'css': {
      const { css } = await import('@codemirror/lang-css');
      return css();
    }
    case 'html': {
      const { html } = await import('@codemirror/lang-html');
      return html();
    }
    // markdown/yaml liegen synchron im Editor, plaintext hat keine Grammatik —
    // fuer diese drei gibt es nichts nachzuladen.
    case 'markdown':
    case 'yaml':
    case 'plaintext':
      return null;
  }
}

// Laedt das CM6-Sprachpaket fuer die gegebene Sprache nach und liefert die
// Extension (oder null fuer markdown/yaml/plaintext, die kein Lazy-Load
// brauchen). Auto-Indent + Bracket-Matching kommen pro Sprache automatisch
// ueber das jeweilige `lang-*`-Paket mit.
export function loadLanguageExtension(langId: EditorLanguageId): Promise<Extension | null> {
  let cached = lazyCache.get(langId);
  if (!cached) {
    cached = importLanguage(langId);
    lazyCache.set(langId, cached);
  }
  return cached;
}
