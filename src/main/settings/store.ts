import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '@shared/types';
import { AppSettingsSchema } from '@shared/schemas';
import { buildDefaultSettings } from './defaults';

// Settings-Store: liest und schreibt settings.json atomar.
// Schreiben geht über eine .tmp-Datei + rename — verhindert halb geschriebene Dateien
// bei Crash oder Stromausfall.
// Validierung beim Lesen mit zod, damit korrupte Dateien früh und mit klarer Meldung scheitern.
export class SettingsStore {
  constructor(private readonly filePath: string) {}

  static initialize(filePath: string): SettingsStore {
    const store = new SettingsStore(filePath);
    if (!fs.existsSync(filePath)) {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      store.writeRaw(buildDefaultSettings());
    }
    return store;
  }

  read(): AppSettings {
    const raw = fs.readFileSync(this.filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    // Mit Defaults mergen, bevor wir validieren: ältere Versionen der settings.json
    // (z.B. Sprint 1, ohne claude_binary_path) bekommen so neu hinzugekommene Felder
    // automatisch befüllt, anstatt am Vollschema zu scheitern.
    const merged = { ...buildDefaultSettings(), ...parsed };
    return AppSettingsSchema.parse(merged);
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
