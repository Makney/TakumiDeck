import matter from 'gray-matter';
import type { ClaudeMdParseResult } from '@shared/types';
import type { IpcResult } from '@shared/types';
import { ok, err } from '@shared/result';
import { ClaudeMdFrontmatterSchema } from '@shared/schemas';

// CLAUDE.md-Parser (Architektur Kapitel 5).
//
// Trennt YAML-Frontmatter vom Markdown-Body über gray-matter (kapselt Edge-Cases:
// BOM, CRLF, Markdown-Body mit eigenen `---`-Trennlinien). Validiert die
// `workbench:`-Section per zod-Schema (analog AppSettingsSchema-Pattern aus Sprint 1).
//
// Drei legitime Zustände, **kein** Fehler:
// 1. Datei ohne Frontmatter (gray-matter liefert data={}, content=input).
//    → frontmatter=null, warnings leer.
// 2. Frontmatter vorhanden, aber `workbench:`-Section fehlt.
//    → frontmatter=null, warnings enthält Hinweis.
// 3. Frontmatter mit `workbench:`-Section vollständig und valid.
//    → frontmatter=<parsed>, warnings leer.
//
// Echte Fehler (gray-matter-Parse-Throw, nicht parsbares YAML, fehlende
// trigger_phrases.docs_update/commit bei vorhandener workbench-Section) liefern
// IpcResult.err. Die Trigger-Phrasen sind Pflicht, weil CLAUDE.md Working-Rules
// explizit auf sie referenzieren — fehlen sie, kann der Workflow nicht funktionieren.

export function parseClaudeMd(content: string): IpcResult<ClaudeMdParseResult> {
  let parsed: ReturnType<typeof matter>;
  try {
    parsed = matter(content);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err<ClaudeMdParseResult>(
      `CLAUDE.md-YAML konnte nicht geparst werden: ${message}`,
      'CLAUDE_MD_PARSE',
    );
  }

  const body = parsed.content;
  const data = parsed.data;
  const warnings: string[] = [];

  // Kein Frontmatter — legitimer Fall, z.B. ein Projekt mit minimaler CLAUDE.md.
  // gray-matter signalisiert das über data === {} UND matter === '' (oder isEmpty).
  // Wir erkennen es defensiver: wenn weder `workbench` noch andere Top-Level-Keys
  // vorhanden sind, gibt es schlicht keine Frontmatter.
  if (!data || Object.keys(data).length === 0) {
    return ok({ frontmatter: null, body, warnings });
  }

  // Frontmatter ist da — workbench-Section vorhanden?
  if (typeof data.workbench !== 'object' || data.workbench === null) {
    warnings.push(
      'Frontmatter vorhanden, aber `workbench:`-Section fehlt — Projekt wird ohne TakumiDeck-Konfiguration angezeigt.',
    );
    return ok({ frontmatter: null, body, warnings });
  }

  // Workbench-Section vorhanden — strict-Validierung.
  const validated = ClaudeMdFrontmatterSchema.safeParse(data);
  if (!validated.success) {
    // zod-Errors als kompakte Liste zusammenfassen — sonst kommt im Log eine
    // verschachtelte Struktur an, die der User-facing-Error nicht braucht.
    const issues = validated.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    return err<ClaudeMdParseResult>(
      `CLAUDE.md-Frontmatter ist ungültig: ${issues}`,
      'CLAUDE_MD_INVALID_FRONTMATTER',
    );
  }

  return ok({ frontmatter: validated.data, body, warnings });
}
