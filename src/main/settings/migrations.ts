// Settings-Migrations-Pipeline (Phase-2 Season-25).
//
// Analog zum SQLite-Migrations-Runner (`src/main/db/migrations.ts`), aber
// fuer das settings.json-Dokument. Pipeline-Aufruf passiert in
// `SettingsStore.read()` zwischen JSON-Parse und zod-Validierung. Bestandsuser
// ohne `schema_version`-Feld werden implizit als Version 1 behandelt.
//
// Konvention beim Schreiben neuer Migrations (Variante B aus der Season-
// Diskussion): defensiv pro Feld. Nicht ueberschreiben, wenn der User den
// Wert bereits angepasst hat — nur den exakten alten Default-Wert ersetzen.
// Strukturelle Migrations (Feldnamen-Umbenennung, Schachtelung) sind durch
// die strikte Versionierung sauber abbildbar.

// Aktueller Settings-Schema-Stand. Hier hochziehen, sobald eine neue
// Migration angelegt wird; `buildDefaultSettings()` schreibt den Wert dann
// in frisch angelegte settings.json-Dateien.
export const CURRENT_SETTINGS_SCHEMA_VERSION = 2;

// Bestandsuser ohne `schema_version`-Feld werden als Version 1 gelesen
// (der Phase-1-/Sprint-9-Stand, vor der ersten Drift-Migration).
export const LEGACY_SETTINGS_SCHEMA_VERSION = 1;

export interface SettingsMigration {
  id: number;
  name: string;
  // Pure-Funktion: bekommt das raw geparste JSON (vor Default-Merge und vor
  // zod-Validierung) und gibt das migrierte Objekt zurueck. Darf den Input
  // nicht mutieren — Convention.
  up(input: Record<string, unknown>): Record<string, unknown>;
}

export interface RunSettingsMigrationsResult {
  migrated: Record<string, unknown>;
  // Versionen, deren `up()` tatsaechlich gelaufen ist (id-Liste, sortiert).
  ranIds: number[];
  // Endversion nach Pipeline-Lauf (= max(currentVersion, max(migration.id))).
  finalVersion: number;
}

// Liest `schema_version` aus dem raw Objekt; fehlt das Feld oder ist der Wert
// nicht-positiv ganzzahlig, faellt auf LEGACY_SETTINGS_SCHEMA_VERSION zurueck.
export function readSchemaVersion(raw: Record<string, unknown>): number {
  const v = raw['schema_version'];
  if (typeof v === 'number' && Number.isInteger(v) && v > 0) return v;
  return LEGACY_SETTINGS_SCHEMA_VERSION;
}

// Pipeline-Runner. Wendet alle Migrations mit `id > currentVersion` der Reihe
// nach an und persistiert die neue Version im Objekt. Wenn `currentVersion`
// schon >= aller Migration-IDs ist, ist `ranIds` leer und `migrated === raw`.
export function runSettingsMigrations(
  raw: Record<string, unknown>,
  migrations: SettingsMigration[],
): RunSettingsMigrationsResult {
  const sorted = [...migrations].sort((a, b) => a.id - b.id);
  const currentVersion = readSchemaVersion(raw);
  let next: Record<string, unknown> = raw;
  const ranIds: number[] = [];
  let highest = currentVersion;
  for (const m of sorted) {
    if (m.id <= currentVersion) continue;
    next = m.up(next);
    ranIds.push(m.id);
    highest = m.id;
  }
  if (ranIds.length > 0) {
    next = { ...next, schema_version: highest };
  }
  return { migrated: next, ranIds, finalVersion: highest };
}

// --- Migrations -------------------------------------------------------

// Migration 2: defaults_v0_2_x_drift.
// Sammelt drei bekannte Default-Drifts ein, die seit Phase-1-Tail / Sprint 8 /
// Sprint 9 zwischen dem damaligen Default und dem aktuellen `buildDefaultSettings()`
// entstanden sind:
//
//  (1) `limit_bars`: „Wöchentlich · Claude Design"-Bar entfernen.
//      Pre-Sprint-9-Default war `{ id: 'weekly_design', label: 'Wöchentlich · Claude Design',
//      window_hours: 168, filter: 'top_tier', limit_method: 'p90' }`. Sprint 9 hat
//      den Eintrag aus der Default-Liste entfernt, weil das Design-Limit von der
//      Claude-Webapp befuellt wird, nicht von der lokalen JSONL-Aggregation.
//      Defensiv: nur entfernen, wenn ALLE Default-Keys exakt passen — Custom-Bars
//      mit gleicher id, aber abweichendem Filter o.ae. bleiben.
//
//  (2) `limit_bars`: „Nur Sonnet"-Label auf „Wöchentlich · Nur Sonnet" anheben.
//      Defensiv: nur, wenn der Label-Text dem exakten alten Default entspricht.
//
//  (3) `default_limit`: 1_000_000 → 200_000.
//      Sprint-8-Korrektur (200k ist Anthropics Standard-Kontextfenster, das alte
//      1M war Extended-Context-Beta und im Default falsch). Defensiv: nur, wenn
//      der Wert *exakt* 1_000_000 ist.
//
//  (4) `model_limits`: pro Modell-Key Wert 1_000_000 → 200_000. Gleicher Sprint-
//      8-Hintergrund wie (3), parallel zum `default_limit`-Drift. Defensiv: nur
//      Wert-exaktes 1_000_000 wird ersetzt, alle anderen User-Werte bleiben.
//
// Bewusst NICHT migriert: `sensitive_file_patterns`. Der Settings-Default war
// seit Sprint 8 stets das leere Array; die schuetzenden Patterns (`.env(.*)`,
// `secrets.*`, `*.key`, `*.pem`) leben hartcoded in
// `src/renderer/components/sensitiveFiles.ts` und sind additiv — kein Drift im
// persistierten Settings-Dokument.
export const MIGRATION_DEFAULTS_V0_2_X_DRIFT: SettingsMigration = {
  id: 2,
  name: 'defaults_v0_2_x_drift',
  up(input) {
    return migrateDefaultsV02xDrift(input);
  },
};

// Pure-Helper fuer die Migration, separat exportiert fuer Targeted-Tests.
export function migrateDefaultsV02xDrift(
  input: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...input };

  // (1) + (2) limit_bars
  const rawBars = out['limit_bars'];
  if (Array.isArray(rawBars)) {
    const filtered = rawBars.filter((bar) => !isPreSprint9ClaudeDesignBar(bar));
    const relabeled = filtered.map((bar) =>
      isPreSprint9SonnetBar(bar) ? { ...(bar as object), label: 'Wöchentlich · Nur Sonnet' } : bar,
    );
    out['limit_bars'] = relabeled;
  }

  // (3) default_limit
  if (out['default_limit'] === 1_000_000) {
    out['default_limit'] = 200_000;
  }

  // (4) model_limits (pro Key defensiv)
  const rawModelLimits = out['model_limits'];
  if (rawModelLimits && typeof rawModelLimits === 'object' && !Array.isArray(rawModelLimits)) {
    const cleaned: Record<string, unknown> = { ...(rawModelLimits as Record<string, unknown>) };
    for (const key of Object.keys(cleaned)) {
      if (cleaned[key] === 1_000_000) cleaned[key] = 200_000;
    }
    out['model_limits'] = cleaned;
  }

  return out;
}

// Defensive Drift-Detection: alle fuenf Felder muessen dem alten Default exakt
// entsprechen, sonst ist die Bar User-customized und bleibt.
function isPreSprint9ClaudeDesignBar(bar: unknown): boolean {
  if (!bar || typeof bar !== 'object') return false;
  const b = bar as Record<string, unknown>;
  return (
    b['id'] === 'weekly_design' &&
    b['label'] === 'Wöchentlich · Claude Design' &&
    b['window_hours'] === 168 &&
    b['filter'] === 'top_tier' &&
    b['limit_method'] === 'p90'
  );
}

// Defensive Drift-Detection: nur exakt der alte Default-Label-Text wird
// angehoben — User-eigene Labels („Sonnet only", „Sonnet-Woche") bleiben.
function isPreSprint9SonnetBar(bar: unknown): boolean {
  if (!bar || typeof bar !== 'object') return false;
  const b = bar as Record<string, unknown>;
  return b['id'] === 'weekly_sonnet' && b['label'] === 'Nur Sonnet';
}

// Default-Migration-Liste fuer den Produktiv-Pfad. Tests rufen den Runner
// direkt mit zugeschnittenen Migrations-Arrays auf.
export function loadSettingsMigrations(): SettingsMigration[] {
  return [MIGRATION_DEFAULTS_V0_2_X_DRIFT];
}
