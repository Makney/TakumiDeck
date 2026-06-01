import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SettingsStore } from '../../src/main/settings/store';
import { buildDefaultSettings } from '../../src/main/settings/defaults';
import { CURRENT_SETTINGS_SCHEMA_VERSION } from '../../src/main/settings/migrations';

describe('SettingsStore', () => {
  let tmpDir: string;
  let filePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'takumi-settings-'));
    filePath = path.join(tmpDir, 'settings.json');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('initialize() schreibt Defaults wenn Datei fehlt', () => {
    const store = SettingsStore.initialize(filePath);
    expect(fs.existsSync(filePath)).toBe(true);
    const read = store.read();
    // Phase-2 Season-18: bei wirklich frischer Anlage wird das Wizard-Flag
    // explizit auf `false` ueberschrieben — sonst wuerde der Default aus
    // `buildDefaultSettings()` (`true`) den Welcome-Screen nie triggern.
    expect(read).toEqual({ ...buildDefaultSettings(), workspace_wizard_completed: false });
  });

  // Phase-2 Season-18: Bestandsuser-Migration. Eine existierende settings.json
  // ohne das Feld wird durch den Default-Merge in `read()` automatisch auf
  // `true` gehoben — der Wizard popt bei Updates nicht erneut auf.
  it('read() merged workspace_wizard_completed=true fuer Bestandsuser ohne Feld', () => {
    SettingsStore.initialize(filePath);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    delete raw.workspace_wizard_completed;
    fs.writeFileSync(filePath, JSON.stringify(raw), 'utf-8');
    const store = new SettingsStore(filePath);
    expect(store.read().workspace_wizard_completed).toBe(true);
  });

  // Phase-2 Season-24: dieselbe Default-Merge-Mechanik trägt Bestandsuser ohne
  // markdown_editor_layout-Feld auf den Default 'split' (Side-by-Side ist der
  // neue Daily-Driver). Verhindert, dass das Schema-Parse bei alten
  // settings.json mit fehlendem Feld kippt.
  it('read() merged markdown_editor_layout=split fuer Bestandsuser ohne Feld', () => {
    SettingsStore.initialize(filePath);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    delete raw.markdown_editor_layout;
    fs.writeFileSync(filePath, JSON.stringify(raw), 'utf-8');
    const store = new SettingsStore(filePath);
    expect(store.read().markdown_editor_layout).toBe('split');
  });

  // #3 Scoped Deep-Merge: ein partielles fixes Sub-Objekt (z.B. eine vor einem
  // neuen Inner-Feld angelegte settings.json) wuerde unter Shallow-Merge das
  // Default ersetzen und beim Vollschema-Parse crashen. Der Deep-Merge fuellt
  // fehlende Inner-Keys aus den Defaults, User-Werte gewinnen pro Feld.
  it('read() fuellt fehlende Inner-Keys fixer Sub-Objekte aus den Defaults', () => {
    SettingsStore.initialize(filePath);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    raw.token_warning_thresholds = { yellow: 80, orange: 90 }; // `red` fehlt
    fs.writeFileSync(filePath, JSON.stringify(raw), 'utf-8');
    const store = new SettingsStore(filePath);
    const settings = store.read();
    const defaults = buildDefaultSettings();
    expect(settings.token_warning_thresholds.yellow).toBe(80);
    expect(settings.token_warning_thresholds.orange).toBe(90);
    expect(settings.token_warning_thresholds.red).toBe(
      defaults.token_warning_thresholds.red,
    );
  });

  // #3 Gegenprobe: die offenen Maps (model_limits, shortcuts) bleiben bewusst
  // Shallow — die User-Map gewinnt komplett, geprunte Built-in-Eintraege duerfen
  // NICHT aus den Defaults zurueckkommen.
  it('read() laesst offene Maps (model_limits) Shallow — User-Map gewinnt komplett', () => {
    SettingsStore.initialize(filePath);
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    raw.model_limits = { 'claude-sonnet-4-6': 123456 };
    fs.writeFileSync(filePath, JSON.stringify(raw), 'utf-8');
    const store = new SettingsStore(filePath);
    expect(store.read().model_limits).toEqual({ 'claude-sonnet-4-6': 123456 });
  });

  it('initialize() lässt vorhandene Datei unangetastet', () => {
    const store1 = SettingsStore.initialize(filePath);
    const before = store1.patch({ terminal_font_size: 17 });
    const store2 = SettingsStore.initialize(filePath);
    expect(store2.read()).toEqual(before);
  });

  it('patch() merged und persistiert', () => {
    const store = SettingsStore.initialize(filePath);
    const merged = store.patch({ theme: 'dark', terminal_font_size: 16 });
    expect(merged.terminal_font_size).toBe(16);
    const reread = new SettingsStore(filePath).read();
    expect(reread.terminal_font_size).toBe(16);
  });

  it('write() lehnt invalides Settings-Objekt ab', () => {
    const store = SettingsStore.initialize(filePath);
    const invalid = { ...buildDefaultSettings(), theme: 'rainbow' as never };
    expect(() => store.write(invalid)).toThrow();
  });

  it('atomare Schreibvorgänge hinterlassen kein .tmp', () => {
    const store = SettingsStore.initialize(filePath);
    store.patch({ terminal_font_size: 18 });
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
  });

  // Phase-2 Season-25: Settings-Schema-Versionierung. Bestandsuser-Datei ohne
  // `schema_version`-Feld (vor Season 25 angelegt) wird durch die Pipeline auf
  // den aktuellen Stand gezogen und mit erhoehter Version + bereinigten
  // Default-Drifts persistiert.
  it('read() migriert Bestandsuser ohne schema_version + persistiert das Ergebnis', () => {
    SettingsStore.initialize(filePath);
    // Pre-Season-25-Stand simulieren: kein schema_version-Feld, die alte
    // Claude-Design-Bar, das alte 1M-default_limit.
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    delete raw.schema_version;
    raw.limit_bars = [
      { id: '5h', label: '5-Stunden-Limit', window_hours: 5, filter: 'all', limit_method: 'p90' },
      {
        id: 'weekly_design',
        label: 'Wöchentlich · Claude Design',
        window_hours: 168,
        filter: 'top_tier',
        limit_method: 'p90',
      },
    ];
    raw.default_limit = 1_000_000;
    fs.writeFileSync(filePath, JSON.stringify(raw), 'utf-8');

    const store = new SettingsStore(filePath);
    const settings = store.read();

    expect(settings.schema_version).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(settings.default_limit).toBe(200_000);
    expect(settings.limit_bars.find((b) => b.id === 'weekly_design')).toBeUndefined();

    // Persist-Check: die Pipeline hat das migrierte Objekt zurueck auf die
    // Disk geschrieben — beim naechsten Read springt der Runner sofort an
    // `if (id <= currentVersion) continue` vorbei.
    const persisted = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(persisted.schema_version).toBe(CURRENT_SETTINGS_SCHEMA_VERSION);
    expect(persisted.default_limit).toBe(200_000);
    expect(persisted.limit_bars.find((b: { id: string }) => b.id === 'weekly_design')).toBeUndefined();
  });

  // Idempotenz: ein zweiter Read auf einer bereits aktuellen Datei darf die
  // Datei NICHT neu schreiben (sonst belasten wir jeden App-Start mit einem
  // rename-Roundtrip).
  it('read() schreibt nicht neu, wenn schema_version bereits aktuell ist', () => {
    SettingsStore.initialize(filePath);
    const mtimeBefore = fs.statSync(filePath).mtimeMs;
    // Kleiner Mtime-Skew, damit der Vergleich sicher ist (Windows-Filetime
    // hat ~16ms-Granularitaet).
    const future = new Date(mtimeBefore + 500);
    fs.utimesSync(filePath, future, future);
    const sealedMtime = fs.statSync(filePath).mtimeMs;

    const store = new SettingsStore(filePath);
    store.read();

    const mtimeAfter = fs.statSync(filePath).mtimeMs;
    expect(mtimeAfter).toBe(sealedMtime);
  });
});
