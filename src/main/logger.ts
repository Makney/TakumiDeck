import log from 'electron-log/main';
import path from 'node:path';
import fs from 'node:fs';

// Globaler Logger für den Main-Prozess.
// Schreibt in <userData>/logs/main.log, parallel auf stdout im Dev-Mode.
log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'debug';
log.transports.file.maxSize = 5 * 1024 * 1024;

// Rotation: behält bis zu 3 Archive-Files (main.old.1.log, main.old.2.log,
// main.old.3.log). electron-log-Default rotiert nur EIN Archive — bei Bug-Reports
// nach mehreren Tagen Uptime verlieren wir sonst den älteren Kontext. Älteste
// Archive werden bei jedem Rotations-Schritt verworfen.
const MAX_ARCHIVES = 3;
log.transports.file.archiveLog = (oldLogFile) => {
  const oldPath = oldLogFile.toString();
  const dir = path.dirname(oldPath);
  const ext = path.extname(oldPath);
  const base = path.basename(oldPath, ext);
  // Bestehende main.old.<N>.log eine Position nach hinten schieben, älteste droppen.
  for (let i = MAX_ARCHIVES - 1; i >= 1; i--) {
    const from = path.join(dir, `${base}.old.${i}${ext}`);
    const to = path.join(dir, `${base}.old.${i + 1}${ext}`);
    if (fs.existsSync(from)) {
      try {
        if (fs.existsSync(to)) fs.unlinkSync(to);
        fs.renameSync(from, to);
      } catch {
        // Wenn Rotation hier scheitert (locked file, Antimalware), wollen wir den
        // Log-Loop nicht crashen — electron-log fängt Throws im archiveLog selber
        // ab, aber bewusst silent halten.
      }
    }
  }
  // Aktuelles File → main.old.1.log
  const archiveTarget = path.join(dir, `${base}.old.1${ext}`);
  try {
    if (fs.existsSync(archiveTarget)) fs.unlinkSync(archiveTarget);
    fs.renameSync(oldPath, archiveTarget);
  } catch {
    // siehe oben — silent fail, electron-log startet die neue Datei trotzdem.
  }
};

export interface Logger {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  debug(...args: unknown[]): void;
}

export const logger: Logger = log;
