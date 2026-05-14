import { describe, it, expect } from 'vitest';
import { formatResetFooter } from '../../src/renderer/components/formatResetFooter';

// Phase 2 Season Flacsh — Reset-Footer-Format.
//
// Format-Helper liefert den String unter den UsageBars; Pure-Funktion ohne
// React-Abhaengigkeit, daher hier als reiner Unit-Test gegen den Output.

describe('formatResetFooter', () => {
  it('< 1 Stunde: "in N Min." mit absoluter Uhrzeit', () => {
    const now = new Date(2026, 4, 14, 14, 23, 0, 0).getTime();
    const end = new Date(2026, 4, 14, 14, 30, 0, 0).getTime();
    expect(formatResetFooter(end, now)).toBe('Zurücksetzung in 7 Min. → 14:30 Uhr');
  });

  it('Std. + Min.: "in X Std. Y Min."', () => {
    const now = new Date(2026, 4, 14, 12, 23, 0, 0).getTime();
    const end = new Date(2026, 4, 14, 15, 0, 0, 0).getTime();
    expect(formatResetFooter(end, now)).toBe('Zurücksetzung in 2 Std. 37 Min. → 15:00 Uhr');
  });

  it('volle Stunden: "in X Std." ohne Minuten-Suffix', () => {
    const now = new Date(2026, 4, 14, 13, 0, 0, 0).getTime();
    const end = new Date(2026, 4, 14, 15, 0, 0, 0).getTime();
    expect(formatResetFooter(end, now)).toBe('Zurücksetzung in 2 Std. → 15:00 Uhr');
  });

  it('1 Tag: "in 1 Tag" + Wochentag-Kuerzel', () => {
    // Donnerstag 14.05 12:00 + 1 Tag = Freitag 15.05.
    const now = new Date(2026, 4, 14, 12, 0, 0, 0).getTime();
    const end = new Date(2026, 4, 15, 14, 0, 0, 0).getTime();
    expect(formatResetFooter(end, now)).toBe('Zurücksetzung in 1 Tag → Fr., 14:00 Uhr');
  });

  it('mehrere Tage: "in N Tagen" + Wochentag', () => {
    // Donnerstag 14.05 12:00 → Sonntag 17.05 14:00 = 74 h = 3 floor-Tage.
    const now = new Date(2026, 4, 14, 12, 0, 0, 0).getTime();
    const end = new Date(2026, 4, 17, 14, 0, 0, 0).getTime();
    expect(formatResetFooter(end, now)).toBe('Zurücksetzung in 3 Tagen → So., 14:00 Uhr');
  });

  it('< 1 Min.: spezielle Form, kein "in 0 Min."', () => {
    const now = new Date(2026, 4, 14, 14, 59, 30, 0).getTime();
    const end = new Date(2026, 4, 14, 15, 0, 0, 0).getTime();
    expect(formatResetFooter(end, now)).toBe(
      'Zurücksetzung in weniger als 1 Min. → 15:00 Uhr',
    );
  });

  it('windowEndAt <= now → null (kein Footer)', () => {
    const now = new Date(2026, 4, 14, 15, 0, 0, 0).getTime();
    const end = new Date(2026, 4, 14, 14, 30, 0, 0).getTime();
    expect(formatResetFooter(end, now)).toBeNull();
  });
});
