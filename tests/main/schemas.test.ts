import { describe, it, expect } from 'vitest';
import {
  AppSettingsSchema,
  AppSettingsPatchSchema,
  ProjectRemoveInputSchema,
  PtyCreateInputSchema,
  SessionTypeSchema,
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
