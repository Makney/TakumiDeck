import { app } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

// Pfad-Setup für Dev vs. Production.
// Dev: AppData-Ordner mit -dev-Suffix, damit echte Daten nicht überschrieben werden.
// Muss vor app.whenReady() ausgeführt werden, bevor irgendein anderes Modul userData liest.
let configured = false;

export function configurePaths(): void {
  if (configured) return;
  configured = true;

  if (!app.isPackaged) {
    const devDataDir = path.join(app.getPath('appData'), 'TakumiDeck-dev');
    app.setPath('userData', devDataDir);
  }
  // Production: Forge-Packager setzt productName='TakumiDeck', userData zeigt auf
  // %APPDATA%\TakumiDeck — kein Override nötig.

  ensureDir(app.getPath('userData'));
  ensureDir(path.join(app.getPath('userData'), 'logs'));
  ensureDir(path.join(app.getPath('userData'), 'templates'));
  ensureDir(path.join(app.getPath('userData'), 'cache'));
}

export function getDataDir(): string {
  return app.getPath('userData');
}

export function getSettingsPath(): string {
  return path.join(getDataDir(), 'settings.json');
}

export function getDatabasePath(): string {
  return path.join(getDataDir(), 'data.sqlite');
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
