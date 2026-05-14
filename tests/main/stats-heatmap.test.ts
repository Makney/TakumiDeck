import { describe, it, expect } from 'vitest';
import {
  HeatmapRepository,
  InMemoryHeatmapDriver,
  computeHeatmapWindow,
  computeQuantileThresholds,
  enumerateLocalDays,
  levelFor,
  type InMemoryHeatmapMessageLike,
} from '../../src/main/db/repos/heatmap';

// Phase-2 Season-13 — Aktivitaets-Heatmap.
//
// Tests gegen den InMemoryHeatmapDriver, gleicher Pattern-Stil wie die
// Stats-Aggregat-Tests aus Season 12.

const PROJ_A = 'project-a';
const PROJ_B = 'project-b';
// 2026-05-14 12:00 lokal = Donnerstag. Wir testen das Wochenfenster vom
// 2026-05-11 (Montag dieser Woche) ausgehend; bei weeks=30 startet das
// Fenster 29 Wochen vor diesem Montag.
const NOW = new Date(2026, 4, 14, 12, 0, 0);

function ts(date: string, hour = 12): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!, hour, 0, 0).getTime();
}

function msg(over: Partial<InMemoryHeatmapMessageLike>): InMemoryHeatmapMessageLike {
  return {
    project_id: PROJ_A,
    ts: NOW.getTime(),
    tokens_in: 0,
    tokens_out: 0,
    ...over,
  };
}

describe('computeQuantileThresholds', () => {
  it('leere Liste -> alle Schwellen 0', () => {
    const t = computeQuantileThresholds([]);
    expect(t).toEqual({ p25: 0, p50: 0, p75: 0 });
  });

  it('einzelner Wert -> alle Schwellen gleich dem Wert', () => {
    const t = computeQuantileThresholds([42]);
    expect(t).toEqual({ p25: 42, p50: 42, p75: 42 });
  });

  it('alle Werte identisch -> alle Schwellen identisch', () => {
    const t = computeQuantileThresholds([10, 10, 10, 10]);
    expect(t.p25).toBe(10);
    expect(t.p50).toBe(10);
    expect(t.p75).toBe(10);
  });

  it('drei Werte -> Median ist der mittlere', () => {
    const t = computeQuantileThresholds([10, 20, 30]);
    expect(t.p50).toBe(20);
  });

  it('fuenf Werte -> klassische Quartile per Linear-Interpolation', () => {
    // Sortiert [10,20,30,40,50] mit n=5: idx p25 = 0.25*4 = 1 → 20.
    // p50 = 0.5*4 = 2 → 30. p75 = 0.75*4 = 3 → 40.
    const t = computeQuantileThresholds([10, 20, 30, 40, 50]);
    expect(t.p25).toBe(20);
    expect(t.p50).toBe(30);
    expect(t.p75).toBe(40);
  });
});

describe('levelFor', () => {
  it('tokens = 0 -> Level 0', () => {
    expect(levelFor(0, { p25: 10, p50: 20, p75: 30 })).toBe(0);
  });

  it('tokens > 0 mit identischen Quartilen -> Level 4 (Edge-Case Single-Tag)', () => {
    expect(levelFor(42, { p25: 42, p50: 42, p75: 42 })).toBe(4);
  });

  it('Quartile-Stufen werden korrekt zugeordnet', () => {
    const t = { p25: 10, p50: 20, p75: 30 };
    expect(levelFor(5, t)).toBe(1);
    expect(levelFor(10, t)).toBe(1); // genau p25 -> Stufe 1 (inklusiver Schwellenwert)
    expect(levelFor(15, t)).toBe(2);
    expect(levelFor(25, t)).toBe(3);
    expect(levelFor(31, t)).toBe(4);
  });
});

describe('computeHeatmapWindow', () => {
  it('Donnerstag-Anker -> Montag dieser Woche ist Window-Ende-Anker', () => {
    // NOW = Do 2026-05-14. Diese-Woche-Montag = 2026-05-11.
    // weeks=30 -> Start = 2026-05-11 - 29*7 Tage = 2025-10-20.
    const w = computeHeatmapWindow(NOW, 30);
    expect(w.startDate).toBe('2025-10-20');
    expect(w.endDate).toBe('2026-05-14');
  });

  it('weeks=52 -> Start exakt 51 Wochen vor Diese-Woche-Montag', () => {
    const w = computeHeatmapWindow(NOW, 52);
    // 2026-05-11 - 51*7 Tage = 2025-05-19 (auch Montag).
    expect(w.startDate).toBe('2025-05-19');
  });

  it('Sonntag als heute -> diese-Woche-Montag ist 6 Tage zurueck', () => {
    // 2026-05-10 ist Sonntag. Diese-Woche-Montag = 2026-05-04.
    // weeks=30 -> Start = 2026-05-04 - 29*7 = 2025-10-13.
    const w = computeHeatmapWindow(new Date(2026, 4, 10, 12, 0, 0), 30);
    expect(w.startDate).toBe('2025-10-13');
    expect(w.endDate).toBe('2026-05-10');
  });

  it('Montag als heute -> Diese-Woche-Montag = heute', () => {
    const w = computeHeatmapWindow(new Date(2026, 4, 11, 12, 0, 0), 30);
    expect(w.endDate).toBe('2026-05-11');
    expect(w.startDate).toBe('2025-10-20');
  });
});

describe('enumerateLocalDays', () => {
  it('startDate=endDate -> ein einzelner Tag', () => {
    expect(enumerateLocalDays('2026-05-14', '2026-05-14')).toEqual(['2026-05-14']);
  });

  it('eine Woche', () => {
    const days = enumerateLocalDays('2026-05-11', '2026-05-17');
    expect(days).toEqual([
      '2026-05-11',
      '2026-05-12',
      '2026-05-13',
      '2026-05-14',
      '2026-05-15',
      '2026-05-16',
      '2026-05-17',
    ]);
  });

  it('Monatswechsel inkl. korrekt', () => {
    const days = enumerateLocalDays('2026-01-30', '2026-02-02');
    expect(days).toEqual(['2026-01-30', '2026-01-31', '2026-02-01', '2026-02-02']);
  });

  it('startDate nach endDate -> leeres Array', () => {
    expect(enumerateLocalDays('2026-05-14', '2026-05-10')).toEqual([]);
  });
});

describe('HeatmapRepository.getHeatmap', () => {
  it('leere DB -> Tage komplett mit Level 0, keine Schwellen', () => {
    const repo = new HeatmapRepository(new InMemoryHeatmapDriver([]));
    const out = repo.getHeatmap({ projectId: PROJ_A, weeks: 30, now: NOW });
    expect(out.weeks).toBe(30);
    expect(out.scope).toBe('project');
    expect(out.thresholds).toEqual({ p25: 0, p50: 0, p75: 0 });
    expect(out.days.length).toBeGreaterThan(0);
    expect(out.days.every((d) => d.tokens === 0 && d.level === 0)).toBe(true);
    // Letzter Tag ist heute (lokal).
    expect(out.days[out.days.length - 1]!.date).toBe('2026-05-14');
  });

  it('Tage ausserhalb des Fensters werden nicht aggregiert', () => {
    // 2024-01-01 liegt deutlich vor dem 30-Wochen-Fenster ab 2025-10-20.
    const messages: InMemoryHeatmapMessageLike[] = [
      msg({ ts: ts('2024-01-01'), tokens_in: 100, tokens_out: 100 }),
      msg({ ts: ts('2026-05-14'), tokens_in: 50, tokens_out: 0 }),
    ];
    const repo = new HeatmapRepository(new InMemoryHeatmapDriver(messages));
    const out = repo.getHeatmap({ projectId: PROJ_A, weeks: 30, now: NOW });
    const today = out.days.find((d) => d.date === '2026-05-14');
    expect(today?.tokens).toBe(50);
    const oldDay = out.days.find((d) => d.date === '2024-01-01');
    expect(oldDay).toBeUndefined();
  });

  it('Scope global summiert ueber alle Projekte', () => {
    const messages: InMemoryHeatmapMessageLike[] = [
      msg({ project_id: PROJ_A, ts: ts('2026-05-14'), tokens_in: 100 }),
      msg({ project_id: PROJ_B, ts: ts('2026-05-14'), tokens_in: 200 }),
    ];
    const repo = new HeatmapRepository(new InMemoryHeatmapDriver(messages));
    const out = repo.getHeatmap({ projectId: null, weeks: 30, now: NOW });
    expect(out.scope).toBe('global');
    const today = out.days.find((d) => d.date === '2026-05-14');
    expect(today?.tokens).toBe(300);
  });

  it('Scope project filtert Fremd-Projekte raus', () => {
    const messages: InMemoryHeatmapMessageLike[] = [
      msg({ project_id: PROJ_A, ts: ts('2026-05-14'), tokens_in: 100 }),
      msg({ project_id: PROJ_B, ts: ts('2026-05-14'), tokens_in: 999 }),
    ];
    const repo = new HeatmapRepository(new InMemoryHeatmapDriver(messages));
    const out = repo.getHeatmap({ projectId: PROJ_A, weeks: 30, now: NOW });
    const today = out.days.find((d) => d.date === '2026-05-14');
    expect(today?.tokens).toBe(100);
  });

  it('Mehrere Messages am gleichen Tag werden aufsummiert', () => {
    const messages: InMemoryHeatmapMessageLike[] = [
      msg({ ts: ts('2026-05-14', 9), tokens_in: 10, tokens_out: 5 }),
      msg({ ts: ts('2026-05-14', 14), tokens_in: 20, tokens_out: 0 }),
      msg({ ts: ts('2026-05-14', 23), tokens_in: 0, tokens_out: 15 }),
    ];
    const repo = new HeatmapRepository(new InMemoryHeatmapDriver(messages));
    const out = repo.getHeatmap({ projectId: PROJ_A, weeks: 30, now: NOW });
    const today = out.days.find((d) => d.date === '2026-05-14');
    expect(today?.tokens).toBe(50);
  });

  it('Single aktiver Tag -> Level 4 (Edge-Case)', () => {
    const messages: InMemoryHeatmapMessageLike[] = [
      msg({ ts: ts('2026-05-14'), tokens_in: 100, tokens_out: 0 }),
    ];
    const repo = new HeatmapRepository(new InMemoryHeatmapDriver(messages));
    const out = repo.getHeatmap({ projectId: PROJ_A, weeks: 30, now: NOW });
    const today = out.days.find((d) => d.date === '2026-05-14');
    expect(today?.level).toBe(4);
    expect(out.thresholds.p25).toBe(100);
    expect(out.thresholds.p75).toBe(100);
  });

  it('Tag genau am Fenster-Anfang ist drin', () => {
    // Window-Start fuer NOW + 30W = 2025-10-20 (Montag).
    const messages: InMemoryHeatmapMessageLike[] = [
      msg({ ts: ts('2025-10-20'), tokens_in: 33, tokens_out: 0 }),
    ];
    const repo = new HeatmapRepository(new InMemoryHeatmapDriver(messages));
    const out = repo.getHeatmap({ projectId: PROJ_A, weeks: 30, now: NOW });
    const day = out.days.find((d) => d.date === '2025-10-20');
    expect(day?.tokens).toBe(33);
  });

  it('Anzahl Tage = (Heute - Start) + 1', () => {
    const repo = new HeatmapRepository(new InMemoryHeatmapDriver([]));
    const out = repo.getHeatmap({ projectId: PROJ_A, weeks: 30, now: NOW });
    // Von 2025-10-20 bis 2026-05-14 inklusive = 207 Tage (29 vollstaendige
    // Wochen + Mo..Do der laufenden Woche). 29*7 = 203, plus 4 Tage = 207.
    expect(out.days.length).toBe(207);
  });

  it('Quartile spiegeln Verteilung der nicht-leeren Tage', () => {
    const messages: InMemoryHeatmapMessageLike[] = [
      msg({ ts: ts('2026-05-04'), tokens_in: 10 }),
      msg({ ts: ts('2026-05-05'), tokens_in: 20 }),
      msg({ ts: ts('2026-05-06'), tokens_in: 30 }),
      msg({ ts: ts('2026-05-07'), tokens_in: 40 }),
      msg({ ts: ts('2026-05-08'), tokens_in: 50 }),
    ];
    const repo = new HeatmapRepository(new InMemoryHeatmapDriver(messages));
    const out = repo.getHeatmap({ projectId: PROJ_A, weeks: 30, now: NOW });
    expect(out.thresholds).toEqual({ p25: 20, p50: 30, p75: 40 });
    const d10 = out.days.find((d) => d.date === '2026-05-04');
    const d50 = out.days.find((d) => d.date === '2026-05-08');
    expect(d10?.level).toBe(1);
    expect(d50?.level).toBe(4);
  });

  it('reflektiert weeks im Result-Echo', () => {
    const repo = new HeatmapRepository(new InMemoryHeatmapDriver([]));
    const out30 = repo.getHeatmap({ projectId: PROJ_A, weeks: 30, now: NOW });
    const out52 = repo.getHeatmap({ projectId: PROJ_A, weeks: 52, now: NOW });
    expect(out30.weeks).toBe(30);
    expect(out52.weeks).toBe(52);
    expect(out52.days.length).toBeGreaterThan(out30.days.length);
  });
});
