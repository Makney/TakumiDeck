import { describe, it, expect } from 'vitest';
import {
  AppSettingsSchema,
  AppSettingsPatchSchema,
  ProjectRemoveInputSchema,
  PtyCreateInputSchema,
  SessionHistoryInputSchema,
  SessionTypeSchema,
  StatsHeatmapInputSchema,
  StatsHeatmapWeeksSchema,
  StatsOverviewInputSchema,
  StatsRangeSchema,
} from '@shared/schemas';
import { buildDefaultSettings } from '../../src/main/settings/defaults';

describe('AppSettings-Schema', () => {
  it('akzeptiert die Default-Settings', () => {
    const defaults = buildDefaultSettings();
    expect(() => AppSettingsSchema.parse(defaults)).not.toThrow();
  });

  it('lehnt ungültiges theme ab', () => {
    const defaults = buildDefaultSettings();
    const broken = { ...defaults, theme: 'sepia' };
    expect(() => AppSettingsSchema.parse(broken)).toThrow();
  });

  it('lehnt negative font-size ab', () => {
    const defaults = buildDefaultSettings();
    const broken = { ...defaults, terminal_font_size: -1 };
    expect(() => AppSettingsSchema.parse(broken)).toThrow();
  });

  // Phase-2 Season-8: Soft-Warning-Feld an der Per-Session-Kontext-Bar.
  it('akzeptiert context_soft_warning mit gueltigen Werten', () => {
    const defaults = buildDefaultSettings();
    expect(defaults.context_soft_warning.enabled).toBe(true);
    expect(defaults.context_soft_warning.threshold_percent).toBe(20);
    const patched = {
      ...defaults,
      context_soft_warning: { enabled: false, threshold_percent: 50 },
    };
    expect(() => AppSettingsSchema.parse(patched)).not.toThrow();
  });

  it('lehnt Soft-Warning-Schwellwert ausserhalb von 0..100 ab', () => {
    const defaults = buildDefaultSettings();
    const tooHigh = {
      ...defaults,
      context_soft_warning: { enabled: true, threshold_percent: 150 },
    };
    expect(() => AppSettingsSchema.parse(tooHigh)).toThrow();
    const negative = {
      ...defaults,
      context_soft_warning: { enabled: true, threshold_percent: -5 },
    };
    expect(() => AppSettingsSchema.parse(negative)).toThrow();
  });
});

describe('AppSettingsPatch-Schema', () => {
  it('akzeptiert leeres Objekt', () => {
    expect(() => AppSettingsPatchSchema.parse({})).not.toThrow();
  });

  it('akzeptiert Teilfelder', () => {
    const patch = { theme: 'dark', terminal_font_size: 14 };
    expect(() => AppSettingsPatchSchema.parse(patch)).not.toThrow();
  });

  it('lehnt ungültige Teilfelder ab', () => {
    expect(() => AppSettingsPatchSchema.parse({ theme: 'rainbow' })).toThrow();
  });
});

// Phase-2 Season-5: SessionTypeSchema-Enum und PtyCreateInputSchema-Refinement
// fuer die neue 'custom'-Session-Art. Tests decken die Pflicht-Label-Validierung
// ab — der UI-Pfad verhindert das Submit zwar bereits, die IPC-Grenze muss aber
// unabhaengig validieren.
describe('SessionTypeSchema', () => {
  it('akzeptiert die vier festen Typen', () => {
    for (const t of ['feature', 'bug', 'review', 'docs-sync'] as const) {
      expect(() => SessionTypeSchema.parse(t)).not.toThrow();
    }
  });

  it("akzeptiert 'custom'", () => {
    expect(() => SessionTypeSchema.parse('custom')).not.toThrow();
  });

  it('lehnt unbekannte Typen ab', () => {
    expect(() => SessionTypeSchema.parse('refactor')).toThrow();
  });
});

describe('PtyCreateInputSchema', () => {
  const base = {
    sessionId: '11111111-1111-1111-1111-111111111111',
    projectId: 'p1',
    title: 'Title',
    model: 'claude-sonnet-4-6',
    cols: 80,
    rows: 24,
  } as const;

  it("akzeptiert type='feature' ohne customTypeLabel", () => {
    expect(() => PtyCreateInputSchema.parse({ ...base, type: 'feature' })).not.toThrow();
  });

  it("akzeptiert type='custom' mit customTypeLabel", () => {
    expect(() =>
      PtyCreateInputSchema.parse({ ...base, type: 'custom', customTypeLabel: 'Refactor' }),
    ).not.toThrow();
  });

  it("lehnt type='custom' ohne customTypeLabel ab", () => {
    expect(() => PtyCreateInputSchema.parse({ ...base, type: 'custom' })).toThrow();
  });

  it("lehnt type='custom' mit leerem customTypeLabel ab", () => {
    expect(() =>
      PtyCreateInputSchema.parse({ ...base, type: 'custom', customTypeLabel: '' }),
    ).toThrow();
  });

  it('lehnt zu langes customTypeLabel ab (>60 Zeichen)', () => {
    const tooLong = 'x'.repeat(61);
    expect(() =>
      PtyCreateInputSchema.parse({ ...base, type: 'custom', customTypeLabel: tooLong }),
    ).toThrow();
  });
});

// Phase-2 Season-10: SessionHistoryInputSchema.models — Modell-Filter im
// Verlauf-Panel. Schema bleibt locker auf String-Werten (keine Enum-Bindung an
// die fuenf UI-Modelle), weil alte Sessions mit umbenannten Modell-IDs noch
// filterbar bleiben muessen.
describe('SessionHistoryInputSchema.models', () => {
  it('akzeptiert ein Array von Modell-Strings', () => {
    const parsed = SessionHistoryInputSchema.parse({
      projectId: 'p1',
      models: ['claude-opus-4-7', 'claude-sonnet-4-6'],
    });
    expect(parsed.models).toEqual(['claude-opus-4-7', 'claude-sonnet-4-6']);
  });

  it('akzeptiert ein leeres models-Array', () => {
    const parsed = SessionHistoryInputSchema.parse({ projectId: 'p1', models: [] });
    expect(parsed.models).toEqual([]);
  });

  it('akzeptiert weggelassenes models-Feld (Phase-1-Backwards-Compat)', () => {
    const parsed = SessionHistoryInputSchema.parse({ projectId: 'p1' });
    expect(parsed.models).toBeUndefined();
  });

  it('lehnt non-Array fuer models ab', () => {
    expect(() =>
      SessionHistoryInputSchema.parse({ projectId: 'p1', models: 'claude-opus-4-7' }),
    ).toThrow();
  });

  it('lehnt leere Strings im models-Array ab (kein Phantom-Filter)', () => {
    expect(() =>
      SessionHistoryInputSchema.parse({ projectId: 'p1', models: [''] }),
    ).toThrow();
  });
});

// Phase-2 Season-12: StatsOverviewInputSchema. Scope per nullish-projectId,
// Range als Enum 'all'|'30d'|'7d', asOf optional fuer Tests.
describe('StatsOverviewInputSchema', () => {
  it('akzeptiert range mit projectId', () => {
    const parsed = StatsOverviewInputSchema.parse({ projectId: 'p1', range: 'all' });
    expect(parsed.projectId).toBe('p1');
    expect(parsed.range).toBe('all');
  });

  it("akzeptiert weggelassenes projectId (Global-Scope)", () => {
    const parsed = StatsOverviewInputSchema.parse({ range: '30d' });
    expect(parsed.projectId).toBeUndefined();
  });

  it('akzeptiert projectId=null (explizit global)', () => {
    const parsed = StatsOverviewInputSchema.parse({ projectId: null, range: '7d' });
    expect(parsed.projectId).toBeNull();
  });

  it('lehnt unbekanntes range ab', () => {
    expect(() => StatsOverviewInputSchema.parse({ range: '14d' })).toThrow();
  });

  it('lehnt leere projectId ab', () => {
    expect(() => StatsOverviewInputSchema.parse({ projectId: '', range: 'all' })).toThrow();
  });

  it('akzeptiert optionalen asOf-Stichzeitpunkt', () => {
    const parsed = StatsOverviewInputSchema.parse({
      projectId: 'p1',
      range: '7d',
      asOf: 1_700_000_000_000,
    });
    expect(parsed.asOf).toBe(1_700_000_000_000);
  });

  it('StatsRangeSchema enthaelt alle drei Werte', () => {
    expect(() => StatsRangeSchema.parse('all')).not.toThrow();
    expect(() => StatsRangeSchema.parse('30d')).not.toThrow();
    expect(() => StatsRangeSchema.parse('7d')).not.toThrow();
    expect(() => StatsRangeSchema.parse('1y')).toThrow();
  });
});

// Phase-2 Season-13: StatsHeatmapInputSchema. Wochen-Toggle ist auf genau zwei
// Werte begrenzt (30 oder 52), projectId nullish wie beim Overview-Channel,
// asOf optional fuer Tests.
describe('StatsHeatmapInputSchema', () => {
  it('akzeptiert weeks=30 mit projectId', () => {
    const parsed = StatsHeatmapInputSchema.parse({ projectId: 'p1', weeks: 30 });
    expect(parsed.projectId).toBe('p1');
    expect(parsed.weeks).toBe(30);
  });

  it('akzeptiert weeks=52', () => {
    const parsed = StatsHeatmapInputSchema.parse({ projectId: null, weeks: 52 });
    expect(parsed.weeks).toBe(52);
  });

  it('akzeptiert weggelassenes projectId (Global-Scope)', () => {
    const parsed = StatsHeatmapInputSchema.parse({ weeks: 30 });
    expect(parsed.projectId).toBeUndefined();
  });

  it('lehnt unbekannte Wochenzahl ab', () => {
    expect(() => StatsHeatmapInputSchema.parse({ weeks: 13 })).toThrow();
    expect(() => StatsHeatmapInputSchema.parse({ weeks: 100 })).toThrow();
  });

  it('lehnt leere projectId ab', () => {
    expect(() => StatsHeatmapInputSchema.parse({ projectId: '', weeks: 30 })).toThrow();
  });

  it('akzeptiert optionalen asOf-Stichzeitpunkt', () => {
    const parsed = StatsHeatmapInputSchema.parse({
      projectId: 'p1',
      weeks: 30,
      asOf: 1_700_000_000_000,
    });
    expect(parsed.asOf).toBe(1_700_000_000_000);
  });

  it('StatsHeatmapWeeksSchema akzeptiert exakt 30 und 52', () => {
    expect(() => StatsHeatmapWeeksSchema.parse(30)).not.toThrow();
    expect(() => StatsHeatmapWeeksSchema.parse(52)).not.toThrow();
    expect(() => StatsHeatmapWeeksSchema.parse(31)).toThrow();
    expect(() => StatsHeatmapWeeksSchema.parse('30')).toThrow();
  });
});

// Phase-2 Season-8: ProjectRemoveInputSchema. Default-Bucket-Immutability ist
// Server-Logik (siehe ProjectRepository.removeProject) — das Schema validiert
// nur Shape und projectId-Mindestlänge, analog zu den anderen Project-Channels.
describe('ProjectRemoveInputSchema', () => {
  it('akzeptiert eine projectId-string', () => {
    expect(() =>
      ProjectRemoveInputSchema.parse({ projectId: 'abc-123' }),
    ).not.toThrow();
  });

  it('lehnt leere projectId ab', () => {
    expect(() => ProjectRemoveInputSchema.parse({ projectId: '' })).toThrow();
  });

  it('lehnt fehlende projectId ab', () => {
    expect(() => ProjectRemoveInputSchema.parse({})).toThrow();
  });
});
