import { describe, it, expect } from 'vitest';
import {
  CURRENT_SETTINGS_SCHEMA_VERSION,
  LEGACY_SETTINGS_SCHEMA_VERSION,
  MIGRATION_ADD_CUSTOM_MODELS,
  MIGRATION_ADD_OPENCODE,
  MIGRATION_DEFAULTS_V0_2_X_DRIFT,
  migrateDefaultsV02xDrift,
  readSchemaVersion,
  runSettingsMigrations,
  type SettingsMigration,
} from '../../src/main/settings/migrations';

// Phase-2 Season-25: Pipeline-Runner + Migration 2 (defaults_v0_2_x_drift).
// Test-Aufbau analog zu tests/main/migrations.test.ts (SQLite-Runner), aber
// die Migrations sind reine TypeScript-Funktionen statt SQL-Texten.

describe('readSchemaVersion', () => {
  it('liest positives ganzzahliges schema_version-Feld', () => {
    expect(readSchemaVersion({ schema_version: 2 })).toBe(2);
    expect(readSchemaVersion({ schema_version: 17 })).toBe(17);
  });

  it('faellt auf LEGACY-Version zurueck wenn das Feld fehlt', () => {
    expect(readSchemaVersion({})).toBe(LEGACY_SETTINGS_SCHEMA_VERSION);
  });

  it('faellt auf LEGACY-Version zurueck bei kaputtem Wert', () => {
    expect(readSchemaVersion({ schema_version: 0 })).toBe(LEGACY_SETTINGS_SCHEMA_VERSION);
    expect(readSchemaVersion({ schema_version: -1 })).toBe(LEGACY_SETTINGS_SCHEMA_VERSION);
    expect(readSchemaVersion({ schema_version: 1.5 })).toBe(LEGACY_SETTINGS_SCHEMA_VERSION);
    expect(readSchemaVersion({ schema_version: 'two' })).toBe(LEGACY_SETTINGS_SCHEMA_VERSION);
  });
});

describe('runSettingsMigrations', () => {
  const passthrough: SettingsMigration[] = [
    {
      id: 2,
      name: 'm2',
      up: (input) => ({ ...input, m2_marker: true }),
    },
    {
      id: 3,
      name: 'm3',
      up: (input) => ({ ...input, m3_marker: true }),
    },
  ];

  it('fuehrt nicht-angewandte Migrations in id-Reihenfolge aus', () => {
    const result = runSettingsMigrations({ schema_version: 1 }, passthrough);
    expect(result.ranIds).toEqual([2, 3]);
    expect(result.finalVersion).toBe(3);
    expect(result.migrated['m2_marker']).toBe(true);
    expect(result.migrated['m3_marker']).toBe(true);
    expect(result.migrated['schema_version']).toBe(3);
  });

  it('ueberspringt bereits angewandte Migrations', () => {
    const result = runSettingsMigrations({ schema_version: 2 }, passthrough);
    expect(result.ranIds).toEqual([3]);
    expect(result.finalVersion).toBe(3);
    expect(result.migrated['m2_marker']).toBeUndefined();
    expect(result.migrated['m3_marker']).toBe(true);
  });

  it('laesst Objekt unveraendert wenn nichts anzuwenden ist', () => {
    const input = { schema_version: 3, foo: 'bar' };
    const result = runSettingsMigrations(input, passthrough);
    expect(result.ranIds).toEqual([]);
    expect(result.finalVersion).toBe(3);
    expect(result.migrated).toBe(input);
  });

  it('sortiert unsortierte Eingabe', () => {
    const unsorted: SettingsMigration[] = [
      { id: 3, name: 'm3', up: (i) => ({ ...i, order: [...((i['order'] as number[]) ?? []), 3] }) },
      { id: 2, name: 'm2', up: (i) => ({ ...i, order: [...((i['order'] as number[]) ?? []), 2] }) },
    ];
    const result = runSettingsMigrations({ schema_version: 1 }, unsorted);
    expect(result.migrated['order']).toEqual([2, 3]);
  });

  it('behandelt fehlendes schema_version-Feld als LEGACY (Version 1)', () => {
    // Bestandsuser ohne `schema_version`-Feld sollen die erste Migration treffen.
    const result = runSettingsMigrations({}, passthrough);
    expect(result.ranIds).toEqual([2, 3]);
    expect(result.finalVersion).toBe(3);
  });
});

describe('migrateDefaultsV02xDrift (Migration 2)', () => {
  describe('limit_bars: Claude-Design-Bar entfernen', () => {
    it('entfernt die Pre-Sprint-9-Default-Bar mit exakter Form', () => {
      const result = migrateDefaultsV02xDrift({
        limit_bars: [
          {
            id: '5h',
            label: '5-Stunden-Limit',
            window_hours: 5,
            filter: 'all',
            limit_method: 'p90',
          },
          {
            id: 'weekly_design',
            label: 'Wöchentlich · Claude Design',
            window_hours: 168,
            filter: 'top_tier',
            limit_method: 'p90',
          },
        ],
      });
      const bars = result['limit_bars'] as Array<Record<string, unknown>>;
      expect(bars).toHaveLength(1);
      expect(bars[0]?.['id']).toBe('5h');
    });

    it('laesst eine umkonfigurierte Bar mit gleicher id stehen', () => {
      // User hat den Filter manuell auf 'sonnet' geaendert — Migration darf
      // nicht zuschlagen (Variante-B-Defensivitaet).
      const customized = {
        id: 'weekly_design',
        label: 'Wöchentlich · Claude Design',
        window_hours: 168,
        filter: 'sonnet',
        limit_method: 'p90',
      };
      const result = migrateDefaultsV02xDrift({ limit_bars: [customized] });
      expect(result['limit_bars']).toEqual([customized]);
    });

    it('laesst eine Bar mit angepasstem Label stehen', () => {
      const renamed = {
        id: 'weekly_design',
        label: 'Mein Design-Limit',
        window_hours: 168,
        filter: 'top_tier',
        limit_method: 'p90',
      };
      const result = migrateDefaultsV02xDrift({ limit_bars: [renamed] });
      expect(result['limit_bars']).toEqual([renamed]);
    });
  });

  describe('limit_bars: Sonnet-Label anheben', () => {
    it('aendert „Nur Sonnet" auf „Wöchentlich · Nur Sonnet"', () => {
      const result = migrateDefaultsV02xDrift({
        limit_bars: [
          {
            id: 'weekly_sonnet',
            label: 'Nur Sonnet',
            window_hours: 168,
            filter: 'sonnet',
            limit_method: 'p90',
          },
        ],
      });
      const bars = result['limit_bars'] as Array<Record<string, unknown>>;
      expect(bars[0]?.['label']).toBe('Wöchentlich · Nur Sonnet');
    });

    it('laesst ein bereits umetikettiertes Label in Ruhe', () => {
      // User hat eigenes Label — Migration darf nicht ueberschreiben.
      const customLabel = {
        id: 'weekly_sonnet',
        label: 'Mein Sonnet-Tracker',
        window_hours: 168,
        filter: 'sonnet',
        limit_method: 'p90',
      };
      const result = migrateDefaultsV02xDrift({ limit_bars: [customLabel] });
      expect(result['limit_bars']).toEqual([customLabel]);
    });

    it('laesst eine bereits aktuelle Label-Variante in Ruhe', () => {
      // Eintraege, die schon den neuen Default-Text tragen, werden nicht angefasst
      // (Idempotenz: doppelter Pipeline-Lauf ergibt das gleiche Ergebnis).
      const alreadyNew = {
        id: 'weekly_sonnet',
        label: 'Wöchentlich · Nur Sonnet',
        window_hours: 168,
        filter: 'sonnet',
        limit_method: 'p90',
      };
      const result = migrateDefaultsV02xDrift({ limit_bars: [alreadyNew] });
      expect(result['limit_bars']).toEqual([alreadyNew]);
    });
  });

  describe('default_limit: 1M → 200k', () => {
    it('setzt exakten Wert 1_000_000 auf 200_000', () => {
      const result = migrateDefaultsV02xDrift({ default_limit: 1_000_000 });
      expect(result['default_limit']).toBe(200_000);
    });

    it('laesst angepassten Wert (z.B. 500_000) in Ruhe', () => {
      const result = migrateDefaultsV02xDrift({ default_limit: 500_000 });
      expect(result['default_limit']).toBe(500_000);
    });

    it('laesst neuen Default 200_000 in Ruhe (Idempotenz)', () => {
      const result = migrateDefaultsV02xDrift({ default_limit: 200_000 });
      expect(result['default_limit']).toBe(200_000);
    });
  });

  describe('model_limits: pro Modell 1M → 200k', () => {
    it('senkt jeden Eintrag mit Wert 1_000_000 auf 200_000', () => {
      const result = migrateDefaultsV02xDrift({
        model_limits: {
          'claude-opus-4-7': 1_000_000,
          'claude-sonnet-4-6': 1_000_000,
          'claude-haiku-4-5': 1_000_000,
        },
      });
      expect(result['model_limits']).toEqual({
        'claude-opus-4-7': 200_000,
        'claude-sonnet-4-6': 200_000,
        'claude-haiku-4-5': 200_000,
      });
    });

    it('laesst gemischte Werte selektiv in Ruhe', () => {
      // User hat einen Custom-Wert (500k) — der bleibt; 1M wird gesenkt; 200k
      // bleibt unveraendert.
      const result = migrateDefaultsV02xDrift({
        model_limits: {
          'claude-opus-4-7': 1_000_000,
          'claude-sonnet-4-6': 500_000,
          'claude-haiku-4-5': 200_000,
        },
      });
      expect(result['model_limits']).toEqual({
        'claude-opus-4-7': 200_000,
        'claude-sonnet-4-6': 500_000,
        'claude-haiku-4-5': 200_000,
      });
    });

    it('laesst fehlendes model_limits-Feld in Ruhe', () => {
      const result = migrateDefaultsV02xDrift({});
      expect(result['model_limits']).toBeUndefined();
    });
  });

  it('ist idempotent: doppelter Lauf ergibt das gleiche Ergebnis', () => {
    const legacyInput: Record<string, unknown> = {
      limit_bars: [
        {
          id: 'weekly_design',
          label: 'Wöchentlich · Claude Design',
          window_hours: 168,
          filter: 'top_tier',
          limit_method: 'p90',
        },
        {
          id: 'weekly_sonnet',
          label: 'Nur Sonnet',
          window_hours: 168,
          filter: 'sonnet',
          limit_method: 'p90',
        },
      ],
      default_limit: 1_000_000,
      model_limits: { 'claude-opus-4-7': 1_000_000 },
    };
    const once = migrateDefaultsV02xDrift(legacyInput);
    const twice = migrateDefaultsV02xDrift(once);
    expect(twice).toEqual(once);
  });

  it('Migration-Eintrag traegt id=2 und ruft die Pure-Funktion auf', () => {
    expect(MIGRATION_DEFAULTS_V0_2_X_DRIFT.id).toBe(2);
    expect(MIGRATION_DEFAULTS_V0_2_X_DRIFT.name).toBe('defaults_v0_2_x_drift');
    const result = MIGRATION_DEFAULTS_V0_2_X_DRIFT.up({ default_limit: 1_000_000 });
    expect(result['default_limit']).toBe(200_000);
  });
});

describe('MIGRATION_ADD_CUSTOM_MODELS (Migration 3)', () => {
  it('id und name sind gesetzt', () => {
    expect(MIGRATION_ADD_CUSTOM_MODELS.id).toBe(3);
    expect(MIGRATION_ADD_CUSTOM_MODELS.name).toBe('add_custom_models_field');
  });

  it('setzt custom_models auf leeres Array bei Bestandsuser ohne Feld', () => {
    const result = MIGRATION_ADD_CUSTOM_MODELS.up({ schema_version: 2 });
    expect(result['custom_models']).toEqual([]);
  });

  it('laesst vorhandenes custom_models in Ruhe (Idempotenz)', () => {
    const existing = [{ id: 'claude-future', label: 'Future' }];
    const result = MIGRATION_ADD_CUSTOM_MODELS.up({
      schema_version: 2,
      custom_models: existing,
    });
    expect(result['custom_models']).toBe(existing);
  });
});

describe('MIGRATION_ADD_OPENCODE (Migration 4)', () => {
  it('id und name sind gesetzt', () => {
    expect(MIGRATION_ADD_OPENCODE.id).toBe(4);
    expect(MIGRATION_ADD_OPENCODE.name).toBe('add_opencode_fields');
  });

  it('setzt beide opencode-Felder auf Default bei Bestandsuser ohne Felder', () => {
    const result = MIGRATION_ADD_OPENCODE.up({ schema_version: 3 });
    expect(result['opencode_enabled']).toBe(false);
    expect(result['opencode_binary_path']).toBe('opencode');
  });

  it('laesst bereits gesetzte Werte in Ruhe (defensiv pro Feld)', () => {
    const result = MIGRATION_ADD_OPENCODE.up({
      schema_version: 3,
      opencode_enabled: true,
      opencode_binary_path: 'C:/tools/opencode.cmd',
    });
    expect(result['opencode_enabled']).toBe(true);
    expect(result['opencode_binary_path']).toBe('C:/tools/opencode.cmd');
  });

  it('fuellt nur das fehlende Feld auf, wenn eines schon da ist', () => {
    const result = MIGRATION_ADD_OPENCODE.up({
      schema_version: 3,
      opencode_enabled: true,
    });
    expect(result['opencode_enabled']).toBe(true);
    expect(result['opencode_binary_path']).toBe('opencode');
  });
});

describe('CURRENT_SETTINGS_SCHEMA_VERSION', () => {
  it('passt zur hoechsten ausgelieferten Migration-id', () => {
    // Guard fuer kuenftige Migrations: wer eine id=5-Migration hinzufuegt, muss
    // CURRENT_SETTINGS_SCHEMA_VERSION mit anheben.
    expect(CURRENT_SETTINGS_SCHEMA_VERSION).toBe(4);
  });
});
