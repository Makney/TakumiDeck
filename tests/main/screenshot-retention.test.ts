import { describe, it, expect, vi } from 'vitest';
import {
  clearAllScreenshots,
  computeRetentionPlan,
  runScreenshotRetention,
  summarizeScreenshots,
  type ScreenshotEntry,
  type ScreenshotRetentionFsDriver,
} from '../../src/main/screenshots/retention';
import type { Logger } from '../../src/main/logger';

// Phase-2 Season-17 — Screenshot-Retention.
//
// Tests fuer:
// - computeRetentionPlan: Age-Cutoff (exakt am Schwellwert, davor, danach),
//   Size-Cap (aelteste-zuerst, Tie-Break), Kombination beider Stufen,
//   Off-Switches (maxAgeDays=0, maxTotalBytes=0), Empty-Input.
// - runScreenshotRetention: walks via Fake-FS, ruft unlink fuer Plan-Files,
//   Failures werden geloggt und gezaehlt, Report-Bilanz.
// - summarizeScreenshots: liefert {fileCount, totalBytes} ohne Mutation.
// - clearAllScreenshots: loescht alle Files, Failures werden gezaehlt.

const MIB = 1024 * 1024;
const DAY = 86_400_000;

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
  } as unknown as Logger;
}

function entry(filePath: string, ageDays: number, sizeMib: number, now: number): ScreenshotEntry {
  return {
    filePath,
    mtimeMs: now - ageDays * DAY,
    size: Math.round(sizeMib * MIB),
  };
}

describe('computeRetentionPlan: Age-Cutoff', () => {
  const NOW = 1_700_000_000_000;

  it('files exakt am Schwellwert bleiben (mtimeMs < cutoff ist strict)', () => {
    // mtime exakt = (now - 30d). cutoff = now - 30d. mtime < cutoff ist false → bleibt.
    const e = entry('exact.png', 30, 1, NOW);
    const plan = computeRetentionPlan([e], NOW, { maxAgeDays: 30, maxTotalBytes: 0 });
    expect(plan.toDelete).toEqual([]);
    expect(plan.toKeep).toEqual([e]);
    expect(plan.deletedByAge).toBe(0);
  });

  it('files aelter als Schwellwert fliegen raus', () => {
    const old = entry('old.png', 31, 1, NOW);
    const young = entry('young.png', 5, 1, NOW);
    const plan = computeRetentionPlan([old, young], NOW, {
      maxAgeDays: 30,
      maxTotalBytes: 0,
    });
    expect(plan.toDelete).toEqual([old]);
    expect(plan.toKeep).toEqual([young]);
    expect(plan.deletedByAge).toBe(1);
    expect(plan.deletedByCap).toBe(0);
  });

  it('maxAgeDays=0 schaltet die Age-Regel ab', () => {
    const ancient = entry('ancient.png', 3650, 1, NOW);
    const plan = computeRetentionPlan([ancient], NOW, { maxAgeDays: 0, maxTotalBytes: 0 });
    expect(plan.toDelete).toEqual([]);
    expect(plan.toKeep).toEqual([ancient]);
  });
});

describe('computeRetentionPlan: Size-Cap', () => {
  const NOW = 1_700_000_000_000;

  it('Cap unterschritten → keine Loeschungen', () => {
    const a = entry('a.png', 1, 100, NOW);
    const b = entry('b.png', 2, 100, NOW);
    const plan = computeRetentionPlan([a, b], NOW, {
      maxAgeDays: 0,
      maxTotalBytes: 500 * MIB,
    });
    expect(plan.toDelete).toEqual([]);
    expect(plan.deletedByCap).toBe(0);
  });

  it('Cap ueberschritten → aelteste Files fliegen zuerst', () => {
    // Cap 250 MiB; drei Files je 100 MiB. Aeltestes (3d) muss weichen.
    const oldest = entry('oldest.png', 3, 100, NOW);
    const mid = entry('mid.png', 2, 100, NOW);
    const newest = entry('newest.png', 1, 100, NOW);
    const plan = computeRetentionPlan([newest, oldest, mid], NOW, {
      maxAgeDays: 0,
      maxTotalBytes: 250 * MIB,
    });
    expect(plan.toDelete).toEqual([oldest]);
    expect(plan.deletedByCap).toBe(1);
  });

  it('Cap=0 schaltet das Cap ab (kein Cut)', () => {
    const huge = entry('huge.png', 1, 10_000, NOW);
    const plan = computeRetentionPlan([huge], NOW, {
      maxAgeDays: 0,
      maxTotalBytes: 0,
    });
    expect(plan.toDelete).toEqual([]);
  });

  it('Tie-Break bei gleicher mtime nach filePath ASC', () => {
    // Beide gleich alt + gleich gross; Cap zwingt einen raus. b kommt
    // alphabetisch vor a in unserer Test-Liste, aber Sort macht a zuerst.
    const a = entry('a.png', 1, 100, NOW);
    const b = entry('b.png', 1, 100, NOW);
    const plan = computeRetentionPlan([b, a], NOW, {
      maxAgeDays: 0,
      maxTotalBytes: 150 * MIB,
    });
    // 'a.png' kommt im Sort vor 'b.png' → wird zuerst geloescht.
    expect(plan.toDelete).toEqual([a]);
  });
});

describe('computeRetentionPlan: Kombination', () => {
  const NOW = 1_700_000_000_000;

  it('Age-Pass laeuft zuerst, dann Cap auf die Survivors', () => {
    // Drei Files: zwei alt (40d), eins jung (5d). Age-Cutoff fegt die zwei
    // alten raus (deletedByAge=2). Survivor ist 200 MiB, Cap 100 MiB → eines
    // muesste weichen, ist aber nur eins da. Erwartung: 1 Survivor wird auch
    // raus → deletedByCap=1, total=3.
    const old1 = entry('old1.png', 40, 50, NOW);
    const old2 = entry('old2.png', 41, 50, NOW);
    const young = entry('young.png', 5, 200, NOW);
    const plan = computeRetentionPlan([old1, old2, young], NOW, {
      maxAgeDays: 30,
      maxTotalBytes: 100 * MIB,
    });
    expect(plan.deletedByAge).toBe(2);
    expect(plan.deletedByCap).toBe(1);
    expect(plan.toDelete.length).toBe(3);
    expect(plan.toKeep).toEqual([]);
  });
});

describe('computeRetentionPlan: Edge-Cases', () => {
  it('leere Liste → leerer Plan', () => {
    const plan = computeRetentionPlan([], Date.now(), {
      maxAgeDays: 30,
      maxTotalBytes: 500 * MIB,
    });
    expect(plan.toDelete).toEqual([]);
    expect(plan.toKeep).toEqual([]);
    expect(plan.deletedByAge).toBe(0);
    expect(plan.deletedByCap).toBe(0);
  });

  it('beide Schwellen auf 0 → kein File faellt weg', () => {
    const NOW = 1_700_000_000_000;
    const a = entry('a.png', 999, 9999, NOW);
    const plan = computeRetentionPlan([a], NOW, { maxAgeDays: 0, maxTotalBytes: 0 });
    expect(plan.toDelete).toEqual([]);
  });
});

// --- runScreenshotRetention ---------------------------------------------

function makeFakeFs(
  filesByFolder: Record<string, ScreenshotEntry[]>,
  unlinkBehavior?: (filePath: string) => void,
): ScreenshotRetentionFsDriver {
  return {
    async listEntries(folder) {
      return filesByFolder[folder] ?? [];
    },
    async unlinkFile(filePath) {
      unlinkBehavior?.(filePath);
    },
  };
}

describe('runScreenshotRetention', () => {
  const NOW = 1_700_000_000_000;
  const DIR = '/data/screenshots';

  it('loescht die Plan-Files und berichtet die Bilanz', async () => {
    const old = entry(`${DIR}/old.png`, 40, 1, NOW);
    const young = entry(`${DIR}/young.png`, 5, 1, NOW);
    const unlinked: string[] = [];
    const report = await runScreenshotRetention({
      screenshotsDir: DIR,
      config: { maxAgeDays: 30, maxTotalBytes: 0 },
      fs: makeFakeFs({ [DIR]: [old, young] }, (p) => unlinked.push(p)),
      now: NOW,
      log: makeLogger(),
    });
    expect(unlinked).toEqual([old.filePath]);
    expect(report.scanned).toBe(2);
    expect(report.deleted).toBe(1);
    expect(report.deletedByAge).toBe(1);
    expect(report.deletedByCap).toBe(0);
    expect(report.failures).toBe(0);
    expect(report.bytesFreed).toBe(old.size);
  });

  it('zaehlt unlink-Failures und bricht NICHT ab', async () => {
    const a = entry(`${DIR}/a.png`, 40, 1, NOW);
    const b = entry(`${DIR}/b.png`, 41, 1, NOW);
    const driver: ScreenshotRetentionFsDriver = {
      async listEntries() {
        return [a, b];
      },
      async unlinkFile(filePath) {
        if (filePath === a.filePath) throw new Error('EBUSY');
      },
    };
    const report = await runScreenshotRetention({
      screenshotsDir: DIR,
      config: { maxAgeDays: 30, maxTotalBytes: 0 },
      fs: driver,
      now: NOW,
      log: makeLogger(),
    });
    expect(report.scanned).toBe(2);
    expect(report.deleted).toBe(1); // b durchgekommen
    expect(report.failures).toBe(1);
    expect(report.bytesFreed).toBe(b.size);
  });

  it('leerer Ordner → no-op', async () => {
    const report = await runScreenshotRetention({
      screenshotsDir: DIR,
      config: { maxAgeDays: 30, maxTotalBytes: 500 * MIB },
      fs: makeFakeFs({ [DIR]: [] }),
      now: NOW,
      log: makeLogger(),
    });
    expect(report.scanned).toBe(0);
    expect(report.deleted).toBe(0);
  });
});

// --- summarizeScreenshots ------------------------------------------------

describe('summarizeScreenshots', () => {
  it('liefert fileCount + totalBytes ohne Mutation', async () => {
    const DIR = '/data/screenshots';
    const NOW = 1_700_000_000_000;
    const a = entry(`${DIR}/a.png`, 1, 5, NOW);
    const b = entry(`${DIR}/b.png`, 2, 3, NOW);
    const unlinked: string[] = [];
    const result = await summarizeScreenshots({
      screenshotsDir: DIR,
      fs: makeFakeFs({ [DIR]: [a, b] }, (p) => unlinked.push(p)),
    });
    expect(result.fileCount).toBe(2);
    expect(result.totalBytes).toBe(a.size + b.size);
    expect(unlinked).toEqual([]);
  });

  it('leeres Verzeichnis → 0/0', async () => {
    const result = await summarizeScreenshots({
      screenshotsDir: '/empty',
      fs: makeFakeFs({}),
    });
    expect(result).toEqual({ fileCount: 0, totalBytes: 0 });
  });
});

// --- clearAllScreenshots -------------------------------------------------

describe('clearAllScreenshots', () => {
  it('loescht alle Files und liefert Bilanz', async () => {
    const DIR = '/data/screenshots';
    const NOW = 1_700_000_000_000;
    const a = entry(`${DIR}/a.png`, 1, 2, NOW);
    const b = entry(`${DIR}/b.png`, 2, 3, NOW);
    const unlinked: string[] = [];
    const result = await clearAllScreenshots({
      screenshotsDir: DIR,
      fs: makeFakeFs({ [DIR]: [a, b] }, (p) => unlinked.push(p)),
      log: makeLogger(),
    });
    expect(unlinked.sort()).toEqual([a.filePath, b.filePath].sort());
    expect(result.filesDeleted).toBe(2);
    expect(result.bytesFreed).toBe(a.size + b.size);
    expect(result.failures).toBe(0);
  });

  it('Failure zaehlt aber blockt nicht den Rest', async () => {
    const DIR = '/data/screenshots';
    const NOW = 1_700_000_000_000;
    const a = entry(`${DIR}/a.png`, 1, 2, NOW);
    const b = entry(`${DIR}/b.png`, 2, 3, NOW);
    const driver: ScreenshotRetentionFsDriver = {
      async listEntries() {
        return [a, b];
      },
      async unlinkFile(filePath) {
        if (filePath === a.filePath) throw new Error('EACCES');
      },
    };
    const result = await clearAllScreenshots({
      screenshotsDir: DIR,
      fs: driver,
      log: makeLogger(),
    });
    expect(result.filesDeleted).toBe(1);
    expect(result.bytesFreed).toBe(b.size);
    expect(result.failures).toBe(1);
  });
});
