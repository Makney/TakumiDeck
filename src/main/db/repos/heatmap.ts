import type Database from 'better-sqlite3';
import type {
  StatsHeatmapDay,
  StatsHeatmapResult,
  StatsHeatmapWeeks,
} from '@shared/types';

// HeatmapRepository (Phase-2 Season-13).
//
// Liefert die Daten fuer die GitHub-Style Aktivitaets-Heatmap. Eigener
// Endpoint parallel zur StatsRepository, damit der Statement-Cache pro
// Scope unabhaengig bleibt und die Heatmap-Logik (Quartil-Thresholds +
// Grid-Window-Berechnung) nicht im StatsRepository-Modul gemischt wird.
//
// Datenquelle ist die `messages`-Tabelle (Sprint 5). Aggregiert wird auf
// Local-Day-Granularitaet via SQLite-strftime mit 'localtime'-Modifier —
// gleicher Pfad wie StatsRepository.distinctActiveDays, damit Cards und
// Heatmap konsistent ueber die gleiche Tages-Definition arbeiten.

export interface HeatmapQuery {
  // null = global ueber alle Projekte.
  projectId: string | null;
  // Untergrenze inklusive: epoch-ms am Beginn des Fenster-Mondays 00:00 lokal.
  windowStartTs: number;
}

export interface HeatmapDbDriver {
  // Map<YYYY-MM-DD, tokens_in+tokens_out-Summe>. Tage ohne Messages fehlen
  // im Map — der Repository-Layer fuellt sie mit 0 auf.
  dailyTokens(q: HeatmapQuery): Map<string, number>;
}

export class HeatmapRepository {
  constructor(private readonly driver: HeatmapDbDriver) {}

  getHeatmap(input: {
    projectId: string | null;
    weeks: StatsHeatmapWeeks;
    now?: Date;
  }): StatsHeatmapResult {
    const now = input.now ?? new Date();
    const window = computeHeatmapWindow(now, input.weeks);
    const tokensByDay = this.driver.dailyTokens({
      projectId: input.projectId,
      windowStartTs: window.startTs,
    });

    // Alle Tage von Window-Start bis heute (inklusive) aufzaehlen. Spaeter im
    // Fenster (= zwischen heute und Sonntag dieser Woche) bleiben raus, damit
    // wir keine „Zukunfts"-Zellen rendern.
    const dates = enumerateLocalDays(window.startDate, window.endDate);

    // Quartile auf den nicht-leeren Tagen berechnen. Wir geben sie zusaetzlich
    // im Result mit zurueck, damit der Renderer eine Legende rendern kann.
    const nonZeroSorted: number[] = [];
    for (const date of dates) {
      const tok = tokensByDay.get(date) ?? 0;
      if (tok > 0) nonZeroSorted.push(tok);
    }
    nonZeroSorted.sort((a, b) => a - b);
    const thresholds = computeQuantileThresholds(nonZeroSorted);

    const days: StatsHeatmapDay[] = dates.map((date) => {
      const tokens = tokensByDay.get(date) ?? 0;
      return { date, tokens, level: levelFor(tokens, thresholds) };
    });

    return {
      days,
      weeks: input.weeks,
      scope: input.projectId === null ? 'global' : 'project',
      thresholds,
      generated_at: now.getTime(),
    };
  }
}

// --- Pure Helpers ----------------------------------------------------

export interface HeatmapWindow {
  // Inklusive Start (Montag N-1 Wochen vor dem Montag der laufenden Woche),
  // 00:00 lokal.
  startDate: string;
  startTs: number;
  // Inklusive Ende (heute lokal).
  endDate: string;
}

// Bestimmt das Anzeige-Fenster fuer die Heatmap. Anker ist die laufende
// Wochen-Spalte (= bis heute), die Anzahl der Wochen-Spalten links davon
// kommt aus dem User-Toggle (30W/52W). Wochenstart ist Montag (DE/EU-
// Konvention).
export function computeHeatmapWindow(now: Date, weeks: StatsHeatmapWeeks): HeatmapWindow {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // 0 = Mo, 1 = Di, ..., 6 = So. `getDay()` liefert 0=So, 1=Mo, ..., daher
  // die +6-Modulo-Verschiebung.
  const dayOfWeekMon0 = (today.getDay() + 6) % 7;
  const thisMonday = new Date(today);
  thisMonday.setDate(today.getDate() - dayOfWeekMon0);
  const windowStart = new Date(thisMonday);
  windowStart.setDate(thisMonday.getDate() - (weeks - 1) * 7);
  return {
    startDate: localDayStr(windowStart),
    startTs: windowStart.getTime(),
    endDate: localDayStr(today),
  };
}

// Iteriert von startDate bis endDate (inklusive, beides YYYY-MM-DD lokal),
// gibt die Folge der Tages-Strings zurueck. DST-Wechsel werden korrekt
// behandelt, weil wir per Date-Objekt zaehlen und die String-Repraesentation
// pro Iteration neu bauen.
export function enumerateLocalDays(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const start = parseLocalDayStr(startDate);
  const end = parseLocalDayStr(endDate);
  if (start === null || end === null || start > end) return out;
  const cursor = new Date(start);
  while (cursor.getTime() <= end.getTime()) {
    out.push(localDayStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export interface HeatmapThresholds {
  p25: number;
  p50: number;
  p75: number;
}

// Quartil-Schwellen ueber eine ASC-sortierte Liste der nicht-leeren Token-
// Tagessummen. Bei leerer Liste sind alle drei Werte 0.
export function computeQuantileThresholds(nonZeroSortedAsc: number[]): HeatmapThresholds {
  return {
    p25: percentile(nonZeroSortedAsc, 0.25),
    p50: percentile(nonZeroSortedAsc, 0.5),
    p75: percentile(nonZeroSortedAsc, 0.75),
  };
}

function percentile(sortedAsc: number[], p: number): number {
  const n = sortedAsc.length;
  if (n === 0) return 0;
  if (n === 1) return sortedAsc[0]!;
  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo]!;
  const t = idx - lo;
  return sortedAsc[lo]! * (1 - t) + sortedAsc[hi]! * t;
}

// Mapped tokens auf 0..4. Edge-Case: wenn alle aktiven Tage identische Token-
// Summen haben (p25 === p75), gibt es keine sinnvolle Abstufung zwischen den
// Stufen 1..3 — wir setzen alle aktiven Tage auf 4 (= „voller Signal-Wert"),
// statt sie alle auf 1 zu druecken. Praktischer Fall: nur ein einziger aktiver
// Tag im Fenster.
export function levelFor(tokens: number, t: HeatmapThresholds): 0 | 1 | 2 | 3 | 4 {
  if (tokens <= 0) return 0;
  if (t.p25 === t.p75) return 4;
  if (tokens <= t.p25) return 1;
  if (tokens <= t.p50) return 2;
  if (tokens <= t.p75) return 3;
  return 4;
}

function localDayStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseLocalDayStr(s: string): Date | null {
  if (s.length !== 10) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
}

// --- SQLite-Driver --------------------------------------------------

export class SqliteHeatmapDriver implements HeatmapDbDriver {
  // Zwei vorbereitete Statements: eines pro Scope (project/global). Damit
  // sparen wir uns den .prepare-Overhead bei jedem Refresh.
  private readonly cache = new Map<'p' | 'g', Database.Statement>();

  constructor(private readonly db: Database.Database) {}

  dailyTokens(q: HeatmapQuery): Map<string, number> {
    const key: 'p' | 'g' = q.projectId === null ? 'g' : 'p';
    let stmt = this.cache.get(key);
    if (!stmt) {
      const where =
        q.projectId === null ? 'WHERE ts >= ?' : 'WHERE project_id = ? AND ts >= ?';
      // tokens = input + output; `tokens_in` enthaelt seit 0008 die
      // Cache-Read/-Creation-Tokens (verarbeitete, nicht billable Sicht).
      stmt = this.db.prepare(
        `SELECT strftime('%Y-%m-%d', ts/1000, 'unixepoch', 'localtime') AS day,
                COALESCE(SUM(tokens_in + tokens_out), 0) AS tokens
         FROM messages
         ${where}
         GROUP BY day`,
      );
      this.cache.set(key, stmt);
    }
    const params: Array<string | number> = [];
    if (q.projectId !== null) params.push(q.projectId);
    params.push(q.windowStartTs);
    const rows = stmt.all(...params) as Array<{ day: string; tokens: number }>;
    const out = new Map<string, number>();
    for (const row of rows) out.set(row.day, row.tokens);
    return out;
  }
}

// --- In-Memory-Driver fuer Tests --------------------------------------

export interface InMemoryHeatmapMessageLike {
  project_id: string | null;
  ts: number;
  tokens_in: number;
  tokens_out: number;
}

export class InMemoryHeatmapDriver implements HeatmapDbDriver {
  constructor(private readonly messages: InMemoryHeatmapMessageLike[]) {}

  dailyTokens(q: HeatmapQuery): Map<string, number> {
    const out = new Map<string, number>();
    for (const m of this.messages) {
      if (q.projectId !== null && m.project_id !== q.projectId) continue;
      if (m.ts < q.windowStartTs) continue;
      const day = localDayStr(new Date(m.ts));
      const prev = out.get(day) ?? 0;
      out.set(day, prev + m.tokens_in + m.tokens_out);
    }
    return out;
  }
}
