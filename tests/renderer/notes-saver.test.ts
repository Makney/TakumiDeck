import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNotesSaver } from '../../src/renderer/components/notesSaver';

// Tests laufen mit Fake-Timern, weil createNotesSaver setTimeout für die Debounce nutzt.
// vi.advanceTimersByTime() steuert die Zeit deterministisch.
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createNotesSaver — Debounce-Verhalten', () => {
  it('schedule mehrfach in <500ms = genau ein Save mit dem letzten Wert', () => {
    const saveFn = vi.fn();
    const saver = createNotesSaver({ saveFn, delayMs: 500 });

    saver.schedule('a');
    vi.advanceTimersByTime(100);
    saver.schedule('ab');
    vi.advanceTimersByTime(100);
    saver.schedule('abc');
    vi.advanceTimersByTime(500);

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith('abc');
  });

  it('zwei getrennte Edit-Bursts ergeben zwei Saves', () => {
    const saveFn = vi.fn();
    const saver = createNotesSaver({ saveFn, delayMs: 500 });

    saver.schedule('erster');
    vi.advanceTimersByTime(500);
    saver.schedule('zweiter');
    vi.advanceTimersByTime(500);

    expect(saveFn).toHaveBeenCalledTimes(2);
    expect(saveFn).toHaveBeenNthCalledWith(1, 'erster');
    expect(saveFn).toHaveBeenNthCalledWith(2, 'zweiter');
  });

  it('flush() schreibt sofort und cancelt den Timer', () => {
    const saveFn = vi.fn();
    const saver = createNotesSaver({ saveFn, delayMs: 500 });

    saver.schedule('teil');
    saver.flush();
    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith('teil');

    // Der Timer war vorher gesetzt — vorrücken darf KEINEN zweiten Save auslösen.
    vi.advanceTimersByTime(1000);
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it('flush() ist No-op, wenn nichts wartet', () => {
    const saveFn = vi.fn();
    const saver = createNotesSaver({ saveFn, delayMs: 500 });
    saver.flush();
    expect(saveFn).not.toHaveBeenCalled();
  });

  it('flush() ist No-op, wenn der pending Wert bereits gespeichert wurde', () => {
    const saveFn = vi.fn();
    const saver = createNotesSaver({ saveFn, delayMs: 500 });

    saver.schedule('x');
    vi.advanceTimersByTime(500);
    expect(saveFn).toHaveBeenCalledTimes(1);

    // Erneuter flush ohne neue Eingabe → kein zweiter Save.
    saver.flush();
    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it('idempotent: derselbe Wert nochmal wird nicht erneut gespeichert', () => {
    const saveFn = vi.fn();
    const saver = createNotesSaver({ saveFn, delayMs: 500 });

    saver.schedule('hallo');
    vi.advanceTimersByTime(500);
    saver.schedule('hallo');
    vi.advanceTimersByTime(500);

    expect(saveFn).toHaveBeenCalledTimes(1);
  });

  it('dispose() cancelt einen wartenden Timer ohne zu flushen', () => {
    const saveFn = vi.fn();
    const saver = createNotesSaver({ saveFn, delayMs: 500 });

    saver.schedule('verworfen');
    saver.dispose();
    vi.advanceTimersByTime(1000);

    expect(saveFn).not.toHaveBeenCalled();
  });

  it('benutzerdefinierter delayMs wird respektiert', () => {
    const saveFn = vi.fn();
    const saver = createNotesSaver({ saveFn, delayMs: 100 });

    saver.schedule('x');
    vi.advanceTimersByTime(50);
    expect(saveFn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(saveFn).toHaveBeenCalledTimes(1);
  });
});

// Sprint-3-Test-Scope laut Briefing: „mehrere Inputs in 500ms ergeben einen Save".
describe('Sprint-3-Akzeptanz', () => {
  it('20 Tipper innerhalb von 500ms → ein Save mit dem finalen Wert', () => {
    const saveFn = vi.fn();
    const saver = createNotesSaver({ saveFn, delayMs: 500 });

    let buffer = '';
    for (let i = 0; i < 20; i++) {
      buffer += String.fromCharCode(97 + (i % 26));
      saver.schedule(buffer);
      vi.advanceTimersByTime(20); // 20 × 20ms = 400ms — innerhalb der 500ms-Frist
    }
    vi.advanceTimersByTime(500);

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith(buffer);
  });

  it('Unmount-Simulation: schedule + flush() = sofortiger Save', () => {
    const saveFn = vi.fn();
    const saver = createNotesSaver({ saveFn, delayMs: 500 });

    saver.schedule('letzter Tipp vor Unmount');
    // Unmount würde useEffect-Cleanup callen → saver.flush()
    saver.flush();

    expect(saveFn).toHaveBeenCalledTimes(1);
    expect(saveFn).toHaveBeenCalledWith('letzter Tipp vor Unmount');
  });
});
