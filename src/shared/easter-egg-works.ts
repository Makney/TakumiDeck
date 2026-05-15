// Phase-2 Season-19: Easter-Egg-Token-Vergleiche.
//
// Pure Logik fuer die spielerischen „du hast ~31× LotR geschrieben"-
// Vergleiche in der Stats-Pane-Uebersicht. Token-Counts der Default-
// Werke basieren auf einer Wort-zu-Token-Heuristik (~1.33 tokens pro
// Wort fuer englische Prosa mit Anthropics cl100k-Tokenizer; deutsche
// Uebersetzungen liegen in der gleichen Groessenordnung). Die Werte
// sind bewusst gerundet — der Easter-Egg ist ein Storytelling-Anker,
// keine Messung; ±5 % sind im Daily-Use unsichtbar.

export interface EasterEggWork {
  // Anzeige-Name im UI ("LotR", "Bibel", "Harry-Potter-Reihe").
  name: string;
  // Geschaetzte Token-Anzahl des Werks (~1.33 × englische Wortzahl).
  tokens: number;
}

export interface EasterEggComparison {
  work: EasterEggWork;
  // tokensTotal / work.tokens — wie oft „passt" das Werk in den
  // bisherigen Token-Verbrauch.
  factor: number;
}

// Default-Liste, sortiert nach tokens ASC fuer Code-Lesbarkeit.
// Die Anzeige-Reihenfolge im UI bestimmt der Filter+Sort in
// computeEasterEggComparisons (factor desc).
//
// Quellen (englische Wortzahlen, gerundet × 1.33 fuer Token-Schaetzung):
//   - Der Hobbit (1937):     ~95k Woerter   → ~126k tokens
//   - LotR (Trilogie):       ~480k Woerter  → ~640k tokens
//   - Krieg und Frieden:     ~560k Woerter  → ~745k tokens
//   - Die Bibel (KJV):       ~785k Woerter  → ~1.04M tokens
//   - Harry-Potter-Reihe:    ~1.08M Woerter → ~1.44M tokens
export const DEFAULT_EASTER_EGG_WORKS: readonly EasterEggWork[] = [
  { name: 'Der Hobbit', tokens: 126_000 },
  { name: 'The Lord of the Rings', tokens: 640_000 },
  { name: 'Krieg und Frieden', tokens: 745_000 },
  { name: 'Die Bibel', tokens: 1_040_000 },
  { name: 'Harry-Potter-Reihe', tokens: 1_440_000 },
];

// Werke unterhalb dieser Schwelle gelten als „zu klein zum Erzaehlen"
// und werden ausgeblendet — „0.01× Hobbit" ist eher erniedrigend als
// spielerisch. 0.1 = ein Zehntel des Werks.
const MIN_FACTOR = 0.1;

// Default-Anzahl der angezeigten Vergleiche im Streifen.
const DEFAULT_LIMIT = 3;

// Liefert die anzuzeigenden Vergleiche, sortiert nach Faktor desc.
// - `tokensTotal <= 0` oder NaN → leere Liste (Streifen rendert nicht).
// - Werke mit factor < MIN_FACTOR werden gefiltert.
// - Bei hohem Verbrauch dominieren die groessten Faktoren (Hobbit zuerst,
//   wenn der User schon weit drueber ist) — die Liste waechst natuerlich
//   von „0.5× Hobbit" am Anfang zu „50× Hobbit, 10× LotR, 8× …" spaeter.
export function computeEasterEggComparisons(
  tokensTotal: number,
  works: readonly EasterEggWork[] = DEFAULT_EASTER_EGG_WORKS,
  limit: number = DEFAULT_LIMIT,
): EasterEggComparison[] {
  if (!Number.isFinite(tokensTotal) || tokensTotal <= 0) return [];
  return works
    .filter((w) => w.tokens > 0)
    .map((work) => ({ work, factor: tokensTotal / work.tokens }))
    .filter((c) => c.factor >= MIN_FACTOR)
    .sort((a, b) => b.factor - a.factor)
    .slice(0, Math.max(0, limit));
}

// Format-Helper fuer den Faktor: „0.5×" / „1.2×" / „31×".
// - factor < 10: eine Nachkommastelle (Number-Stringify kuerzt trailing .0).
// - factor >= 10: gerundete Ganzzahl, weil „31.4× LotR" suggeriert eine
//   Messgenauigkeit, die der Easter-Egg nicht hat.
export function formatEasterEggFactor(factor: number): string {
  if (!Number.isFinite(factor) || factor <= 0) return '0×';
  if (factor >= 10) return `${Math.round(factor)}×`;
  return `${Math.round(factor * 10) / 10}×`;
}
