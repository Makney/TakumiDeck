import type { ClaudeMdFrontmatter } from '@shared/types';

// triggerPhrasePills — Pure-Logik-Helper (Phase-2 Season-3).
//
// Bildet `workbench.trigger_phrases` aus dem CLAUDE.md-Frontmatter auf die
// Render-Daten der Trigger-Phrasen-Schnellbuttons in der Action-Bar ab.
// Trennt die Daten-Transformation von der JSX-Komponente, damit sie ohne
// React/DOM unit-getestet werden kann (gleiche Konvention wie Sprint-6
// `templateVariables.ts`).

export interface TriggerPhrasePill {
  // Frontmatter-Key, z.B. 'docs_update'. Wird als React-key verwendet —
  // muss innerhalb des Frontmatter-Objekts eindeutig sein (YAML-Garantie).
  key: string;
  // Humanisiertes Label, z.B. 'Doku-Update' oder 'Pr-Ready' — Anzeige auf
  // der Pille. Bekannte Keys haben einen handgepflegten Wert in KNOWN_LABELS;
  // unbekannte Keys werden generisch über snake_case → Title-Case-mit-Bindestrich
  // humanisiert. Die Bindestrich-Variante steht der Frontmatter-Konvention
  // näher als ein Leerzeichen (sieht nicht nach Tippfehler aus).
  label: string;
  // Die wörtliche Trigger-Phrase aus dem Frontmatter (z.B. 'ist korrekt
  // umgesetzt'). Tooltip + Bracketed-Paste-Inhalt.
  phrase: string;
}

// Handgepflegtes Mapping für die in Phase 1 bereits eingeführten Standard-Keys.
// Weitere bekannte Keys aus zukünftigen Phasen können hier ergänzt werden,
// ohne dass die generische Fallback-Logik geändert werden muss.
const KNOWN_LABELS: Record<string, string> = {
  docs_update: 'Doku-Update',
};

// Die `commit`-Trigger-Phrase hat in Phase 1 bereits eine eigene Pille mit
// Pre-Commit-Modal (Sensitive-File-Warning + Branch-Anzeige + Anzeige der
// geänderten Dateien). Eine zweite Direkt-Send-Pille daneben würde den
// User verwirren und den Phase-1-Mehrwert des Modals entwerten. Daher
// `commit` aus der dynamischen Pillen-Liste filtern.
const HIDDEN_KEYS = new Set(['commit']);

// Sortier-Priorität: `docs_update` zuerst (häufigster Daily-Use-Trigger),
// danach alphabetisch. Wir können kein Control-Char-Prefix nutzen, weil
// `localeCompare` Intl-konform NUL-Bytes ignoriert — also direkter Vergleich.
function comparePillKeys(a: string, b: string): number {
  if (a === b) return 0;
  if (a === 'docs_update') return -1;
  if (b === 'docs_update') return 1;
  return a.localeCompare(b);
}

export function humanizeTriggerKey(key: string): string {
  const known = KNOWN_LABELS[key];
  if (known !== undefined) return known;
  if (key.length === 0) return '';
  return key
    .split('_')
    .map((part) => (part.length === 0 ? '' : part[0]!.toUpperCase() + part.slice(1)))
    .join('-');
}

export function buildTriggerPillList(
  triggerPhrases: ClaudeMdFrontmatter['workbench']['trigger_phrases'] | null | undefined,
): TriggerPhrasePill[] {
  if (!triggerPhrases) return [];
  return Object.entries(triggerPhrases)
    .filter(([key]) => !HIDDEN_KEYS.has(key))
    .filter(([, phrase]) => typeof phrase === 'string' && phrase.length > 0)
    .sort(([a], [b]) => comparePillKeys(a, b))
    .map(([key, phrase]) => ({
      key,
      label: humanizeTriggerKey(key),
      phrase,
    }));
}
