import { describe, it, expect } from 'vitest';
import {
  computeEasterEggComparisons,
  formatEasterEggFactor,
  DEFAULT_EASTER_EGG_WORKS,
  type EasterEggWork,
} from '../../src/shared/easter-egg-works';

// Phase-2 Season-19: Pure-Logik-Tests fuer die Easter-Egg-Vergleiche.
// Deckt Filter (factor >= 0.1), Sort (factor desc), Top-N-Slicing, die
// drei Edge-Cases (0/Negativ/NaN) und die Format-Heuristik (< 10 mit
// einer Nachkommastelle, >= 10 Ganzzahl) ab.

describe('computeEasterEggComparisons', () => {
  it('liefert leere Liste bei tokensTotal <= 0', () => {
    expect(computeEasterEggComparisons(0)).toEqual([]);
    expect(computeEasterEggComparisons(-100)).toEqual([]);
  });

  it('liefert leere Liste bei NaN/Infinity', () => {
    expect(computeEasterEggComparisons(Number.NaN)).toEqual([]);
    expect(computeEasterEggComparisons(Number.POSITIVE_INFINITY)).toEqual([]);
  });

  it('filtert Werke mit factor < 0.1 raus', () => {
    // Bei 10k Tokens ist selbst der Hobbit (126k) bei ~0.08× — zu wenig.
    const result = computeEasterEggComparisons(10_000);
    expect(result).toEqual([]);
  });

  it('liefert ein einzelnes Werk, wenn nur eines die Schwelle reisst', () => {
    // 13k tokens / 126k Hobbit = ~0.103× → genau ueber der Schwelle, alle
    // anderen Werke sind groesser und liegen unter 0.1×.
    const result = computeEasterEggComparisons(13_000);
    expect(result).toHaveLength(1);
    expect(result[0]!.work.name).toBe('Der Hobbit');
    expect(result[0]!.factor).toBeCloseTo(13_000 / 126_000, 5);
  });

  it('sortiert nach Faktor absteigend und schneidet auf Top-3', () => {
    // 5M tokens — alle 5 Default-Werke liefern factor > 0.1, aber wir
    // wollen nur Top-3 sehen, beginnend mit dem groessten Faktor (= dem
    // kleinsten Werk).
    const result = computeEasterEggComparisons(5_000_000);
    expect(result).toHaveLength(3);
    expect(result[0]!.work.name).toBe('Der Hobbit'); // ~40×
    expect(result[1]!.work.name).toBe('The Lord of the Rings'); // ~8×
    expect(result[2]!.work.name).toBe('Krieg und Frieden'); // ~6.7×
    expect(result[0]!.factor).toBeGreaterThan(result[1]!.factor);
    expect(result[1]!.factor).toBeGreaterThan(result[2]!.factor);
  });

  it('respektiert custom limit-Parameter', () => {
    const result = computeEasterEggComparisons(5_000_000, undefined, 5);
    expect(result).toHaveLength(5);
  });

  it('respektiert custom works-Liste', () => {
    const customWorks: EasterEggWork[] = [
      { name: 'TestWerk A', tokens: 100_000 },
      { name: 'TestWerk B', tokens: 200_000 },
    ];
    const result = computeEasterEggComparisons(500_000, customWorks);
    expect(result).toHaveLength(2);
    expect(result[0]!.work.name).toBe('TestWerk A'); // 5×
    expect(result[1]!.work.name).toBe('TestWerk B'); // 2.5×
  });

  it('skippt Werke mit tokens <= 0 (Divisions-Schutz)', () => {
    const customWorks: EasterEggWork[] = [
      { name: 'Kaputt', tokens: 0 },
      { name: 'Gut', tokens: 100_000 },
    ];
    const result = computeEasterEggComparisons(500_000, customWorks);
    expect(result).toHaveLength(1);
    expect(result[0]!.work.name).toBe('Gut');
  });

  it('DEFAULT_EASTER_EGG_WORKS enthaelt die spezifizierten Default-Werke', () => {
    const names = DEFAULT_EASTER_EGG_WORKS.map((w) => w.name);
    expect(names).toContain('Der Hobbit');
    expect(names).toContain('The Lord of the Rings');
    expect(names).toContain('Die Bibel');
    expect(names).toContain('Harry-Potter-Reihe');
  });
});

describe('formatEasterEggFactor', () => {
  it('rundet >= 10 auf Ganzzahl', () => {
    expect(formatEasterEggFactor(10)).toBe('10×');
    expect(formatEasterEggFactor(31.4)).toBe('31×');
    expect(formatEasterEggFactor(31.5)).toBe('32×');
    expect(formatEasterEggFactor(200)).toBe('200×');
  });

  it('zeigt < 10 mit einer Nachkommastelle', () => {
    expect(formatEasterEggFactor(0.5)).toBe('0.5×');
    expect(formatEasterEggFactor(1.2)).toBe('1.2×');
    expect(formatEasterEggFactor(5.47)).toBe('5.5×');
  });

  it('trimmt trailing .0 weg (JS-Number-Stringify)', () => {
    expect(formatEasterEggFactor(1)).toBe('1×');
    expect(formatEasterEggFactor(2.0)).toBe('2×');
  });

  it('liefert 0× bei 0/Negativ/NaN', () => {
    expect(formatEasterEggFactor(0)).toBe('0×');
    expect(formatEasterEggFactor(-5)).toBe('0×');
    expect(formatEasterEggFactor(Number.NaN)).toBe('0×');
  });
});
