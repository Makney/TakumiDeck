import { describe, it, expect } from 'vitest';
import { AppSettingsSchema, AppSettingsPatchSchema } from '@shared/schemas';
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
