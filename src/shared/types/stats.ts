// Stats (Phase-2 Season-12+): Overview-Cards, Heatmap, Modelle-View.

// Range-Filter der Stats-Cards. Eigene Roadmap-Feature-Zeile "30d/7d-Filter"
// wird mit dieser Season parallel erledigt.
export type StatsRange = 'all' | '30d' | '7d';

export interface StatsOverviewInput {
  // null oder weggelassen = global ueber alle Projekte.
  projectId?: string | null;
  range: StatsRange;
  asOf?: number;
}

// Ergebnis-Shape der acht Cards. Felder mit `_at`-Suffix sind epoch-ms;
// `null`-Werte signalisieren "keine Daten" (Renderer zeigt Em-Dash).
export interface StatsOverviewResult {
  // Erste Reihe — Volumen
  sessions_total: number;
  messages_total: number;
  tokens_total: number;
  active_days: number;
  // Zweite Reihe — Verhalten
  current_streak_days: number;
  longest_streak_days: number;
  // 0–23 (lokale Zeitzone des Main-Prozesses). null = keine Messages.
  peak_hour: number | null;
  peak_hour_count: number;
  // Modell-ID wie in messages.model gespeichert. null = keine Messages
  // mit Modell-Info.
  favorite_model: string | null;
  favorite_model_count: number;
  // Reflektion des Inputs (fuer Debug-Anzeige + Cache-Validierung im Renderer).
  scope: 'project' | 'global';
  range: StatsRange;
  generated_at: number;
}

// Phase-2 Season-13 — Aktivitaets-Heatmap.

export type StatsHeatmapWeeks = 30 | 52;

export interface StatsHeatmapInput {
  projectId?: string | null;
  weeks: StatsHeatmapWeeks;
  asOf?: number;
}

// Eine Zelle im Grid. Level 0 = keine Aktivitaet, 1..4 = Quartil-Stufen ueber
// die nicht-leeren Tage des Fensters. `date` ist YYYY-MM-DD in lokaler Zeit.
export interface StatsHeatmapDay {
  date: string;
  tokens: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface StatsHeatmapResult {
  // ASC-sortiert nach `date`. Enthaelt jeden Kalendertag vom Fenster-Start
  // (Montag N-1 Wochen vor dem Montag der aktuellen Woche) bis heute (lokal)
  // inklusive. Tage ohne Messages haben tokens=0 und level=0. Die Laenge
  // bleibt deterministisch <= weeks * 7.
  days: StatsHeatmapDay[];
  weeks: StatsHeatmapWeeks;
  scope: 'project' | 'global';
  // Quartil-Schwellen ueber die nicht-leeren Tage im Fenster. Renderer
  // zeigt sie optional im Tooltip als Legende. Wenn das Fenster komplett
  // leer ist, sind alle drei Werte 0.
  thresholds: { p25: number; p50: number; p75: number };
  generated_at: number;
}

// Phase-2 Season-14 — Modelle-View. Per-Modell-Aufschluesselung mit Bar-Chart
// (Token-Anteil) und Tabelle (Modell · Sessions · Tokens · Durchschnitt pro
// Session). Range + Scope kommen vom geteilten Stats-Header-Toggle (Season 12).

export interface StatsModelsInput {
  // null oder weggelassen = global ueber alle Projekte.
  projectId?: string | null;
  range: StatsRange;
  asOf?: number;
}

// Eine Zeile pro Modell. `model` ist die Modell-ID, wie in `messages.model`
// gespeichert (claude-opus-4-7, claude-sonnet-4-6, ...). NULL-Modelle (Pre-
// Migration-Backfill-Tail) bleiben raus — der Renderer braucht keine
// "unbekannt"-Reihe. `sessions` zaehlt DISTINCT session_id der Messages mit
// diesem Modell, nicht `sessions.current_model` — damit erscheint ein
// Modell in der Liste, sobald in der Session mindestens eine Message damit
// lief. Das passt zum Detail-Pane-Aggregat aus Season 10.
export interface StatsModelBreakdownRow {
  model: string;
  messages: number;
  sessions: number;
  tokens: number;
  // Anteil an der Gesamt-Token-Summe der zurueckgegebenen Modelle. 0..1.
  // Wird vorberechnet, damit der Renderer keine Summe nochmal aufaddieren
  // muss (und beide Seiten denselben Wert sehen).
  tokens_share: number;
  // tokens / sessions, gerundet auf eine Ganzzahl. `null`, wenn `sessions=0`
  // (sollte bei Aggregat aus Messages nicht vorkommen, defensiv trotzdem).
  tokens_per_session: number | null;
  // Phase-2 Season Flacsh: getrennte Cache-Token-Summen aus der neuen
  // Spalte messages.tokens_cache_read / messages.tokens_cache_creation
  // (Migration 0008). `cache_hit_rate` ist `cache_read / tokens_in` als
  // 0..1-Wert; `null`, wenn das Modell keine tokens_in hat (kein Aggregat
  // moeglich). Pre-Migration-Daten haben die Spalten auf 0 → Hit-Rate
  // landet auf 0, bis der Watcher die Sessions neu eingelesen hat.
  tokens_cache_read: number;
  tokens_cache_creation: number;
  cache_hit_rate: number | null;
}

export interface StatsModelsResult {
  // Absteigend sortiert nach `tokens`, Tie-Break alphabetisch nach `model`.
  rows: StatsModelBreakdownRow[];
  // Summe ueber alle Rows. Renderer kann daraus Empty-State (0) ableiten,
  // ohne ueber `rows` zu iterieren.
  tokens_total: number;
  // Phase-2 Season Flacsh: Gesamt-Cache-Hit-Rate ueber alle Modelle =
  // SUM(tokens_cache_read) / SUM(tokens_in). 0..1, `null` wenn
  // SUM(tokens_in)==0. Renderer zeigt das als prominente Kennzahl oben
  // im Modelle-View-Block.
  cache_hit_rate_total: number | null;
  scope: 'project' | 'global';
  range: StatsRange;
  generated_at: number;
}
