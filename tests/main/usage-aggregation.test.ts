import { describe, it, expect } from 'vitest';
import {
  UsageRepository,
  InMemoryUsageDriver,
  hourBucket,
  percentileP90,
} from '../../src/main/db/repos/usage';
import {
  MessageRepository,
  InMemoryMessageDriver,
} from '../../src/main/db/repos/messages';
import { resolveWindow, resolveContext } from '../../src/main/usage/resolver';
import { resolveBarFilter } from '../../src/main/usage/filters';
import type { AppSettings, LimitBar } from '@shared/types';

// Token-Aggregation-Tests (Sprint 5): InMemory-Repos + Fixed-Clock.

const FIXED_NOW = Date.parse('2026-05-10T12:00:00.000Z');
const NOW_BUCKET = hourBucket(FIXED_NOW);

function buildSettings(overrides: Partial<AppSettings> = {}): AppSettings {
  return {
    workspace_path: '/tmp/projects',
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
    ...overrides,
  };
}

const make5hBar = (): LimitBar => ({
  id: '5h',
  label: '5-Stunden-Limit',
  window_hours: 5,
  filter: 'all',
  limit_method: 'p90',
  // Sprint-5-Tests pruefen die rolling-Aggregation; die Phase-2-Season-Flacsh-
  // Default-Convention (window_hours<=6 → session_block) wuerde sonst das
  // Verhalten umkippen. Session-Block-Pfad wird separat in reset-schedule.test
  // gegen synthetische Buckets gepruft.
  aggregation_mode: 'rolling',
});

const makeWeeklyTopTierBar = (): LimitBar => ({
  id: 'weekly_design',
  label: 'Wöchentlich · Claude Design',
  window_hours: 168,
  filter: 'top_tier',
  limit_method: 'p90',
});

describe('hourBucket', () => {
  it('floor-t epoch-ms zur Stunde', () => {
    const ts = Date.parse('2026-05-10T12:34:56.789Z');
    const expected = Math.floor(ts / 3_600_000);
    expect(hourBucket(ts)).toBe(expected);
  });
});

describe('UsageRepository.sumTokens', () => {
  it('summiert Tokens innerhalb eines 5h-Fensters', () => {
    const repo = new UsageRepository(new InMemoryUsageDriver());
    repo.upsertBucket({ bucket_start: NOW_BUCKET - 4, model: 'claude-sonnet-4-6', tokens: 100 });
    repo.upsertBucket({ bucket_start: NOW_BUCKET - 2, model: 'claude-sonnet-4-6', tokens: 200 });
    repo.upsertBucket({ bucket_start: NOW_BUCKET - 6, model: 'claude-sonnet-4-6', tokens: 999 }); // außerhalb 5h
    const sum = repo.sumTokens({
      fromBucket: NOW_BUCKET - 4,
      toBucket: NOW_BUCKET,
      filter: 'all',
    });
    expect(sum).toBe(300);
  });

  it('filtert auf top_tier (Opus-Familie)', () => {
    const repo = new UsageRepository(new InMemoryUsageDriver());
    repo.upsertBucket({ bucket_start: NOW_BUCKET - 1, model: 'claude-opus-4-7', tokens: 100 });
    repo.upsertBucket({ bucket_start: NOW_BUCKET - 1, model: 'claude-sonnet-4-6', tokens: 500 });
    repo.upsertBucket({ bucket_start: NOW_BUCKET - 1, model: 'claude-haiku-4-5', tokens: 999 });
    const sum = repo.sumTokens({
      fromBucket: NOW_BUCKET - 5,
      toBucket: NOW_BUCKET,
      filter: 'top_tier',
    });
    expect(sum).toBe(100);
  });

  it('upsert addiert Tokens auf bestehende Buckets', () => {
    const driver = new InMemoryUsageDriver();
    const repo = new UsageRepository(driver);
    repo.upsertBucket({ bucket_start: NOW_BUCKET, model: 'claude-sonnet-4-6', tokens: 100 });
    repo.upsertBucket({ bucket_start: NOW_BUCKET, model: 'claude-sonnet-4-6', tokens: 50 });
    const snapshot = driver.snapshot();
    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]).toEqual({
      bucket: NOW_BUCKET,
      model: 'claude-sonnet-4-6',
      tokens: 150,
    });
  });

  it('ignoriert Tokens ≤ 0', () => {
    const driver = new InMemoryUsageDriver();
    const repo = new UsageRepository(driver);
    repo.upsertBucket({ bucket_start: NOW_BUCKET, model: 'claude-sonnet-4-6', tokens: 0 });
    repo.upsertBucket({ bucket_start: NOW_BUCKET, model: 'claude-sonnet-4-6', tokens: -50 });
    expect(driver.snapshot()).toHaveLength(0);
  });
});

describe('percentileP90', () => {
  it('liefert null für leere Liste', () => {
    expect(percentileP90([])).toBeNull();
  });

  it('berechnet das 90. Perzentil über 10 Werte', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // rank = 0.9 * (10-1) = 8.1; lerp zwischen sorted[8]=9 und sorted[9]=10 mit weight 0.1
    expect(percentileP90(values)).toBeCloseTo(9.1, 5);
  });

  it('liefert den einzigen Wert bei n=1', () => {
    expect(percentileP90([42])).toBe(42);
  });
});

describe('resolveBarFilter (Bar-Filter-Pattern)', () => {
  it('matched alle Modelle bei "all"', () => {
    const def = resolveBarFilter('all', undefined);
    expect(def.matches('claude-opus-4-7')).toBe(true);
    expect(def.matches('claude-sonnet-4-6')).toBe(true);
    expect(def.matches('claude-haiku-4-5')).toBe(true);
    expect(def.sqlLike).toBeNull();
  });

  it('matched Opus-IDs bei "top_tier"', () => {
    const def = resolveBarFilter('top_tier', undefined);
    expect(def.matches('claude-opus-4-7')).toBe(true);
    expect(def.matches('claude-opus-4-6')).toBe(true);
    expect(def.matches('claude-sonnet-4-6')).toBe(false);
    expect(def.matches('claude-haiku-4-5')).toBe(false);
  });

  it('matched Sonnet-IDs bei "sonnet"', () => {
    const def = resolveBarFilter('sonnet', undefined);
    expect(def.matches('claude-sonnet-4-6')).toBe(true);
    expect(def.matches('claude-sonnet-4-5')).toBe(true);
    expect(def.matches('claude-opus-4-7')).toBe(false);
  });

  it('matched Haiku-IDs bei "haiku"', () => {
    const def = resolveBarFilter('haiku', undefined);
    expect(def.matches('claude-haiku-4-5')).toBe(true);
    expect(def.matches('claude-opus-4-7')).toBe(false);
  });

  it('custom ohne Pattern matched nichts (sicherer Default)', () => {
    const def = resolveBarFilter('custom', undefined);
    expect(def.matches('claude-opus-4-7')).toBe(false);
  });

  it('custom mit Pattern matched exakt', () => {
    const def = resolveBarFilter('custom', 'claude-opus-4-7');
    expect(def.matches('claude-opus-4-7')).toBe(true);
    expect(def.matches('claude-opus-4-6')).toBe(false);
  });

  it('custom mit Wildcard-Pattern (%)', () => {
    const def = resolveBarFilter('custom', 'claude-opus-%');
    expect(def.matches('claude-opus-4-7')).toBe(true);
    expect(def.matches('claude-opus-4-6')).toBe(true);
    expect(def.matches('claude-sonnet-4-6')).toBe(false);
  });
});

describe('resolveWindow (5h-Bar mit Fixed-Clock)', () => {
  it('summiert Tokens und liefert P90-Limit, wenn genug Daten da sind', () => {
    const usageDriver = new InMemoryUsageDriver();
    const usageRepo = new UsageRepository(usageDriver);
    // 5h-Window (NOW_BUCKET-4 bis NOW_BUCKET): 100 + 200 = 300
    usageRepo.upsertBucket({ bucket_start: NOW_BUCKET - 4, model: 'claude-sonnet-4-6', tokens: 100 });
    usageRepo.upsertBucket({ bucket_start: NOW_BUCKET - 2, model: 'claude-sonnet-4-6', tokens: 200 });
    // P90-Window (192 h): noch 24 weitere Buckets befüllen, damit P90 nicht in Fallback fällt.
    for (let h = 5; h < 30; h++) {
      usageRepo.upsertBucket({
        bucket_start: NOW_BUCKET - h,
        model: 'claude-sonnet-4-6',
        tokens: 100,
      });
    }

    const result = resolveWindow(make5hBar(), {
      usage: usageRepo,
      settings: buildSettings(),
      now: () => FIXED_NOW,
    });

    expect(result.barId).toBe('5h');
    expect(result.tokens).toBe(300);
    expect(result.windowHours).toBe(5);
    expect(result.limitSource).toBe('p90');
    expect(result.limit).toBeGreaterThan(0);
    expect(result.percent).toBeGreaterThan(0);
  });

  it('fällt auf model_limits zurück, wenn P90-Window zu wenig Daten hat', () => {
    const usageRepo = new UsageRepository(new InMemoryUsageDriver());
    usageRepo.upsertBucket({ bucket_start: NOW_BUCKET, model: 'claude-sonnet-4-6', tokens: 1000 });

    const result = resolveWindow(make5hBar(), {
      usage: usageRepo,
      settings: buildSettings(),
      now: () => FIXED_NOW,
    });

    expect(result.limitSource).toBe('fallback');
    expect(result.limit).toBe(1_000_000); // model_limits['claude-sonnet-4-6']
  });

  it('weekly_design (top_tier) ignoriert Sonnet/Haiku-Tokens', () => {
    const usageRepo = new UsageRepository(new InMemoryUsageDriver());
    usageRepo.upsertBucket({ bucket_start: NOW_BUCKET - 1, model: 'claude-opus-4-7', tokens: 5000 });
    usageRepo.upsertBucket({ bucket_start: NOW_BUCKET - 1, model: 'claude-sonnet-4-6', tokens: 9999 });
    usageRepo.upsertBucket({ bucket_start: NOW_BUCKET - 1, model: 'claude-haiku-4-5', tokens: 9999 });

    const result = resolveWindow(makeWeeklyTopTierBar(), {
      usage: usageRepo,
      settings: buildSettings(),
      now: () => FIXED_NOW,
    });
    expect(result.tokens).toBe(5000);
  });

  it('respektiert fixed_limit bei limit_method=fixed', () => {
    const usageRepo = new UsageRepository(new InMemoryUsageDriver());
    usageRepo.upsertBucket({ bucket_start: NOW_BUCKET, model: 'claude-sonnet-4-6', tokens: 50_000 });
    const bar: LimitBar = {
      id: 'fixed-bar',
      label: 'Fixed',
      window_hours: 5,
      filter: 'all',
      limit_method: 'fixed',
      fixed_limit: 100_000,
    };
    const result = resolveWindow(bar, {
      usage: usageRepo,
      settings: buildSettings(),
      now: () => FIXED_NOW,
    });
    expect(result.limitSource).toBe('fixed');
    expect(result.limit).toBe(100_000);
    expect(result.percent).toBeCloseTo(50, 5);
  });
});

describe('resolveContext (Per-Session-Kontext-Bar)', () => {
  it('liefert die letzte usage-Zeile der Session und matched gegen Modell-Limit', () => {
    const messages = new MessageRepository(new InMemoryMessageDriver());
    messages.insert({
      session_id: 'sess-1',
      project_id: 'proj-1',
      role: 'assistant',
      content: '...',
      tokens_in: 50_000,
      tokens_out: 10_000,
      ts: FIXED_NOW - 1000,
    });
    messages.insert({
      session_id: 'sess-1',
      project_id: 'proj-1',
      role: 'assistant',
      content: '...',
      tokens_in: 75_000,
      tokens_out: 12_000,
      ts: FIXED_NOW,
    });

    const result = resolveContext('sess-1', {
      messages,
      settings: buildSettings(),
      sessionModel: 'claude-sonnet-4-6',
    });
    expect(result.tokens.total).toBe(75_000);
    expect(result.limit).toBe(1_000_000);
    expect(result.percent).toBeCloseTo(7.5, 5);
    expect(result.lastEventAt).toBe(FIXED_NOW);
  });

  it('liefert 0-Tokens für eine Session ohne Messages', () => {
    const messages = new MessageRepository(new InMemoryMessageDriver());
    const result = resolveContext('sess-empty', {
      messages,
      settings: buildSettings(),
      sessionModel: 'claude-sonnet-4-6',
    });
    expect(result.tokens.total).toBe(0);
    expect(result.lastEventAt).toBeNull();
  });

  it('fällt auf default_limit zurück, wenn Modell unbekannt', () => {
    const messages = new MessageRepository(new InMemoryMessageDriver());
    messages.insert({
      session_id: 'sess-2',
      project_id: 'proj-1',
      role: 'assistant',
      content: '...',
      tokens_in: 10_000,
      tokens_out: 0,
      ts: FIXED_NOW,
    });
    const result = resolveContext('sess-2', {
      messages,
      settings: buildSettings(),
      sessionModel: 'claude-experimental-x',
    });
    expect(result.limit).toBe(200_000); // default_limit
  });
});
