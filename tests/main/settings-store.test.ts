import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SettingsStore } from '../../src/main/settings/store';
import { buildDefaultSettings } from '../../src/main/settings/defaults';

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
});
