import type {
  AppSettings,
  LimitBar,
  UsageWindowResult,
  UsageContextResult,
} from '@shared/types';
import type { UsageRepository } from '../db/repos/usage';
import type { MessageRepository } from '../db/repos/messages';
import { hourBucket, percentileP90 } from '../db/repos/usage';

// Window/Context-Resolver (Sprint 5).
//
// Pure-Logik-Schicht zwischen IPC-Handler und Repos: liest Settings, ruft die
// Repo-Aggregate, berechnet P90/Fallback-Limits und liefert das fertige Result.
// Driver-Injection-Pattern: Tests übergeben InMemoryUsageDriver + InMemoryMessageDriver,
// echte Aufrufe bekommen die SQLite-Driver-Variante.

// Mindest-Anzahl Hourly-Buckets, ab denen P90 sinnvoll ist. <24 Stunden Daten
// (= weniger als ein Tag) liefern erratische Schätzungen; in dem Fall fällt der
// Resolver auf settings.model_limits[default_model] (oder default_limit) zurück
// und meldet limitSource='fallback' im Result.
const P90_MIN_BUCKETS = 24;

export interface ResolveWindowDeps {
  usage: UsageRepository;
  settings: AppSettings;
  // Default = Date.now. Tests injizieren eine Fixed-Clock.
  now?: () => number;
}

export function resolveWindow(
  bar: LimitBar,
  deps: ResolveWindowDeps,
): UsageWindowResult {
  const now = (deps.now ?? Date.now)();
  const currentBucket = hourBucket(now);
  const fromBucket = currentBucket - bar.window_hours + 1;

  const tokens = deps.usage.sumTokens({
    fromBucket,
    toBucket: currentBucket,
    filter: bar.filter,
    customPattern: bar.model_pattern,
  });

  const limit = computeLimit(bar, deps.usage, deps.settings, currentBucket);

  const breakdown = deps.usage.perModelBreakdown({
    fromBucket,
    toBucket: currentBucket,
  });

  const limitValue = limit.value;
  const percent = limitValue > 0 ? (tokens / limitValue) * 100 : 0;

  return {
    barId: bar.id,
    label: bar.label,
    tokens,
    limit: limitValue,
    percent,
    limitSource: limit.source,
    windowHours: bar.window_hours,
    perModel: breakdown,
    generatedAt: now,
  };
}

function computeLimit(
  bar: LimitBar,
  usage: UsageRepository,
  settings: AppSettings,
  currentBucket: number,
): { value: number; source: 'p90' | 'fixed' | 'fallback' } {
  if (bar.limit_method === 'fixed' && bar.fixed_limit) {
    return { value: bar.fixed_limit, source: 'fixed' };
  }
  // P90 über das settings.p90_window_hours-Fenster, gefiltert auf das gleiche Modell-
  // Set wie die Bar selbst (sonst würde z.B. der weekly_sonnet-Bar P90 aus allen
  // Modellen ziehen, was die Schätzung verwässert).
  const fromP90Bucket = currentBucket - settings.p90_window_hours + 1;
  const buckets = usage.bucketTokens({
    fromBucket: fromP90Bucket,
    toBucket: currentBucket,
    filter: bar.filter,
    customPattern: bar.model_pattern,
  });
  if (buckets.length < P90_MIN_BUCKETS) {
    return { value: fallbackLimit(settings), source: 'fallback' };
  }
  const p90 = percentileP90(buckets);
  if (p90 === null || p90 <= 0) {
    return { value: fallbackLimit(settings), source: 'fallback' };
  }
  // P90 ist Tokens pro Stunde — wir multiplizieren mit der Window-Größe, um eine
  // Limit-Schätzung „typisch in window_hours Stunden" zu bekommen. Damit steht der
  // 5h-Bar-Limit auch sinnvoll an, wenn der Wochenverbrauch sehr hoch ist.
  const hourly = p90;
  const windowed = hourly * bar.window_hours;
  return { value: Math.round(windowed), source: 'p90' };
}

function fallbackLimit(settings: AppSettings): number {
  const defaultModel = settings.default_model;
  const explicit = settings.model_limits[defaultModel];
  if (explicit && explicit > 0) return explicit;
  return settings.default_limit;
}

// --- Per-Session-Kontext (usage:context) -----------------------------

export interface ResolveContextDeps {
  messages: MessageRepository;
  settings: AppSettings;
  // sessionModel: das vom SessionRepository gemeldete current_model — wird genutzt,
  // wenn die letzte Message keine model-Information trägt (selten, aber defensiv).
  sessionModel: string | null;
}

export function resolveContext(
  sessionId: string,
  deps: ResolveContextDeps,
): UsageContextResult {
  const last = deps.messages.lastUsageForSession(sessionId);
  const tsNullable = last?.ts ?? null;

  // Sprint-5-Repo speichert tokens_in als Sum aus message.usage.input_tokens; wir
  // haben aktuell keine separate Spalte für cache_creation/cache_read. Für die
  // Per-Session-Kontext-Bar brauchen wir aber die getrennten Werte — daher schreibt
  // der Watcher die drei Anteile in tokens_in (input + cache_creation + cache_read),
  // und tokens_out trägt output_tokens. Die Per-Session-Aufschlüsselung in der
  // Detail-Modal kommt aus dem Original-JSONL (Sprint 6: Verlauf-Panel) — bis dahin
  // sehen wir hier den summierten input-Anteil als „total".
  const total = last?.tokens_in ?? 0;
  const model = deps.sessionModel;
  const limit = limitForModel(deps.settings, model);
  const percent = limit > 0 ? (total / limit) * 100 : 0;

  return {
    sessionId,
    model,
    tokens: {
      input: total,
      cache_creation: 0,
      cache_read: 0,
      total,
    },
    limit,
    percent,
    lastEventAt: tsNullable,
  };
}

function limitForModel(settings: AppSettings, model: string | null): number {
  if (model && settings.model_limits[model]) {
    return settings.model_limits[model];
  }
  return settings.default_limit;
}
