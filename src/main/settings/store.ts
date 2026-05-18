import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '@shared/types';
import { AppSettingsSchema } from '@shared/schemas';
import { buildDefaultSettings } from './defaults';
import {
  loadSettingsMigrations,
  readSchemaVersion,
  runSettingsMigrations,
  type SettingsMigration,
} from './migrations';

// Settings-Store: liest und schreibt settings.json atomar.
// Schreiben geht über eine .tmp-Datei + rename — verhindert halb geschriebene Dateien
// bei Crash oder Stromausfall.
// Validierung beim Lesen mit zod, damit korrupte Dateien früh und mit klarer Meldung scheitern.
//
// Phase-2 Season-25: Vor dem zod-Parse laeuft eine versionierte
// Migrations-Pipeline (`runSettingsMigrations`). Bestandsuser ohne
// `schema_version`-Feld werden implizit als Version 1 behandelt; nach dem
// Lauf wird das migrierte Objekt mit erhoehter Version auf die Disk
// zurueckgeschrieben (idempotent gegenueber wiederholten Reads).
export class SettingsStore {
  private readonly migrations: SettingsMigration[];

  constructor(
    private readonly filePath: string,
    migrations: SettingsMigration[] = loadSettingsMigrations(),
  ) {
    this.migrations = migrations;
  }

  static initialize(filePath: string): SettingsStore {
    const store = new SettingsStore(filePath);
    if (!fs.existsSync(filePath)) {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      // Phase-2 Season-18: First-Start-Workspace-Wizard. Bei wirklich frischer
      // Anlage wird `workspace_wizard_completed` explizit auf `false` gesetzt,
      // damit der Renderer den Welcome-Screen zeigt und der Boot-Scan ausbleibt.
      // Bestandsuser haben die Datei bereits und kommen ueber den Default-Merge
      // in `read()` auf `true` (siehe `buildDefaultSettings()`).
      store.writeRaw({ ...buildDefaultSettings(), workspace_wizard_completed: false });
    }
    return store;
  }

  read(): AppSettings {
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    // Pipeline laeuft auf dem raw geparsten JSON, damit die Migrations die
    // alten Default-Werte exakt sehen (vor dem Default-Merge, der z.B.
    // fehlende Felder mit dem neuen Default befuellen wuerde). Wenn neue
    // Migrations gelaufen sind, persistieren wir das migrierte Objekt
    // direkt auf die Disk — beim naechsten Read springt die Pipeline dann
    // sofort an `if (id <= currentVersion) continue` vorbei.
    const versionBefore = readSchemaVersion(parsed);
    const { migrated, ranIds, finalVersion } = runSettingsMigrations(parsed, this.migrations);

    // Mit Defaults mergen, bevor wir validieren: ältere Versionen der settings.json
    // (z.B. Sprint 1, ohne claude_binary_path) bekommen so neu hinzugekommene Felder
    // automatisch befüllt, anstatt am Vollschema zu scheitern.
    const merged = { ...buildDefaultSettings(), ...migrated };
    const validated = AppSettingsSchema.parse(merged);

    // Persist nur dann, wenn die Pipeline tatsaechlich etwas geaendert hat —
    // sonst belastet der Boot jeden Start mit einem rename-Roundtrip. Wir
    // schreiben das migrierte+default-gemergte+validierte Objekt zurueck,
    // damit fehlende Felder kuenftiger Schema-Versionen direkt persistiert
    // sind (Default-Merge alleine hatte das bisher nur in-memory geleistet).
    if (ranIds.length > 0 || finalVersion !== versionBefore) {
      this.writeRaw(validated);
    }

    return validated;
  }

  write(settings: AppSettings): void {
    // Erst gegen das Vollschema validieren, damit keine inkonsistenten Settings landen.
    const validated = AppSettingsSchema.parse(settings);
    this.writeRaw(validated);
  }

  patch(patch: Partial<AppSettings>): AppSettings {
    const current = this.read();
    const merged: AppSettings = { ...current, ...patch };
    this.write(merged);
    return merged;
  }

  private writeRaw(settings: AppSettings): void {
    const tmpPath = `${this.filePath}.tmp`;
    const data = `${JSON.stringify(settings, null, 2)}\n`;
    fs.writeFileSync(tmpPath, data, 'utf-8');
    fs.renameSync(tmpPath, this.filePath);
  }
}
