import { describe, it, expect } from 'vitest';
import {
  computeStreaks,
  isNextDay,
  subtractOneDay,
  todayLocalDate,
} from '../../src/main/stats/streak';

// Phase-2 Season-12 — pure Streak-Logik fuer die Stats-Cards.

describe('computeStreaks', () => {
  it('leere Liste -> beide 0', () => {
    expect(computeStreaks([], '2026-05-14')).toEqual({ current: 0, longest: 0 });
  });

  it('einzelner Tag heute -> current=1, longest=1', () => {
    expect(computeStreaks(['2026-05-14'], '2026-05-14')).toEqual({
      current: 1,
      longest: 1,
    });
  });

  it('einzelner Tag gestern -> current=1 (Streak intakt)', () => {
    expect(computeStreaks(['2026-05-13'], '2026-05-14')).toEqual({
      current: 1,
      longest: 1,
    });
  });

  it('letzter Tag vor zwei Tagen -> current=0, longest erhaelt seinen Wert', () => {
    expect(computeStreaks(['2026-05-12'], '2026-05-14')).toEqual({
      current: 0,
      longest: 1,
    });
  });

  it('fuenf Tage in Folge mit Endpunkt heute -> current=5, longest=5', () => {
    const days = ['2026-05-10', '2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14'];
    expect(computeStreaks(days, '2026-05-14')).toEqual({ current: 5, longest: 5 });
  });

  it('zwei Stretches mit Luecke -> current haengt nur am letzten Stretch', () => {
    // Streak 1: 2026-05-01..05 (5 Tage), Luecke, Streak 2: 2026-05-13..14 (2 Tage)
    const days = [
      '2026-05-01',
      '2026-05-02',
      '2026-05-03',
      '2026-05-04',
      '2026-05-05',
      '2026-05-13',
      '2026-05-14',
    ];
    expect(computeStreaks(days, '2026-05-14')).toEqual({ current: 2, longest: 5 });
  });

  it('longest aus laengstem Stretch, selbst wenn current=0', () => {
    // Alle vor zwei Tagen -> current=0; longest aus dem 4er-Stretch.
    const days = ['2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23'];
    expect(computeStreaks(days, '2026-05-14')).toEqual({ current: 0, longest: 4 });
  });

  it('Monats-/Jahreswechsel via UTC korrekt', () => {
    const days = ['2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02'];
    expect(computeStreaks(days, '2026-01-02')).toEqual({ current: 4, longest: 4 });
  });

  it('robust gegen unsortierte oder leere Strings (Hilfsfunktionen)', () => {
    // computeStreaks erwartet sortiert — der Test prueft die Hilfsfunktionen,
    // damit ein leerer String oder eine ungueltige Eingabe kein Crash erzeugt.
    expect(isNextDay('', '2026-05-14')).toBe(false);
    expect(isNextDay('2026-05-14', '')).toBe(false);
    expect(subtractOneDay('')).toBe('');
  });

  it('subtractOneDay rollt ueber den Monatswechsel', () => {
    expect(subtractOneDay('2026-03-01')).toBe('2026-02-28');
    expect(subtractOneDay('2024-03-01')).toBe('2024-02-29'); // Schaltjahr
  });
});

describe('todayLocalDate', () => {
  it('formatiert Date als YYYY-MM-DD in lokaler Zeit', () => {
    // Festes Datum, lokaler Mittag — DST-Effekte um Mitternacht sind durch
    // die Mittags-Zeit ausgeschlossen, das Format bleibt zonen-stabil.
    const fixed = new Date(2026, 4, 14, 12, 0, 0); // Mai = Monat 4 (0-indiziert)
    expect(todayLocalDate(fixed)).toBe('2026-05-14');
  });
});
