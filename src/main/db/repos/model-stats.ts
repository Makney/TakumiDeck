import type Database from 'better-sqlite3';
import type {
  StatsModelBreakdownRow,
  StatsModelsResult,
  StatsRange,
} from '@shared/types';
import { computeRangeStartTs } from './stats';

// ModelStatsRepository (Phase-2 Season-14).
//
// Liefert die Per-Modell-Aufschluesselung fuer die Modelle-View in der Stats-
// Pane. Eigener Endpoint parallel zu StatsRepository/HeatmapRepository, damit
// der Statement-Cache pro Scope/Range-Kombination unabhaengig bleibt und der
// Renderer nur dann pullt, wenn der Tab tatsaechlich aktiv ist (Cards-Refresh-
// Tick muss kein Models-Aggregat mitschleppen).
//
// Aggregat-Quelle ist `messages`. GROUP BY model liefert pro Modell:
//   - messages: COUNT(*)
//   - sessions: COUNT(DISTINCT session_id) — ein Modell zaehlt in der Session,
//     sobald mindestens eine Message damit lief (passt zum Detail-Pane-
//     Aggregat aus Season 10, nicht zu sessions.current_model).
//   - tokens:   SUM(tokens_in + tokens_out)
// NULL-Modelle (Pre-Season-10-Backfill-Tail) bleiben raus, sonst haetten wir
// eine „unbekannt"-Reihe ohne Mehrwert.

export interface ModelStatsQuery {
  // null = global ueber alle Projekte.
  projectId: string | null;
  // Untergrenze inklusive. null = keine Untergrenze (range='all').
  rangeStartTs: number | null;
}

// Raw-Aggregat pro Modell — die Anteils-/Pro-Session-Berechnung passiert
// im Repository, nicht im Driver. So bleibt die Driver-Schicht aufs reine
// SELECT beschraenkt und Tests muessen die Aggregat-Logik nur einmal pruefen.
//
// Phase-2 Season Flacsh: `tokens_in_sum`, `tokens_cache_read` und
// `tokens_cache_creation` kommen direkt aus den entsprechenden Spalten der
// messages-Tabelle (Migration 0008). `tokens_in_sum` ist die Summe von
// `messages.tokens_in` ueber die Gruppe — wir brauchen das getrennt vom
// `tokens`-Total (input+output), damit der Repository-Layer die
// Cache-Hit-Rate als `cache_read / tokens_in` ableiten kann.
export interface ModelStatsRawRow {
  model: string;
  messages: number;
  sessions: number;
  tokens: number;
  tokens_in_sum: number;
  tokens_cache_read: number;
  tokens_cache_creation: number;
}

export interface ModelStatsDbDriver {
  // Absteigend sortiert nach tokens, Tie-Break: alphabetisch nach model.
  modelBreakdown(q: ModelStatsQuery): ModelStatsRawRow[];
}

export class ModelStatsRepository {
  constructor(private readonly driver: ModelStatsDbDriver) {}

  getModelsBreakdown(input: {
    projectId: string | null;
    range: StatsRange;
    now?: Date;
  }): StatsModelsResult {
    const now = input.now ?? new Date();
    const rangeStartTs = computeRangeStartTs(input.range, now);
    const raw = this.driver.modelBreakdown({
      projectId: input.projectId,
      rangeStartTs,
    });

    let tokensTotal = 0;
    let cacheReadTotal = 0;
    for (const r of raw) {
      tokensTotal += r.tokens;
      cacheReadTotal += r.tokens_cache_read;
    }

    const rows: StatsModelBreakdownRow[] = raw.map((r) => ({
      model: r.model,
      messages: r.messages,
      sessions: r.sessions,
      tokens: r.tokens,
      tokens_share: tokensTotal > 0 ? r.tokens / tokensTotal : 0,
      tokens_per_session: r.sessions > 0 ? Math.round(r.tokens / r.sessions) : null,
      tokens_cache_read: r.tokens_cache_read,
      tokens_cache_creation: r.tokens_cache_creation,
      cache_hit_rate: cacheHitRate(r),
    }));

    const tokensInTotal = raw.reduce((acc, r) => acc + r.tokens_in_sum, 0);

    return {
      rows,
      tokens_total: tokensTotal,
      cache_hit_rate_total: tokensInTotal > 0 ? cacheReadTotal / tokensInTotal : null,
      scope: input.projectId === null ? 'global' : 'project',
      range: input.range,
      generated_at: now.getTime(),
    };
  }
}

// Phase-2 Season Flacsh: Hit-Rate = cache_read / tokens_in. `tokens_in_sum`
// ist die Summe der Watcher-Spalte `messages.tokens_in` (= input +
// cache_creation + cache_read) ueber die Modell-Gruppe; bei Pre-Migration-
// Daten ist die Spalte 0, weil Migration 0008 alle Rows beim Re-Scan neu
// aufbaut.
function cacheHitRate(r: ModelStatsRawRow): number | null {
  if (r.tokens_in_sum <= 0) return null;
  return r.tokens_cache_read / r.tokens_in_sum;
}

// --- SQLite-Driver --------------------------------------------------

type StatementKey = `${'p' | 'g'}_${'r' | 'a'}`;

function keyFor(q: ModelStatsQuery): StatementKey {
  const p = q.projectId === null ? 'g' : 'p';
  const r = q.rangeStartTs === null ? 'a' : 'r';
  return `${p}_${r}` as StatementKey;
}

function whereClause(q: ModelStatsQuery): string {
  const parts: string[] = ['model IS NOT NULL'];
  if (q.projectId !== null) parts.push('project_id = ?');
  if (q.rangeStartTs !== null) parts.push('ts >= ?');
  return `WHERE ${parts.join(' AND ')}`;
}

function paramsFor(q: ModelStatsQuery): Array<string | number> {
  const out: Array<string | number> = [];
  if (q.projectId !== null) out.push(q.projectId);
  if (q.rangeStartTs !== null) out.push(q.rangeStartTs);
  return out;
}

export class SqliteModelStatsDriver implements ModelStatsDbDriver {
  private readonly cache = new Map<StatementKey, Database.Statement>();

  constructor(private readonly db: Database.Database) {}

  modelBreakdown(q: ModelStatsQuery): ModelStatsRawRow[] {
    const key = keyFor(q);
    let stmt = this.cache.get(key);
    if (!stmt) {
      // Phase-2 Season Flacsh: `tokens_in_sum`, `tokens_cache_read` und
      // `tokens_cache_creation` ergaenzen die Cache-Hit-Rate-Berechnung
      // im Repository. `tokens_in_sum` wird separat aggregiert, weil das
      // bestehende `tokens`-Feld input+output summiert — und `tokens_in`
      // seit 0008 die Cache-Read/-Creation-Tokens bereits enthaelt (das
      // `tokens`-Total ist also die verarbeitete, nicht die billable Sicht).
      stmt = this.db.prepare(
        `SELECT model,
                COUNT(*) AS messages,
                COUNT(DISTINCT session_id) AS sessions,
                COALESCE(SUM(tokens_in + tokens_out), 0) AS tokens,
                COALESCE(SUM(tokens_in), 0) AS tokens_in_sum,
                COALESCE(SUM(tokens_cache_read), 0) AS tokens_cache_read,
                COALESCE(SUM(tokens_cache_creation), 0) AS tokens_cache_creation
         FROM messages
         ${whereClause(q)}
         GROUP BY model
         ORDER BY tokens DESC, model ASC`,
      );
      this.cache.set(key, stmt);
    }
    const rows = stmt.all(...paramsFor(q)) as Array<{
      model: string;
      messages: number;
      sessions: number;
      tokens: number;
      tokens_in_sum: number;
      tokens_cache_read: number;
      tokens_cache_creation: number;
    }>;
    return rows.map((r) => ({
      model: r.model,
      messages: r.messages,
      sessions: r.sessions,
      tokens: r.tokens,
      tokens_in_sum: r.tokens_in_sum,
      tokens_cache_read: r.tokens_cache_read,
      tokens_cache_creation: r.tokens_cache_creation,
    }));
  }
}

// --- In-Memory-Driver für Tests --------------------------------------

export interface InMemoryModelStatsMessageLike {
  project_id: string | null;
  session_id: string;
  ts: number;
  tokens_in: number;
  tokens_out: number;
  tokens_cache_creation?: number;
  tokens_cache_read?: number;
  model: string | null;
}

export class InMemoryModelStatsDriver implements ModelStatsDbDriver {
  constructor(private readonly messages: InMemoryModelStatsMessageLike[]) {}

  modelBreakdown(q: ModelStatsQuery): ModelStatsRawRow[] {
    const byModel = new Map<
      string,
      {
        messages: number;
        sessions: Set<string>;
        tokens: number;
        tokens_in_sum: number;
        tokens_cache_read: number;
        tokens_cache_creation: number;
      }
    >();
    for (const m of this.messages) {
      if (m.model === null) continue;
      if (q.projectId !== null && m.project_id !== q.projectId) continue;
      if (q.rangeStartTs !== null && m.ts < q.rangeStartTs) continue;
      let entry = byModel.get(m.model);
      if (!entry) {
        entry = {
          messages: 0,
          sessions: new Set(),
          tokens: 0,
          tokens_in_sum: 0,
          tokens_cache_read: 0,
          tokens_cache_creation: 0,
        };
        byModel.set(m.model, entry);
      }
      entry.messages += 1;
      entry.sessions.add(m.session_id);
      entry.tokens += m.tokens_in + m.tokens_out;
      entry.tokens_in_sum += m.tokens_in;
      entry.tokens_cache_read += m.tokens_cache_read ?? 0;
      entry.tokens_cache_creation += m.tokens_cache_creation ?? 0;
    }
    const rows: ModelStatsRawRow[] = [];
    for (const [model, e] of byModel) {
      rows.push({
        model,
        messages: e.messages,
        sessions: e.sessions.size,
        tokens: e.tokens,
        tokens_in_sum: e.tokens_in_sum,
        tokens_cache_read: e.tokens_cache_read,
        tokens_cache_creation: e.tokens_cache_creation,
      });
    }
    // Gleicher Sort wie SQLite: tokens DESC, model ASC.
    rows.sort((a, b) => (b.tokens - a.tokens) || a.model.localeCompare(b.model));
    return rows;
  }
}
