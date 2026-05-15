import { describe, it, expect } from 'vitest';
import { computeResetWindowStart } from '../../src/main/usage/reset-schedule';
import {
  UsageRepository,
  InMemoryUsageDriver,
  hourBucket,
} from '../../src/main/db/repos/usage';
import { resolveWindow } from '../../src/main/usage/resolver';
import type { AppSettings, LimitBar } from '@shared/types';

// Phase 2 Season Flacsh — Reset-Schedule-Aggregation.
//
// Tests fuer den Pure-Helper plus den Integrations-Pfad: resolveWindow muss
// bei gesetztem reset_schedule den Verbrauchs-Counter ab dem letzten
// Reset-Zeitpunkt aggregieren, statt rolling ueber window_hours zu laufen.

function buildSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    workspace_path: '/tmp/projects',
    workspace_wizard_completed: true,
    default_model: 'claude-sonnet-4-6',
    claude_binary_path: 'claude',
    model_limits: {
      'claude-sonnet-4-6': 1_000_000,
      'claude-opus-4-7': 1_000_000,
      'claude-haiku-4-5': 200_000,
    },
    default_limit: 200_000,
    limit_bars: [],
    p90_window_hours: 192,
    token_warning_thresholds: { yellow: 70, orange: 85, red: 95 },
    context_soft_warning: { enabled: true, threshold_percent: 20 },
    terminal_font_family: 'JetBrains Mono',
    terminal_font_size: 13,
    theme: 'dark',
    accent_color: '#4ade80',
    shortcuts: {},
    sensitive_file_patterns: [],
    screenshot_retention: { max_age_days: 30, max_total_mib: 500 },
    easter_egg_enabled: true,
    ...overrides,
  };
}

describe('computeResetWindowStart (pure)', () => {
  it('Wochentag vor heute → letzter dieses-Tags-Reset', () => {
    // Donnerstag 14.05.2026 12:00 lokal, Reset = Montag 00:00.
    const now = new Date(2026, 4, 14, 12, 0, 0, 0).getTime();
    const reset = computeResetWindowStart(
      { day_of_week: 1, hour: 0, minute: 0 },
      now,
    );
    const expected = new Date(2026, 4, 11, 0, 0, 0, 0).getTime();
    expect(reset).toBe(expected);
  });

  it('heute = Reset-Tag, Reset-Zeit vorbei → heute', () => {
    // Montag 11.05.2026 12:00, Reset = Montag 00:00 → heute 00:00.
    const now = new Date(2026, 4, 11, 12, 0, 0, 0).getTime();
    const reset = computeResetWindowStart(
      { day_of_week: 1, hour: 0, minute: 0 },
      now,
    );
    const expected = new Date(2026, 4, 11, 0, 0, 0, 0).getTime();
    expect(reset).toBe(expected);
  });

  it('heute = Reset-Tag, Reset-Zeit noch in Zukunft → letzte Woche', () => {
    // Montag 11.05.2026 08:00, Reset = Montag 10:00 → letzte Woche Mo 10:00.
    const now = new Date(2026, 4, 11, 8, 0, 0, 0).getTime();
    const reset = computeResetWindowStart(
      { day_of_week: 1, hour: 10, minute: 0 },
      now,
    );
    const expected = new Date(2026, 4, 4, 10, 0, 0, 0).getTime();
    expect(reset).toBe(expected);
  });

  it('Sonntag (day_of_week=0) wird korrekt aufgeloest', () => {
    // Donnerstag 14.05.2026 12:00, Reset = Sonntag 00:00 → 10.05.
    const now = new Date(2026, 4, 14, 12, 0, 0, 0).getTime();
    const reset = computeResetWindowStart(
      { day_of_week: 0, hour: 0, minute: 0 },
      now,
    );
    const expected = new Date(2026, 4, 10, 0, 0, 0, 0).getTime();
    expect(reset).toBe(expected);
  });

  it('Minute-Praezision wird respektiert', () => {
    // Reset = Montag 03:30, jetzt Dienstag 12.05.2026 09:00.
    const now = new Date(2026, 4, 12, 9, 0, 0, 0).getTime();
    const reset = computeResetWindowStart(
      { day_of_week: 1, hour: 3, minute: 30 },
      now,
    );
    const expected = new Date(2026, 4, 11, 3, 30, 0, 0).getTime();
    expect(reset).toBe(expected);
  });
});

describe('resolveWindow mit reset_schedule', () => {
  // Donnerstag 14.05.2026 12:00, Reset = Montag 00:00 → Reset-Anker 11.05.2026 00:00.
  const NOW = new Date(2026, 4, 14, 12, 0, 0, 0).getTime();
  const NOW_BUCKET = hourBucket(NOW);
  const RESET_BUCKET = hourBucket(new Date(2026, 4, 11, 0, 0, 0, 0).getTime());

  const barWithReset = (): LimitBar => ({
    id: 'weekly_all',
    label: 'Wöchentlich · Alles',
    window_hours: 168,
    filter: 'all',
    limit_method: 'fixed',
    fixed_limit: 1_000_000,
    reset_schedule: { day_of_week: 1, hour: 0, minute: 0 },
  });

  it('aggregiert nur Tokens ab dem letzten Reset-Zeitpunkt', () => {
    const repo = new UsageRepository(new InMemoryUsageDriver());
    // Im aktuellen Reset-Fenster (Mo 00:00 → Do 12:00): 100 + 200 = 300.
    repo.upsertBucket({ bucket_start: RESET_BUCKET + 1, model: 'claude-opus-4-7', tokens: 100 });
    repo.upsertBucket({ bucket_start: NOW_BUCKET - 2, model: 'claude-opus-4-7', tokens: 200 });
    // VOR dem Reset (Sonntag) — duerfte NICHT in die Summe einfliessen,
    // obwohl es im rolling 168-h-Window liegen wuerde.
    repo.upsertBucket({ bucket_start: RESET_BUCKET - 5, model: 'claude-opus-4-7', tokens: 9_999 });

    const result = resolveWindow(barWithReset(), {
      usage: repo,
      settings: buildSettings(),
      now: () => NOW,
    });

    expect(result.tokens).toBe(300);
  });

  it('ohne reset_schedule bleibt das Rolling-Window aktiv', () => {
    const bar: LimitBar = { ...barWithReset() };
    delete bar.reset_schedule;
    const repo = new UsageRepository(new InMemoryUsageDriver());
    repo.upsertBucket({ bucket_start: RESET_BUCKET + 1, model: 'claude-opus-4-7', tokens: 100 });
    // VOR dem Reset — im Rolling-Fenster (168 h) immer noch enthalten, weil
    // 60 h Differenz < 168 h.
    repo.upsertBucket({ bucket_start: RESET_BUCKET - 5, model: 'claude-opus-4-7', tokens: 50 });

    const result = resolveWindow(bar, {
      usage: repo,
      settings: buildSettings(),
      now: () => NOW,
    });

    expect(result.tokens).toBe(150);
  });

  it('frisch nach Reset → tokens=0, obwohl rolling-Window Verbrauch zeigen wuerde', () => {
    // Reset = Montag 11.05 00:00, now = Montag 11.05 00:30 — direkt nach Reset.
    const justAfterReset = new Date(2026, 4, 11, 0, 30, 0, 0).getTime();
    const justAfterBucket = hourBucket(justAfterReset);
    const repo = new UsageRepository(new InMemoryUsageDriver());
    // Sonntag-Aktivitaet (10 h vor "jetzt" = So 14:30): rolling waere drin,
    // post-Reset nicht.
    repo.upsertBucket({ bucket_start: justAfterBucket - 10, model: 'claude-opus-4-7', tokens: 5000 });

    const result = resolveWindow(barWithReset(), {
      usage: repo,
      settings: buildSettings(),
      now: () => justAfterReset,
    });

    expect(result.tokens).toBe(0);
  });

  it('liefert windowStartAt/windowEndAt fuer Footer-Anzeige', () => {
    const repo = new UsageRepository(new InMemoryUsageDriver());
    repo.upsertBucket({ bucket_start: RESET_BUCKET + 1, model: 'claude-opus-4-7', tokens: 100 });
    const result = resolveWindow(barWithReset(), {
      usage: repo,
      settings: buildSettings(),
      now: () => NOW,
    });
    // windowStartAt = letzter Reset (Mo 11.05 00:00 lokal)
    expect(result.windowStartAt).toBe(new Date(2026, 4, 11, 0, 0, 0, 0).getTime());
    // windowEndAt = naechster Reset (Mo 18.05 00:00 lokal)
    expect(result.windowEndAt).toBe(new Date(2026, 4, 18, 0, 0, 0, 0).getTime());
  });
});

// --- Phase 2 Season Flacsh: session_block-Pfad ----------------------------

describe('resolveWindow im session_block-Modus (5h-Block)', () => {
  const FIVE_H_MS = 5 * 3_600_000;

  function make5hSessionBar(): LimitBar {
    return {
      id: '5h',
      label: '5-Stunden-Limit',
      window_hours: 5,
      filter: 'all',
      limit_method: 'fixed',
      fixed_limit: 1_000_000,
      aggregation_mode: 'session_block',
    };
  }

  it('Window startet beim ersten Bucket, summiert bis +5 h', () => {
    // Erstes Token um 10:00, zweites um 12:00, jetzt 13:00.
    const tenAm = new Date(2026, 4, 14, 10, 0, 0, 0).getTime();
    const twelvePm = new Date(2026, 4, 14, 12, 0, 0, 0).getTime();
    const onePm = new Date(2026, 4, 14, 13, 0, 0, 0).getTime();
    const repo = new UsageRepository(new InMemoryUsageDriver());
    repo.upsertBucket({ bucket_start: hourBucket(tenAm), model: 'claude-opus-4-7', tokens: 1000 });
    repo.upsertBucket({ bucket_start: hourBucket(twelvePm), model: 'claude-opus-4-7', tokens: 1000 });

    const result = resolveWindow(make5hSessionBar(), {
      usage: repo,
      settings: buildSettings(),
      now: () => onePm,
    });

    expect(result.tokens).toBe(2000);
    expect(result.windowStartAt).toBe(hourBucket(tenAm) * 3_600_000);
    expect(result.windowEndAt).toBe(hourBucket(tenAm) * 3_600_000 + FIVE_H_MS);
  });

  it('nach Block-Ende: neuer Block startet bei naechstem Bucket', () => {
    // Block 1: 10:00 (1k), endet 15:00. Block 2 startet bei 15:30 → 16:00-Bucket.
    const tenAm = new Date(2026, 4, 14, 10, 0, 0, 0).getTime();
    const fourPm = new Date(2026, 4, 14, 16, 0, 0, 0).getTime();
    const fivePm = new Date(2026, 4, 14, 17, 0, 0, 0).getTime();
    const repo = new UsageRepository(new InMemoryUsageDriver());
    repo.upsertBucket({ bucket_start: hourBucket(tenAm), model: 'claude-opus-4-7', tokens: 9999 });
    repo.upsertBucket({ bucket_start: hourBucket(fourPm), model: 'claude-opus-4-7', tokens: 100 });

    const result = resolveWindow(make5hSessionBar(), {
      usage: repo,
      settings: buildSettings(),
      now: () => fivePm,
    });

    // Nur der neue Block zaehlt — der 10:00-Block ist abgelaufen.
    expect(result.tokens).toBe(100);
    expect(result.windowStartAt).toBe(hourBucket(fourPm) * 3_600_000);
  });

  it('letzter Block abgelaufen + kein neuer Token → tokens=0, kein Window', () => {
    // Token um 10:00 (Block bis 15:00), jetzt 16:00 — Block abgelaufen.
    const tenAm = new Date(2026, 4, 14, 10, 0, 0, 0).getTime();
    const fourPm = new Date(2026, 4, 14, 16, 0, 0, 0).getTime();
    const repo = new UsageRepository(new InMemoryUsageDriver());
    repo.upsertBucket({ bucket_start: hourBucket(tenAm), model: 'claude-opus-4-7', tokens: 5000 });

    const result = resolveWindow(make5hSessionBar(), {
      usage: repo,
      settings: buildSettings(),
      now: () => fourPm,
    });

    expect(result.tokens).toBe(0);
    expect(result.windowStartAt).toBeNull();
    expect(result.windowEndAt).toBeNull();
  });

  it('Default-by-Convention: window_hours<=6 ohne aggregation_mode → session_block', () => {
    const bar: LimitBar = {
      id: '5h',
      label: '5h',
      window_hours: 5,
      filter: 'all',
      limit_method: 'fixed',
      fixed_limit: 1_000_000,
      // KEIN aggregation_mode gesetzt
    };
    const tenAm = new Date(2026, 4, 14, 10, 0, 0, 0).getTime();
    const onePm = new Date(2026, 4, 14, 13, 0, 0, 0).getTime();
    const repo = new UsageRepository(new InMemoryUsageDriver());
    repo.upsertBucket({ bucket_start: hourBucket(tenAm), model: 'claude-opus-4-7', tokens: 100 });

    const result = resolveWindow(bar, {
      usage: repo,
      settings: buildSettings(),
      now: () => onePm,
    });

    // Sollte session_block-Verhalten zeigen: windowStartAt gesetzt.
    expect(result.windowStartAt).not.toBeNull();
    expect(result.windowEndAt).not.toBeNull();
  });

  it('lange Window (168 h) ohne aggregation_mode bleibt rolling, kein windowStartAt', () => {
    const bar: LimitBar = {
      id: 'weekly',
      label: 'Wöchentlich',
      window_hours: 168,
      filter: 'all',
      limit_method: 'fixed',
      fixed_limit: 1_000_000,
    };
    const now = new Date(2026, 4, 14, 12, 0, 0, 0).getTime();
    const result = resolveWindow(bar, {
      usage: new UsageRepository(new InMemoryUsageDriver()),
      settings: buildSettings(),
      now: () => now,
    });

    expect(result.windowStartAt).toBeNull();
    expect(result.windowEndAt).toBeNull();
  });
});
