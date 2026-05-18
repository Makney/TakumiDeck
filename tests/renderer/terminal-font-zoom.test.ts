import { describe, it, expect } from 'vitest';
import {
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  clampFontSize,
  nextZoomFontSize,
} from '../../src/renderer/components/terminalFontZoom';

// Phase-2 Season-28: Pure-Logik fuer den Ctrl+Mausrad-Font-Zoom. Tests
// decken Clamping (Defense-in-Depth gegen veraltete Settings-Werte) und
// die Wheel-Direction-Logik ab. Kein xterm/DOM-Setup noetig — reine
// Funktion mit Number-In/Number-Out.

describe('clampFontSize', () => {
  it('begrenzt Werte unter MIN auf MIN', () => {
    expect(clampFontSize(0)).toBe(TERMINAL_FONT_SIZE_MIN);
    expect(clampFontSize(-5)).toBe(TERMINAL_FONT_SIZE_MIN);
    expect(clampFontSize(7)).toBe(TERMINAL_FONT_SIZE_MIN);
  });

  it('begrenzt Werte ueber MAX auf MAX', () => {
    expect(clampFontSize(99)).toBe(TERMINAL_FONT_SIZE_MAX);
    expect(clampFontSize(TERMINAL_FONT_SIZE_MAX + 1)).toBe(TERMINAL_FONT_SIZE_MAX);
  });

  it('rundet Floats auf ganze Zahlen', () => {
    expect(clampFontSize(13.4)).toBe(13);
    expect(clampFontSize(13.7)).toBe(14);
  });

  it('faengt NaN/Infinity ab und faellt auf MIN zurueck', () => {
    // Defensive: alle nicht-finiten Werte zaehlen als Garbage und kippen auf
    // die sicherste Untergrenze. Wir behandeln Infinity nicht als „sehr gross",
    // weil das in der Praxis nur als Symptom eines Bugs auftritt.
    expect(clampFontSize(NaN)).toBe(TERMINAL_FONT_SIZE_MIN);
    expect(clampFontSize(Infinity)).toBe(TERMINAL_FONT_SIZE_MIN);
    expect(clampFontSize(-Infinity)).toBe(TERMINAL_FONT_SIZE_MIN);
  });

  it('laesst Werte innerhalb des Intervalls unangetastet', () => {
    expect(clampFontSize(14)).toBe(14);
    expect(clampFontSize(TERMINAL_FONT_SIZE_MIN)).toBe(TERMINAL_FONT_SIZE_MIN);
    expect(clampFontSize(TERMINAL_FONT_SIZE_MAX)).toBe(TERMINAL_FONT_SIZE_MAX);
  });
});

describe('nextZoomFontSize', () => {
  it('vergroessert die Schrift bei deltaY < 0 (Mausrad hoch)', () => {
    expect(nextZoomFontSize(14, -1)).toBe(15);
    expect(nextZoomFontSize(14, -100)).toBe(15);
  });

  it('verkleinert die Schrift bei deltaY > 0 (Mausrad runter)', () => {
    expect(nextZoomFontSize(14, 1)).toBe(13);
    expect(nextZoomFontSize(14, 100)).toBe(13);
  });

  it('gibt clampedValue zurueck bei deltaY === 0 (kein No-Op-Sprung)', () => {
    expect(nextZoomFontSize(14, 0)).toBe(14);
    expect(nextZoomFontSize(50, 0)).toBe(TERMINAL_FONT_SIZE_MAX);
  });

  it('respektiert die obere Grenze beim Vergroessern', () => {
    expect(nextZoomFontSize(TERMINAL_FONT_SIZE_MAX, -1)).toBe(TERMINAL_FONT_SIZE_MAX);
  });

  it('respektiert die untere Grenze beim Verkleinern', () => {
    expect(nextZoomFontSize(TERMINAL_FONT_SIZE_MIN, 1)).toBe(TERMINAL_FONT_SIZE_MIN);
  });
});
