import yaml from 'js-yaml';

// Pure-Logik für die Inline-YAML-Validation des CLAUDE.md-Frontmatter
// (Sprint 7, Q4 Variante B: Trigger via 500ms-Debounce im Linter; diese Funktion
// ist die reine Validation, kein Side-Effect, kein Debounce hier).
//
// Verhalten:
//   - Kein Frontmatter da → ok=true, errors=[] (legitimer Zustand laut Architektur 5).
//   - Frontmatter-Block gefunden → js-yaml-Parse. Bei YAMLException liefern wir
//     line/column relativ zur Quell-Datei (nicht zum YAML-Block intern), damit
//     ein Editor-Marker direkt auf die richtige Zeile zeigt.
//   - Sonstiger Fehler → einzelner Fehler ohne Position.
//
// Wir validieren NUR das YAML-Schema, nicht das workbench-Schema (das macht
// ClaudeMdFrontmatterSchema zod-side im Main beim project:read-claude-md).
// Inline-Validation soll schnell sein und nur Tippfehler im YAML zeigen.

export interface YamlValidationError {
  // 1-basierte Zeile in der Quell-Datei (nicht im Frontmatter-Block).
  // null = js-yaml hat keine Position geliefert (z.B. Schema-Fehler ohne mark).
  line: number | null;
  // 1-basierte Spalte. Nullable wie line.
  column: number | null;
  message: string;
}

export interface YamlValidationResult {
  ok: boolean;
  errors: YamlValidationError[];
}

export function validateClaudeMdYaml(source: string): YamlValidationResult {
  const block = extractFrontmatter(source);
  if (block === null) return { ok: true, errors: [] };
  try {
    yaml.load(block.body);
    return { ok: true, errors: [] };
  } catch (e) {
    return { ok: false, errors: [yamlExceptionToError(e, block.startLine)] };
  }
}

interface FrontmatterBlock {
  // Body zwischen den beiden ---. Leere Zeilen drin sind Pflicht-erhalten,
  // damit Zeilennummern im YAMLException.mark zu source mappbar sind.
  body: string;
  // 1-basierte Zeilennummer in source, die der ERSTEN Zeile von body entspricht.
  // Bei `---\nfoo: 1` ist body 'foo: 1', startLine 2 (Source-Zeile 2).
  startLine: number;
}

// Extrahiert das YAML-Frontmatter, wenn die Datei mit `---\n` (oder `---\r\n`)
// beginnt. Sucht den nächsten alleinstehenden `---`-Trenner. Gibt es keinen
// schließenden Trenner, ist das aus YAML-Sicht nicht validierbar — wir
// returnen null (kein YAML-Fehler, ein Markdown-Strukturfehler, der nicht
// in unseren Scope fällt).
export function extractFrontmatter(source: string): FrontmatterBlock | null {
  if (!source.startsWith('---\n') && !source.startsWith('---\r\n')) return null;
  const lines = source.split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    // `.trim()` toleriert einen Trenner mit Trailing-Whitespace (`--- `), den
    // manche Editoren beim Speichern hinterlassen.
    if (lines[i]?.trim() === '---') {
      // body-Zeilen lines[1..i-1], also startLine = 2 (1-basiert).
      return { body: lines.slice(1, i).join('\n'), startLine: 2 };
    }
  }
  return null;
}

function yamlExceptionToError(e: unknown, startLine: number): YamlValidationError {
  // js-yaml's YAMLException hat: name='YAMLException', reason, message, mark={line,column}.
  // Mark.line und mark.column sind 0-basiert IM YAML-BLOCK; wir mappen sie auf
  // die 1-basierte Zeile der Quell-Datei.
  if (
    e !== null &&
    typeof e === 'object' &&
    'name' in e &&
    (e as { name: unknown }).name === 'YAMLException'
  ) {
    const ex = e as unknown as {
      reason?: string;
      message: string;
      mark?: { line: number; column: number };
    };
    if (ex.mark) {
      return {
        line: ex.mark.line + startLine, // mark.line 0-basiert + startLine (1-basierter Body-Start)
        column: ex.mark.column + 1,
        message: ex.reason ?? ex.message,
      };
    }
    return { line: null, column: null, message: ex.reason ?? ex.message };
  }
  return {
    line: null,
    column: null,
    message: e instanceof Error ? e.message : String(e),
  };
}
