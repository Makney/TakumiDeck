// Sprint 6 — Variable-Filling-Util (Architektur 6.5).
//
// Pure Logik: nimmt Template-Inhalt und Variablen-Map, returnt ersetzten Text +
// Diagnose (welche Pflichtfelder fehlen, welche Token unbekannt sind). Wird sowohl
// für die Live-Preview im Modal genutzt als auch beim finalen Send-Schritt.
//
// MVP-Variablen-Set:
//   AUTO     — PROJEKT_NAME, NEXT_SEASON_NR, CURRENT_PHASE_FILE, DATUM
//   PFLICHT  — FEATURE_NAME, AUFGABE
//   OPTIONAL — HINWEISE
// Unbekannte Tokens (z.B. Tippfehler) werden unverändert belassen, damit der User
// sie im Preview sieht und korrigieren kann (Architektur 6.5: kein In-App-Editor;
// Korrektur über den Markdown-Editor in Sprint 7).

// Regex laut Architektur 6.5: nur Großbuchstaben + Underscore zwischen {{...}}.
// Strenges Muster verhindert Kollisionen mit normalem Markdown wie {{x}} oder {{1}}.
const TOKEN_RE = /\{\{([A-Z_]+)\}\}/g;

export const AUTO_VARIABLES = ['PROJEKT_NAME', 'NEXT_SEASON_NR', 'CURRENT_PHASE_FILE', 'DATUM'] as const;
export const REQUIRED_USER_VARIABLES = ['FEATURE_NAME', 'AUFGABE'] as const;
export const OPTIONAL_USER_VARIABLES = ['HINWEISE'] as const;

export type AutoVariable = (typeof AUTO_VARIABLES)[number];
export type RequiredUserVariable = (typeof REQUIRED_USER_VARIABLES)[number];
export type OptionalUserVariable = (typeof OPTIONAL_USER_VARIABLES)[number];
export type KnownVariable = AutoVariable | RequiredUserVariable | OptionalUserVariable;

const KNOWN_SET = new Set<string>([
  ...AUTO_VARIABLES,
  ...REQUIRED_USER_VARIABLES,
  ...OPTIONAL_USER_VARIABLES,
]);
const REQUIRED_SET = new Set<string>(REQUIRED_USER_VARIABLES);

export type TemplateVariables = Partial<Record<KnownVariable, string>>;

export interface FillResult {
  // Vollständig ersetzter Text. Pflichtfelder ohne Wert UND unbekannte Tokens
  // bleiben als `{{NAME}}` stehen — User sieht im Preview, was fehlt.
  filled: string;
  // Pflichtfelder, die im Template auftauchen, aber im `vars`-Objekt leer/undefiniert
  // sind. UI markiert diese Inputs als „fehlt" und blockt den Send-Button.
  missingRequired: string[];
  // Tokens im Template, die KEINER bekannten Variable entsprechen. Vermutlich
  // Tippfehler — UI kann eine Warning anzeigen.
  unknownTokens: string[];
}

// Findet alle Variablen-Tokens im Template (deduped, in Reihenfolge des ersten Vorkommens).
// Wird vom Modal genutzt, um die relevanten Form-Felder zu rendern (statt immer alle
// User-Variablen zu zeigen — wenn ein Template kein {{HINWEISE}} hat, blende das Feld aus).
export function findVariablesInTemplate(content: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(content)) !== null) {
    const name = match[1];
    if (name === undefined) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    found.push(name);
  }
  return found;
}

// Pure-Logik-Substitution. Nutzt Replace-Callback, damit pro Token entschieden wird.
export function fillTemplateVariables(
  content: string,
  vars: TemplateVariables,
): FillResult {
  const missingRequired: string[] = [];
  const unknownTokens: string[] = [];
  const seenMissing = new Set<string>();
  const seenUnknown = new Set<string>();

  const filled = content.replace(TOKEN_RE, (match, name: string) => {
    if (!KNOWN_SET.has(name)) {
      if (!seenUnknown.has(name)) {
        seenUnknown.add(name);
        unknownTokens.push(name);
      }
      return match;
    }
    const value = vars[name as KnownVariable];
    if (REQUIRED_SET.has(name) && (value === undefined || value.trim() === '')) {
      if (!seenMissing.has(name)) {
        seenMissing.add(name);
        missingRequired.push(name);
      }
      return match;
    }
    // Optional + Auto: leer → leerer String einsetzen (kein Platzhalter).
    return value ?? '';
  });

  return { filled, missingRequired, unknownTokens };
}

// Helper für die Auto-Variablen, gebündelt aus Project + Frontmatter + Datum.
// Reine Daten-Funktion, damit das Modal sie testbar wiederverwenden kann.
export function buildAutoVariables(input: {
  projectName: string;
  nextSeasonNumber: number | null;
  currentPhaseFile: string | null;
  date: Date;
}): Record<AutoVariable, string> {
  return {
    PROJEKT_NAME: input.projectName,
    NEXT_SEASON_NR: input.nextSeasonNumber !== null ? String(input.nextSeasonNumber) : '',
    CURRENT_PHASE_FILE: input.currentPhaseFile ?? '',
    DATUM: formatIsoDate(input.date),
  };
}

function formatIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
