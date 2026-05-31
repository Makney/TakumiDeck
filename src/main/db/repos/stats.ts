import type Database from 'better-sqlite3';
import type { StatsOverviewResult, StatsRange } from '@shared/types';
import { computeStreaks, todayLocalDate } from '../../stats/streak';

// StatsRepository (Phase-2 Season-12).
//
// Aggregat-Quelle fuer die acht Stats-Cards in der Stats-Pane. Liest direkt
// aus `messages` (Token-/Modell-/Hour-Aggregate) und `sessions` (Anzahl
// Sessions im Range). Keine eigene Aggregat-Tabelle — die existierenden
// Indizes `idx_messages_project_ts` (Sprint 5) und `idx_messages_session_ts`
// (Sprint 1) decken die Filter-Where-Klauseln ab.
//
// Trennlinie zur usage_buckets-Tabelle: die Buckets sind global pro Stunde+
// Modell aggregiert (kein project_id), bringen aber die Per-Projekt-Sicht
// nicht — daher gehen alle Stats hier auf messages.

export interface StatsQuery {
  // null = global ueber alle Projekte.
  projectId: string | null;
  // Untergrenze inklusive. null = keine Untergrenze (range='all').
  rangeStartTs: number | null;
}

export interface StatsDbDriver {
  countSessions(q: StatsQuery): number;
  countMessages(q: StatsQuery): number;
  sumTokens(q: StatsQuery): number;
  // ASC-sortierte distinct Local-Days (Format YYYY-MM-DD).
  distinctActiveDays(q: StatsQuery): string[];
  // Stunde 0–23 mit hoechstem message-COUNT. null = keine messages im Range.
  // Tie-Break: kleinere Stunde gewinnt (deterministisch fuer Tests).
  peakHour(q: StatsQuery): { hour: number; count: number } | null;
  // Modell mit hoechstem message-COUNT (model IS NOT NULL). null = keine
  // Messages mit Modell-Info. Tie-Break: alphabetisch aufsteigend.
  favoriteModel(q: StatsQuery): { model: string; count: number } | null;
}

export class StatsRepository {
  constructor(private readonly driver: StatsDbDriver) {}

  getOverview(input: {
    projectId: string | null;
    range: StatsRange;
    now?: Date;
  }): StatsOverviewResult {
    const now = input.now ?? new Date();
    const rangeStartTs = computeRangeStartTs(input.range, now);
    const query: StatsQuery = { projectId: input.projectId, rangeStartTs };

    const sessionsTotal = this.driver.countSessions(query);
    const messagesTotal = this.driver.countMessages(query);
    const tokensTotal = this.driver.sumTokens(query);
    const days = this.driver.distinctActiveDays(query);
    const peak = this.driver.peakHour(query);
    const favorite = this.driver.favoriteModel(query);
    const streaks = computeStreaks(days, todayLocalDate(now));

    return {
      sessions_total: sessionsTotal,
      messages_total: messagesTotal,
      tokens_total: tokensTotal,
      active_days: days.length,
      current_streak_days: streaks.current,
      longest_streak_days: streaks.longest,
      peak_hour: peak?.hour ?? null,
      peak_hour_count: peak?.count ?? 0,
      favorite_model: favorite?.model ?? null,
      favorite_model_count: favorite?.count ?? 0,
      scope: input.projectId === null ? 'global' : 'project',
      range: input.range,
      generated_at: now.getTime(),
    };
  }
}

export function computeRangeStartTs(range: StatsRange, now: Date): number | null {
  switch (range) {
    case 'all':
      return null;
    case '30d':
      return now.getTime() - 30 * 86_400_000;
    case '7d':
      return now.getTime() - 7 * 86_400_000;
    default:
      return null;
  }
}

// --- SQLite-Driver --------------------------------------------------

// Statement-Cache nach (hasProjectFilter, hasRangeFilter)-Kombination, damit
// wir die vier Auspraegungen pro Query nur einmal compilen.
type StatementKey = `${'p' | 'g'}_${'r' | 'a'}`;

function keyFor(q: StatsQuery): StatementKey {
  const p = q.projectId === null ? 'g' : 'p';
  const r = q.rangeStartTs === null ? 'a' : 'r';
  return `${p}_${r}` as StatementKey;
}

function whereClause(q: StatsQuery, table: 'sessions' | 'messages'): string {
  const tsCol = table === 'sessions' ? 'started_at' : 'ts';
  const parts: string[] = [];
  if (q.projectId !== null) parts.push('project_id = ?');
  if (q.rangeStartTs !== null) parts.push(`${tsCol} >= ?`);
  return parts.length === 0 ? '' : `WHERE ${parts.join(' AND ')}`;
}

function paramsFor(q: StatsQuery): Array<string | number> {
  const out: Array<string | number> = [];
  if (q.projectId !== null) out.push(q.projectId);
  if (q.rangeStartTs !== null) out.push(q.rangeStartTs);
  return out;
}

export class SqliteStatsDriver implements StatsDbDriver {
  private readonly sessionsCountCache = new Map<StatementKey, Database.Statement>();
  private readonly messagesCountCache = new Map<StatementKey, Database.Statement>();
  private readonly tokensSumCache = new Map<StatementKey, Database.Statement>();
  private readonly daysCache = new Map<StatementKey, Database.Statement>();
  private readonly peakHourCache = new Map<StatementKey, Database.Statement>();
  private readonly favoriteModelCache = new Map<StatementKey, Database.Statement>();

  constructor(private readonly db: Database.Database) {}

  countSessions(q: StatsQuery): number {
    const key = keyFor(q);
    let stmt = this.sessionsCountCache.get(key);
    if (!stmt) {
      stmt = this.db.prepare(`SELECT COUNT(*) AS n FROM sessions ${whereClause(q, 'sessions')}`);
      this.sessionsCountCache.set(key, stmt);
    }
    const row = stmt.get(...paramsFor(q)) as { n: number } | undefined;
    return row?.n ?? 0;
  }

  countMessages(q: StatsQuery): number {
    const key = keyFor(q);
    let stmt = this.messagesCountCache.get(key);
    if (!stmt) {
      stmt = this.db.prepare(`SELECT COUNT(*) AS n FROM messages ${whereClause(q, 'messages')}`);
      this.messagesCountCache.set(key, stmt);
    }
    const row = stmt.get(...paramsFor(q)) as { n: number } | undefined;
    return row?.n ?? 0;
  }

  // „Tokens gesamt" = SUM(tokens_in + tokens_out). Seit Migration 0008 buendelt
  // `tokens_in` input + cache_creation + cache_read, d.h. die Cache-Read-Tokens
  // (oft stark rabattiert) zaehlen voll mit. Das ist bewusst die „verarbeitete
  // Tokens"-Sicht, nicht der billable Netto-Verbrauch — bei hohem Cache-Hit-
  // Anteil liegt die Zahl entsprechend ueber dem Abrechnungs-Aequivalent.
  sumTokens(q: StatsQuery): number {
    const key = keyFor(q);
    let stmt = this.tokensSumCache.get(key);
    if (!stmt) {
      stmt = this.db.prepare(
        `SELECT COALESCE(SUM(tokens_in + tokens_out), 0) AS s FROM messages ${whereClause(q, 'messages')}`,
      );
      this.tokensSumCache.set(key, stmt);
    }
    const row = stmt.get(...paramsFor(q)) as { s: number } | undefined;
    return row?.s ?? 0;
  }

  distinctActiveDays(q: StatsQuery): string[] {
    const key = keyFor(q);
    let stmt = this.daysCache.get(key);
    if (!stmt) {
      // ts ist epoch-ms, strftime erwartet Sekunden — daher /1000.
      // 'localtime' zieht die Zeitzone des Main-Prozesses (siehe
      // SEASON_LOG-Notiz: Local-Time ist die intuitive User-Sicht).
      stmt = this.db.prepare(
        `SELECT DISTINCT strftime('%Y-%m-%d', ts/1000, 'unixepoch', 'localtime') AS day
         FROM messages ${whereClause(q, 'messages')}
         ORDER BY day ASC`,
      );
      this.daysCache.set(key, stmt);
    }
    const rows = stmt.all(...paramsFor(q)) as Array<{ day: string }>;
    return rows.map((r) => r.day);
  }

  peakHour(q: StatsQuery): { hour: number; count: number } | null {
    const key = keyFor(q);
    let stmt = this.peakHourCache.get(key);
    if (!stmt) {
      stmt = this.db.prepare(
        `SELECT CAST(strftime('%H', ts/1000, 'unixepoch', 'localtime') AS INTEGER) AS hour,
                COUNT(*) AS cnt
         FROM messages ${whereClause(q, 'messages')}
         GROUP BY hour
         ORDER BY cnt DESC, hour ASC
         LIMIT 1`,
      );
      this.peakHourCache.set(key, stmt);
    }
    const row = stmt.get(...paramsFor(q)) as { hour: number; cnt: number } | undefined;
    if (!row) return null;
    return { hour: row.hour, count: row.cnt };
  }

  favoriteModel(q: StatsQuery): { model: string; count: number } | null {
    const key = keyFor(q);
    let stmt = this.favoriteModelCache.get(key);
    if (!stmt) {
      const where = whereClause(q, 'messages');
      const modelFilter = where.length === 0 ? 'WHERE model IS NOT NULL' : `${where} AND model IS NOT NULL`;
      stmt = this.db.prepare(
        `SELECT model, COUNT(*) AS cnt
         FROM messages ${modelFilter}
         GROUP BY model
         ORDER BY cnt DESC, model ASC
         LIMIT 1`,
      );
      this.favoriteModelCache.set(key, stmt);
    }
    const row = stmt.get(...paramsFor(q)) as { model: string; cnt: number } | undefined;
    if (!row) return null;
    return { model: row.model, count: row.cnt };
  }
}

// --- In-Memory-Driver für Tests --------------------------------------

export interface InMemorySessionLike {
  project_id: string;
  started_at: number;
}

export interface InMemoryMessageLike {
  project_id: string | null;
  ts: number;
  tokens_in: number;
  tokens_out: number;
  model: string | null;
}

export class InMemoryStatsDriver implements StatsDbDriver {
  constructor(
    private readonly sessions: InMemorySessionLike[],
    private readonly messages: InMemoryMessageLike[],
  ) {}

  countSessions(q: StatsQuery): number {
    return this.filterSessions(q).length;
  }

  countMessages(q: StatsQuery): number {
    return this.filterMessages(q).length;
  }

  sumTokens(q: StatsQuery): number {
    let sum = 0;
    for (const m of this.filterMessages(q)) sum += m.tokens_in + m.tokens_out;
    return sum;
  }

  distinctActiveDays(q: StatsQuery): string[] {
    const set = new Set<string>();
    for (const m of this.filterMessages(q)) set.add(localDayFromMs(m.ts));
    return [...set].sort();
  }

  peakHour(q: StatsQuery): { hour: number; count: number } | null {
    const counts = new Map<number, number>();
    for (const m of this.filterMessages(q)) {
      const h = localHourFromMs(m.ts);
      counts.set(h, (counts.get(h) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    let bestHour = -1;
    let bestCount = -1;
    for (const [hour, count] of counts) {
      if (count > bestCount || (count === bestCount && hour < bestHour)) {
        bestHour = hour;
        bestCount = count;
      }
    }
    return { hour: bestHour, count: bestCount };
  }

  favoriteModel(q: StatsQuery): { model: string; count: number } | null {
    const counts = new Map<string, number>();
    for (const m of this.filterMessages(q)) {
      if (m.model === null) continue;
      counts.set(m.model, (counts.get(m.model) ?? 0) + 1);
    }
    if (counts.size === 0) return null;
    let bestModel: string | null = null;
    let bestCount = -1;
    for (const [model, count] of counts) {
      if (count > bestCount || (count === bestCount && bestModel !== null && model < bestModel)) {
        bestModel = model;
        bestCount = count;
      }
    }
    if (bestModel === null) return null;
    return { model: bestModel, count: bestCount };
  }

  private filterSessions(q: StatsQuery): InMemorySessionLike[] {
    return this.sessions.filter((s) => {
      if (q.projectId !== null && s.project_id !== q.projectId) return false;
      if (q.rangeStartTs !== null && s.started_at < q.rangeStartTs) return false;
      return true;
    });
  }

  private filterMessages(q: StatsQuery): InMemoryMessageLike[] {
    return this.messages.filter((m) => {
      if (q.projectId !== null && m.project_id !== q.projectId) return false;
      if (q.rangeStartTs !== null && m.ts < q.rangeStartTs) return false;
      return true;
    });
  }
}

// Spiegelt SQLites strftime('%Y-%m-%d', ts/1000, 'unixepoch', 'localtime')
// — wir bauen die String-Repraesentation aus den lokalen Date-Gettern, damit
// das Aggregat-Verhalten zwischen InMemory- und SQLite-Pfad identisch bleibt.
export function localDayFromMs(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export function localHourFromMs(ms: number): number {
  return new Date(ms).getHours();
}
