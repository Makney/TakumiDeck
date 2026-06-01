// Sprint 6 / Phase-2 Season-23 — Schema-aware Variable-Filling.
//
// Pure Logik: nimmt einen Template-Body + Schema (aus dem Frontmatter) + einen
// Resolver-Context und liefert den ersetzten Text plus Diagnose. Wird sowohl
// für die Live-Preview im Modal als auch beim finalen Send-Schritt genutzt.
//
// Token-Schicksal pro Vorkommen:
//   - Token im Schema mit `auto: <pfad>`     → Pfad gegen ctx aufloesen.
//                                               Pfad ohne Wert → Token bleibt
//                                               literal stehen (sichtbares
//                                               Signal, dass die Quelle fehlt).
//   - Token im Schema mit `input: ...`       → User-Wert aus ctx.userInputs.
//                                               Pflichtfeld leer → bleibt
//                                               literal stehen UND landet in
//                                               missingRequired (UI-Block).
//   - Token NICHT im Schema                  → bleibt literal stehen (z.B.
//                                               Kickoff-Tokens wie
//                                               {{KURZBESCHREIBUNG}}, die
//                                               Agent-Anweisungen sind, nicht
//                                               Renderer-Inputs).
//
// Bestands-Templates ohne Frontmatter (schema=null) bekommen ein implizites
// Legacy-Schema, das die hartcodierten Listen aus Sprint 6 / Phase-2 Season-4
// abbildet. So funktioniert das System ohne Frontmatter weiter, bis alle
// Templates migriert sind.

import type {
  ClaudeMdFrontmatter,
  ProjectRow,
  TemplateSchema,
  TemplateVariableSpec,
} from '@shared/types';
import { displayProjectName } from './displayProjectName';

// Regex laut Architektur 6.5: nur Großbuchstaben + Underscore zwischen {{...}}.
// Strenges Muster verhindert Kollisionen mit normalem Markdown wie {{x}} oder {{1}}.
//
// Factory statt geteilter Modul-Konstante: das `g`-Flag traegt mutablen
// `lastIndex`-State. Jeder Konsument (findVariablesInTemplate via `.exec`-
// Schleife, fillTemplateVariables via `String.replace`) bekommt so eine eigene
// Instanz — kein geteilter lastIndex, der bei kuenftiger `.exec`/`.test`-Nutzung
// ohne Reset sporadische Treffer-Aussetzer verursachen koennte.
const makeTokenRe = (): RegExp => /\{\{([A-Z_]+)\}\}/g;

// Legacy-Fallback fuer Templates ohne Frontmatter. Spiegelt die Hardcoded-
// Konstanten aus der alten Engine 1:1 wider, damit Bestand ohne Migration
// weiter funktioniert. Sobald alle Templates Frontmatter haben, ist dieser
// Block totes Material — bewusst belassen, weil ein User jederzeit einen
// neuen .md ohne Frontmatter in docs/templates/ ablegen kann.
export const LEGACY_TEMPLATE_SCHEMA: TemplateSchema = {
  variables: {
    PROJEKT_NAME: { auto: 'project.name' },
    NEXT_SEASON_NR: { auto: 'project.next_season_number' },
    CURRENT_PHASE_FILE: { auto: 'claude_md.workbench.current_phase_file' },
    DATUM: { auto: 'today' },
    LETZTE_SEASON_NAME: { auto: 'db.last_completed_feature_session' },
    TECH_SCHULDEN_RELEVANT: { auto: 'docs.tech_schulden_top_n' },
    LETZTE_ENTSCHEIDUNGEN: { auto: 'docs.entscheidungen_top_n' },
    FEATURE_NAME: { input: 'text', label: 'Feature', required: true },
    AUFGABE: { input: 'textarea', label: 'Aufgabe', required: true },
    HINWEISE: { input: 'textarea', label: 'Hinweise (optional)' },
  },
};

// Resolver-Context: alle Quellen, die ein Auto-Pfad konsumieren kann. Der
// Renderer baut den Context einmal pro Modal-Render aus Project + Frontmatter
// + dem Server-Bundle und dem aktuellen Datum, dann ist der Filler reine
// Pure-Logik (testbar ohne IPC-Mock).
export interface ResolverContext {
  project: Pick<ProjectRow, 'name' | 'next_season_number' | 'id' | 'path' | 'added_manually' | 'has_git' | 'created_at' | 'session_count'>;
  // Projekt-Display-Name (= frontmatter.workbench.project_name ?? displayProjectName(project)).
  // Vorab aufgeloest, damit der Resolver keinen displayProjectName-Helper kennen muss.
  projectDisplayName: string;
  frontmatter: ClaudeMdFrontmatter | null;
  // Heutiges Datum YYYY-MM-DD. Test-Calls reichen ein fixes Datum rein.
  date: Date;
  // Server-Auto-Vars: Map Pfad → Wert. Pfade nicht im Bundle (z.B. weil
  // IPC-Call noch laeuft oder Datei fehlt) → Token bleibt literal stehen.
  serverAutoVars: Record<string, string>;
  // User-Inputs aus dem Modal-Form, gekeyt nach Token-Name.
  userInputs: Record<string, string>;
}

export interface FillResult {
  // Vollständig ersetzter Text. Pflichtfelder ohne Wert UND Tokens mit nicht
  // aufloesbarem Auto-Pfad UND Tokens ohne Schema-Eintrag bleiben jeweils als
  // `{{NAME}}` stehen — User sieht im Preview, was fehlt bzw. literal bleibt.
  filled: string;
  // Pflichtfelder (Schema-Spec mit `input` + required), die im Template
  // auftauchen, aber im userInputs-Map leer sind. UI markiert die Inputs
  // entsprechend und sperrt den Send-Button.
  missingRequired: string[];
}

// Findet alle Variablen-Tokens im Body (deduped, in Reihenfolge des ersten
// Vorkommens). Wird vom Modal genutzt, um die relevanten Form-Felder zu
// rendern und die anzufragenden Server-Pfade zu bestimmen.
export function findVariablesInTemplate(content: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  const tokenRe = makeTokenRe();
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(content)) !== null) {
    const name = match[1];
    if (name === undefined) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    found.push(name);
  }
  return found;
}

// Hauptfunktion: ersetzt Tokens anhand des Schemas + Contexts.
export function fillTemplateVariables(
  content: string,
  schema: TemplateSchema,
  ctx: ResolverContext,
): FillResult {
  const missingRequired: string[] = [];
  const seenMissing = new Set<string>();

  const filled = content.replace(makeTokenRe(), (match, name: string) => {
    const spec = schema.variables[name];
    if (!spec) {
      // Token ohne Schema-Eintrag → literal. Bewusst KEINE Warnung mehr —
      // Kickoff-Templates leben davon, dass {{KURZBESCHREIBUNG}} & Co. als
      // Agent-Anweisungen unveraendert durch den Paste laufen.
      return match;
    }
    if ('auto' in spec) {
      const value = resolveAutoPath(spec.auto, ctx);
      if (value === undefined) return match;
      return value;
    }
    // Input-Variable: User-Wert holen. Leerer/whitespace-only Wert bei
    // Pflichtfeld → literal stehen lassen UND in missingRequired auffuehren.
    const value = ctx.userInputs[name] ?? '';
    const isRequired = spec.required === true;
    if (isRequired && value.trim() === '') {
      if (!seenMissing.has(name)) {
        seenMissing.add(name);
        missingRequired.push(name);
      }
      return match;
    }
    return value;
  });

  return { filled, missingRequired };
}

// Pfad-Resolver: liefert den Wert oder `undefined`, wenn der Pfad nicht
// aufloesbar ist (Token bleibt dann literal). Gibt einen leeren String NUR
// dann zurueck, wenn die Quelle wirklich leer ist (z.B. ein definiertes,
// aber leeres Frontmatter-Feld) — der Renderer kann damit unterscheiden
// zwischen „fehlt" und „bewusst leer".
export function resolveAutoPath(
  pathExpr: string,
  ctx: ResolverContext,
): string | undefined {
  // Sonderfaelle ohne Pfad-Walk
  if (pathExpr === 'today') return formatIsoDate(ctx.date);
  if (pathExpr === 'project.name') return ctx.projectDisplayName;
  if (pathExpr === 'project.next_season_number') {
    return ctx.project.next_season_number !== null &&
      ctx.project.next_season_number !== undefined
      ? String(ctx.project.next_season_number)
      : undefined;
  }

  // Server-Pfade kommen als Map aus dem IPC-Result. Fehlende Eintraege
  // (Datei nicht da, Setting=0, IPC noch nicht zurueck) → undefined.
  if (pathExpr.startsWith('db.') || pathExpr.startsWith('docs.')) {
    const value = ctx.serverAutoVars[pathExpr];
    return value && value.length > 0 ? value : undefined;
  }

  // claude_md-Pfade: defensiver Walk auf das geparste Frontmatter. zod hat
  // schon validiert, dass nur erwartete Felder durchkommen; trotzdem traverse
  // ich generisch, damit neue Frontmatter-Felder ohne Resolver-Edit gehen.
  if (pathExpr.startsWith('claude_md.')) {
    if (!ctx.frontmatter) return undefined;
    const segments = pathExpr.slice('claude_md.'.length).split('.');
    let cursor: unknown = ctx.frontmatter;
    for (const seg of segments) {
      if (cursor === null || cursor === undefined) return undefined;
      if (typeof cursor !== 'object') return undefined;
      cursor = (cursor as Record<string, unknown>)[seg];
    }
    if (typeof cursor !== 'string') return undefined;
    return cursor.length > 0 ? cursor : undefined;
  }

  return undefined;
}

// Schema-Helfer fuer die UI: liefert die Spec eines Tokens. Wird vom Modal
// genutzt, um Input-Felder zu rendern (Label, multiline, required).
export function getVariableSpec(
  schema: TemplateSchema,
  name: string,
): TemplateVariableSpec | undefined {
  return schema.variables[name];
}

// Sammelt alle Server-Pfade (`db.*`, `docs.*`), die im Schema vorkommen UND
// im Template-Body verwendet werden. Renderer schickt nur diese an
// templates:resolve-auto-vars, damit ungenutzte Server-Reads ausbleiben.
export function collectServerAutoPaths(
  schema: TemplateSchema,
  usedVariables: string[],
): string[] {
  const paths = new Set<string>();
  for (const name of usedVariables) {
    const spec = schema.variables[name];
    if (!spec || !('auto' in spec)) continue;
    if (spec.auto.startsWith('db.') || spec.auto.startsWith('docs.')) {
      paths.add(spec.auto);
    }
  }
  return [...paths];
}

// Convenience-Builder fuer den Resolver-Context. Nimmt die typischen
// Modal-Inputs und produziert den `ResolverContext` fuer den Filler.
export function buildResolverContext(input: {
  project: ProjectRow;
  frontmatter: ClaudeMdFrontmatter | null;
  date: Date;
  serverAutoVars: Record<string, string>;
  userInputs: Record<string, string>;
}): ResolverContext {
  return {
    project: input.project,
    projectDisplayName:
      input.frontmatter?.workbench.project_name ?? displayProjectName(input.project),
    frontmatter: input.frontmatter,
    date: input.date,
    serverAutoVars: input.serverAutoVars,
    userInputs: input.userInputs,
  };
}

function formatIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
