// Phase-2 Season-17: Screenshot-Retention.
//
// Zweck: <userData>/screenshots/ wird beim App-Start einmalig aufgeraeumt.
// Zwei Schwellen:
//   1. Age-Cutoff: Files aelter als `maxAgeDays` Tage fliegen raus.
//   2. Size-Cap: nach dem Age-Cutoff wird die Gesamtgroesse gegen `maxTotalBytes`
//      geprueft; sobald sie ueberschritten ist, werden die aeltesten Files
//      zuerst geloescht, bis das Cap eingehalten ist.
//
// Die Pure-Logik (`computeRetentionPlan`) bekommt eine Liste {filePath, mtimeMs,
// size} + die aktuelle Zeit und liefert die Loesch-Liste. Sortier-Reihenfolge im
// Cap-Cut ist mtimeMs ASC (aelteste zuerst), bei Tie nach filePath ASC fuer
// Determinismus in Tests.
//
// Der Boot-Pass (`runScreenshotRetention`) verdrahtet die Pure-Logik mit dem FS:
// listDir → stat → computeRetentionPlan → unlink. Ein Fehlschlag pro File logt
// und ueberspringt, blockt aber nicht die restliche Liste — analog zum
// JsonlPathBackfill aus Season 15.
//
// FS-Driver-Interface analog zu BackfillFsDriver, damit Tests in-Memory laufen
// koennen.

import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { Logger } from '../logger';

// Ein Verzeichnis-Eintrag, wie ihn der FS-Driver liefert. Nur die drei Felder,
// die fuer die Retention-Entscheidung relevant sind — alles andere kostet
// readdir-Performance ohne Mehrwert.
export interface ScreenshotEntry {
  filePath: string;
  mtimeMs: number;
  size: number;
}

export interface RetentionPlan {
  // Files, die der Boot-Pass loeschen wird. Reihenfolge irrelevant fuer das
  // Ergebnis, deterministisch (mtimeMs ASC, filePath ASC) fuer Tests.
  toDelete: ScreenshotEntry[];
  // Files, die ueberleben. Nur fuer Diagnose-Logs und Tests.
  toKeep: ScreenshotEntry[];
  // Zaehler fuer das Boot-Log: wieviele wegen Age, wieviele wegen Cap.
  deletedByAge: number;
  deletedByCap: number;
}

export interface RetentionConfig {
  // Files aelter als `now - maxAgeDays * 86_400_000 ms` fliegen raus.
  // `0` schaltet die Age-Regel ab (alle Files ueberleben den Age-Pass).
  maxAgeDays: number;
  // Cap auf die Gesamtgroesse aller Files nach dem Age-Cut. `0` schaltet das
  // Cap ab.
  maxTotalBytes: number;
}

const MS_PER_DAY = 86_400_000;

// Pure: bekommt Eintraege + Konfiguration + aktuelle Zeit, liefert den Plan.
export function computeRetentionPlan(
  entries: ScreenshotEntry[],
  now: number,
  config: RetentionConfig,
): RetentionPlan {
  const { maxAgeDays, maxTotalBytes } = config;
  const toDelete: ScreenshotEntry[] = [];
  const survivors: ScreenshotEntry[] = [];
  let deletedByAge = 0;
  let deletedByCap = 0;

  // Stufe 1: Age-Cutoff. `maxAgeDays = 0` ueberspringt die Regel (alle bleiben).
  if (maxAgeDays > 0) {
    const cutoff = now - maxAgeDays * MS_PER_DAY;
    for (const entry of entries) {
      if (entry.mtimeMs < cutoff) {
        toDelete.push(entry);
        deletedByAge++;
      } else {
        survivors.push(entry);
      }
    }
  } else {
    survivors.push(...entries);
  }

  // Stufe 2: Size-Cap. Survivors aufsteigend nach mtime sortieren (aelteste
  // zuerst weg). Tie-Break nach filePath fuer Test-Determinismus.
  if (maxTotalBytes > 0) {
    const sorted = [...survivors].sort((a, b) => {
      if (a.mtimeMs !== b.mtimeMs) return a.mtimeMs - b.mtimeMs;
      return a.filePath.localeCompare(b.filePath);
    });
    let totalBytes = sorted.reduce((sum, e) => sum + e.size, 0);
    const finalSurvivors: ScreenshotEntry[] = [...sorted];
    while (totalBytes > maxTotalBytes && finalSurvivors.length > 0) {
      const oldest = finalSurvivors.shift();
      if (!oldest) break;
      toDelete.push(oldest);
      totalBytes -= oldest.size;
      deletedByCap++;
    }
    // Sort-Reihenfolge ist fuer toKeep irrelevant; Tests pruefen Mengen-Identitaet.
    return {
      toDelete: sortDeterministic(toDelete),
      toKeep: finalSurvivors,
      deletedByAge,
      deletedByCap,
    };
  }

  return {
    toDelete: sortDeterministic(toDelete),
    toKeep: survivors,
    deletedByAge,
    deletedByCap,
  };
}

function sortDeterministic(entries: ScreenshotEntry[]): ScreenshotEntry[] {
  return [...entries].sort((a, b) => {
    if (a.mtimeMs !== b.mtimeMs) return a.mtimeMs - b.mtimeMs;
    return a.filePath.localeCompare(b.filePath);
  });
}

// FS-Driver fuer den Boot-Pass. Tests injizieren einen in-Memory-Fake; in
// Production faehrt `realScreenshotRetentionFs`.
export interface ScreenshotRetentionFsDriver {
  // Liest alle Eintraege im Folder mit ihren mtime/size-Stats. Verzeichnisse
  // und nicht-regulaere Files werden bereits hier rausgefiltert, damit die
  // Pure-Logik nur regulaere Files sieht.
  listEntries(folder: string): Promise<ScreenshotEntry[]>;
  // Loescht eine einzelne Datei. Fehler werden vom Caller geloggt und uebersprungen.
  unlinkFile(filePath: string): Promise<void>;
}

export const realScreenshotRetentionFs: ScreenshotRetentionFsDriver = {
  async listEntries(folder: string): Promise<ScreenshotEntry[]> {
    let names: string[] = [];
    try {
      names = await fs.readdir(folder);
    } catch (e) {
      // ENOENT: Screenshot-Ordner existiert noch nicht (z.B. erster Boot vor
      // dem ersten Screenshot-Save). Leere Liste statt Throw.
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') return [];
      throw e;
    }
    const out: ScreenshotEntry[] = [];
    for (const name of names) {
      const filePath = path.join(folder, name);
      try {
        const st = await fs.stat(filePath);
        if (!st.isFile()) continue;
        out.push({ filePath, mtimeMs: st.mtimeMs, size: st.size });
      } catch {
        // Einzelne stat-Fehler (z.B. File wurde zwischen readdir und stat
        // geloescht) ueberspringen — der Boot-Pass laeuft idempotent und
        // der naechste Boot wischt das nach.
      }
    }
    return out;
  },
  async unlinkFile(filePath: string): Promise<void> {
    await fs.unlink(filePath);
  },
};

export interface ScreenshotRetentionReport {
  scanned: number;
  deleted: number;
  deletedByAge: number;
  deletedByCap: number;
  failures: number;
  bytesFreed: number;
}

// Boot-Pass: walks das Screenshot-Verzeichnis, baut den Plan, fuehrt ihn aus.
// Fehler pro File werden geloggt und uebersprungen; ein Hartfehler beim readdir
// wirft.
export async function runScreenshotRetention(deps: {
  screenshotsDir: string;
  config: RetentionConfig;
  fs?: ScreenshotRetentionFsDriver;
  now?: number;
  log: Logger;
}): Promise<ScreenshotRetentionReport> {
  const driver = deps.fs ?? realScreenshotRetentionFs;
  const now = deps.now ?? Date.now();
  const entries = await driver.listEntries(deps.screenshotsDir);
  const plan = computeRetentionPlan(entries, now, deps.config);

  let failures = 0;
  let bytesFreed = 0;
  for (const entry of plan.toDelete) {
    try {
      await driver.unlinkFile(entry.filePath);
      bytesFreed += entry.size;
    } catch (e) {
      failures++;
      deps.log.warn(`[screenshot-retention] unlink fehlgeschlagen path=${entry.filePath}`, e);
    }
  }

  const report: ScreenshotRetentionReport = {
    scanned: entries.length,
    deleted: plan.toDelete.length - failures,
    deletedByAge: plan.deletedByAge,
    deletedByCap: plan.deletedByCap,
    failures,
    bytesFreed,
  };
  deps.log.info(
    `[screenshot-retention] scanned=${report.scanned} deleted=${report.deleted}` +
      ` (age=${report.deletedByAge} cap=${report.deletedByCap}) failures=${report.failures}` +
      ` bytesFreed=${report.bytesFreed}`,
  );
  return report;
}

// Helfer fuer das Settings-Modal — wird vom fs:screenshots-summary-IPC genutzt.
// Liefert {fileCount, totalBytes} ohne irgendwas zu loeschen.
export async function summarizeScreenshots(deps: {
  screenshotsDir: string;
  fs?: ScreenshotRetentionFsDriver;
}): Promise<{ fileCount: number; totalBytes: number }> {
  const driver = deps.fs ?? realScreenshotRetentionFs;
  const entries = await driver.listEntries(deps.screenshotsDir);
  const totalBytes = entries.reduce((sum, e) => sum + e.size, 0);
  return { fileCount: entries.length, totalBytes };
}

// Helfer fuer den Manual-Clear-Button — loescht alle Files im Screenshot-
// Verzeichnis. Liefert {filesDeleted, bytesFreed}.
export async function clearAllScreenshots(deps: {
  screenshotsDir: string;
  fs?: ScreenshotRetentionFsDriver;
  log: Logger;
}): Promise<{ filesDeleted: number; bytesFreed: number; failures: number }> {
  const driver = deps.fs ?? realScreenshotRetentionFs;
  const entries = await driver.listEntries(deps.screenshotsDir);
  let filesDeleted = 0;
  let bytesFreed = 0;
  let failures = 0;
  for (const entry of entries) {
    try {
      await driver.unlinkFile(entry.filePath);
      filesDeleted++;
      bytesFreed += entry.size;
    } catch (e) {
      failures++;
      deps.log.warn(
        `[screenshot-retention] manual-clear unlink fehlgeschlagen path=${entry.filePath}`,
        e,
      );
    }
  }
  return { filesDeleted, bytesFreed, failures };
}
