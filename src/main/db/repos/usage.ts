import type Database from 'better-sqlite3';
import type { UsageBucketUpsert } from '@shared/types';
import { resolveBarFilter, type BarFilter } from '../../usage/filters';

// UsageRepository (Sprint 5).
//
// Hourly-Aggregat über alle JSONL-Token-Events aller Sessions. Zwei Schreib-Pfade:
//   - upsertBucket: addiert tokens auf den (bucket_start, model)-Key. Wird vom
//     Watcher pro JSONL-Zeile gerufen.
// Lese-Pfade:
//   - sumTokensInWindow: summiert tokens in einem Stunden-Fenster, optional gefiltert
//     auf Modell-Pattern (5h-Bar, weekly-Bar usw., siehe usage/filters.ts).
//   - bucketTokensInWindow: liefert die einzelnen Hourly-Buckets (für P90 + Burn-Rate).
//   - perModelBreakdownInWindow: Per-Modell-Tokens für Tooltips/Detail-Modal.

export interface UsageDbDriver {
  upsertBucket(row: UsageBucketUpsert): void;
  // Summe tokens für (bucket_start ∈ [fromBucket, toBucket]) ∩ filter.
  sumTokensInWindow(input: WindowQuery): number;
  bucketTokensInWindow(input: WindowQuery): number[];
  perModelBreakdownInWindow(
    input: Omit<WindowQuery, 'modelLike'>,
  ): Array<{ model: string; tokens: number }>;
}

export interface WindowQuery {
  fromBucket: number; // inkl.
  toBucket: number; // inkl.
  // SQL-LIKE-Pattern (z.B. '%opus%'); null = keine Modell-Einschränkung.
  modelLike: string | null;
}

export class UsageRepository {
  constructor(private readonly driver: UsageDbDriver) {}

  upsertBucket(row: UsageBucketUpsert): void {
    if (row.tokens <= 0) return; // negative oder null-Buckets schreiben wir nicht
    this.driver.upsertBucket(row);
  }

  // Bequeme Wrapper, die die Bar-Filter direkt akzeptieren — die Repo-Methoden selbst
  // bleiben SQL-nah und nehmen ein LIKE-Pattern. Die Auflösung Filter→LIKE liegt in
  // usage/filters.ts (testbar ohne DB).
  sumTokens(input: {
    fromBucket: number;
    toBucket: number;
    filter: BarFilter;
    customPattern?: string;
  }): number {
    const def = resolveBarFilter(input.filter, input.customPattern);
    return this.driver.sumTokensInWindow({
      fromBucket: input.fromBucket,
      toBucket: input.toBucket,
      modelLike: def.sqlLike,
    });
  }

  bucketTokens(input: {
    fromBucket: number;
    toBucket: number;
    filter: BarFilter;
    customPattern?: string;
  }): number[] {
    const def = resolveBarFilter(input.filter, input.customPattern);
    return this.driver.bucketTokensInWindow({
      fromBucket: input.fromBucket,
      toBucket: input.toBucket,
      modelLike: def.sqlLike,
    });
  }

  perModelBreakdown(input: {
    fromBucket: number;
    toBucket: number;
  }): Array<{ model: string; tokens: number }> {
    return this.driver.perModelBreakdownInWindow(input);
  }
}

// 90. Perzentil über eine Liste von Buckets. Bevorzugt einen großzügigen
// Fallback auf 0, wenn weniger als 24 Buckets (= 1 Tag) vorliegen — dann hat
// der Aufrufer (= window-Resolver) zu wenig Datenbasis, um sinnvoll zu schätzen.
//
// Pure Helper, damit der Aggregations-Test ihn ohne DB benutzen kann.
export function percentileP90(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  // Lineare Interpolation (Excel-Methode): rank = 0.9 * (n - 1).
  const rank = 0.9 * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const lowerVal = sorted[lower];
  const upperVal = sorted[upper];
  if (lowerVal === undefined || upperVal === undefined) return null;
  if (lower === upper) return lowerVal;
  const weight = rank - lower;
  return lowerVal + (upperVal - lowerVal) * weight;
}

// Stunden-Bucket = floor(epoch-ms / 3_600_000). Architektur 4 nutzt diesen
// Bucket-Schlüssel für PRIMARY KEY (bucket_start, model) auf usage_buckets.
export function hourBucket(epochMs: number): number {
  return Math.floor(epochMs / 3_600_000);
}

// --- SQLite-Driver --------------------------------------------------

export class SqliteUsageDriver implements UsageDbDriver {
  private readonly upsertStmt: Database.Statement;
  // Wir bauen die SELECT-Statements lazy je nach modelLike, weil prepared LIKE
  // den Pattern-Bind erlaubt. Der Filter-Pfad ist konstanter Aufwand.
  private readonly sumWithFilterStmt: Database.Statement<
    [number, number, string],
    { total: number | null }
  >;
  private readonly sumAllStmt: Database.Statement<
    [number, number],
    { total: number | null }
  >;
  private readonly bucketsWithFilterStmt: Database.Statement<
    [number, number, string],
    { tokens: number }
  >;
  private readonly bucketsAllStmt: Database.Statement<
    [number, number],
    { tokens: number }
  >;
  private readonly breakdownStmt: Database.Statement<
    [number, number],
    { model: string; tokens: number }
  >;

  constructor(db: Database.Database) {
    this.upsertStmt = db.prepare(
      `INSERT INTO usage_buckets (bucket_start, model, tokens)
       VALUES (@bucket_start, @model, @tokens)
       ON CONFLICT(bucket_start, model)
       DO UPDATE SET tokens = tokens + excluded.tokens`,
    );
    this.sumWithFilterStmt = db.prepare<[number, number, string], { total: number | null }>(
      `SELECT SUM(tokens) AS total FROM usage_buckets
       WHERE bucket_start BETWEEN ? AND ? AND model LIKE ?`,
    );
    this.sumAllStmt = db.prepare<[number, number], { total: number | null }>(
      `SELECT SUM(tokens) AS total FROM usage_buckets
       WHERE bucket_start BETWEEN ? AND ?`,
    );
    this.bucketsWithFilterStmt = db.prepare<[number, number, string], { tokens: number }>(
      `SELECT SUM(tokens) AS tokens FROM usage_buckets
       WHERE bucket_start BETWEEN ? AND ? AND model LIKE ?
       GROUP BY bucket_start ORDER BY bucket_start ASC`,
    );
    this.bucketsAllStmt = db.prepare<[number, number], { tokens: number }>(
      `SELECT SUM(tokens) AS tokens FROM usage_buckets
       WHERE bucket_start BETWEEN ? AND ?
       GROUP BY bucket_start ORDER BY bucket_start ASC`,
    );
    this.breakdownStmt = db.prepare<[number, number], { model: string; tokens: number }>(
      `SELECT model, SUM(tokens) AS tokens FROM usage_buckets
       WHERE bucket_start BETWEEN ? AND ?
       GROUP BY model ORDER BY tokens DESC`,
    );
  }

  upsertBucket(row: UsageBucketUpsert): void {
    this.upsertStmt.run(row);
  }

  sumTokensInWindow(input: WindowQuery): number {
    const row = input.modelLike
      ? this.sumWithFilterStmt.get(input.fromBucket, input.toBucket, input.modelLike)
      : this.sumAllStmt.get(input.fromBucket, input.toBucket);
    return row?.total ?? 0;
  }

  bucketTokensInWindow(input: WindowQuery): number[] {
    const rows = input.modelLike
      ? this.bucketsWithFilterStmt.all(input.fromBucket, input.toBucket, input.modelLike)
      : this.bucketsAllStmt.all(input.fromBucket, input.toBucket);
    return rows.map((r) => r.tokens);
  }

  perModelBreakdownInWindow(
    input: Omit<WindowQuery, 'modelLike'>,
  ): Array<{ model: string; tokens: number }> {
    return this.breakdownStmt.all(input.fromBucket, input.toBucket);
  }
}

// --- In-Memory-Driver für Tests --------------------------------------

export class InMemoryUsageDriver implements UsageDbDriver {
  // Map<bucket_start, Map<model, tokens>>.
  private readonly buckets = new Map<number, Map<string, number>>();

  upsertBucket(row: UsageBucketUpsert): void {
    const inner = this.buckets.get(row.bucket_start) ?? new Map<string, number>();
    inner.set(row.model, (inner.get(row.model) ?? 0) + row.tokens);
    this.buckets.set(row.bucket_start, inner);
  }

  sumTokensInWindow(input: WindowQuery): number {
    let total = 0;
    for (const [bucket, models] of this.buckets) {
      if (bucket < input.fromBucket || bucket > input.toBucket) continue;
      for (const [model, tokens] of models) {
        if (input.modelLike && !matchesLike(model, input.modelLike)) continue;
        total += tokens;
      }
    }
    return total;
  }

  bucketTokensInWindow(input: WindowQuery): number[] {
    const acc = new Map<number, number>();
    for (const [bucket, models] of this.buckets) {
      if (bucket < input.fromBucket || bucket > input.toBucket) continue;
      let sum = 0;
      for (const [model, tokens] of models) {
        if (input.modelLike && !matchesLike(model, input.modelLike)) continue;
        sum += tokens;
      }
      if (sum > 0) acc.set(bucket, sum);
    }
    return [...acc.entries()].sort(([a], [b]) => a - b).map(([, v]) => v);
  }

  perModelBreakdownInWindow(
    input: Omit<WindowQuery, 'modelLike'>,
  ): Array<{ model: string; tokens: number }> {
    const acc = new Map<string, number>();
    for (const [bucket, models] of this.buckets) {
      if (bucket < input.fromBucket || bucket > input.toBucket) continue;
      for (const [model, tokens] of models) {
        acc.set(model, (acc.get(model) ?? 0) + tokens);
      }
    }
    return [...acc.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([model, tokens]) => ({ model, tokens }));
  }

  // Test-Helper: rohe Daten zurückgeben.
  snapshot(): Array<{ bucket: number; model: string; tokens: number }> {
    const out: Array<{ bucket: number; model: string; tokens: number }> = [];
    for (const [bucket, models] of this.buckets) {
      for (const [model, tokens] of models) out.push({ bucket, model, tokens });
    }
    return out;
  }
}

function matchesLike(value: string, pattern: string): boolean {
  // Identische Semantik zu SQLite-LIKE (case-insensitiv): `%` = beliebig, `_` = einer.
  let body = '';
  for (const c of pattern) {
    if (c === '%') body += '.*';
    else if (c === '_') body += '.';
    else body += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${body}$`, 'i').test(value);
}
