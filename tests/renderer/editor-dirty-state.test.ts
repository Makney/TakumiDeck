import { describe, it, expect } from 'vitest';
import {
  isDirty,
  makeEditorState,
  markSaved,
  updateBuffer,
} from '../../src/renderer/components/editorDirtyState';

// Sprint 7 — Pure-Logik-Tests für das Dirty-Tracking eines Editor-Tabs (Q1
// Variante A: manueller Save mit „unsaved"-Indikator).

describe('makeEditorState', () => {
  it('initialer Stand ist clean', () => {
    const s = makeEditorState('hello');
    expect(s.saved).toBe('hello');
    expect(s.buffer).toBe('hello');
    expect(isDirty(s)).toBe(false);
  });

  it('initialisiert auch leere Strings korrekt', () => {
    const s = makeEditorState('');
    expect(isDirty(s)).toBe(false);
  });
});

describe('updateBuffer', () => {
  it('setzt buffer ohne saved zu berühren', () => {
    const s = makeEditorState('hello');
    const next = updateBuffer(s, 'hello world');
    expect(next.buffer).toBe('hello world');
    expect(next.saved).toBe('hello');
    expect(isDirty(next)).toBe(true);
  });

  it('returnt dieselbe Referenz, wenn der Wert identisch ist', () => {
    const s = makeEditorState('hello');
    const next = updateBuffer(s, 'hello');
    // Identitäts-Vergleich, keine Wert-Gleichheit — wir wollen, dass kein
    // React-Re-Render durch sinnlose State-Updates getriggert wird.
    expect(next).toBe(s);
  });

  it('Zurück-Tippen auf den saved-Wert entfernt dirty', () => {
    let s = makeEditorState('hello');
    s = updateBuffer(s, 'helloX');
    expect(isDirty(s)).toBe(true);
    s = updateBuffer(s, 'hello');
    expect(isDirty(s)).toBe(false);
  });
});

describe('markSaved', () => {
  it('hebt saved auf den geschriebenen Wert', () => {
    let s = makeEditorState('hello');
    s = updateBuffer(s, 'hello world');
    s = markSaved(s, 'hello world');
    expect(s.saved).toBe('hello world');
    expect(s.buffer).toBe('hello world');
    expect(isDirty(s)).toBe(false);
  });

  it('lässt buffer unangetastet, wenn der User zwischen save-trigger und save-success weiter getippt hat', () => {
    let s = makeEditorState('hello');
    // User tippt 'hello world' und triggert Save.
    s = updateBuffer(s, 'hello world');
    // Während der Save läuft, tippt der User weiter zu 'hello world!'.
    s = updateBuffer(s, 'hello world!');
    // Save-Success kommt zurück mit dem Wert, der zum Save-Zeitpunkt galt.
    s = markSaved(s, 'hello world');
    expect(s.saved).toBe('hello world');
    expect(s.buffer).toBe('hello world!');
    // Resultat: weiterhin dirty, weil buffer ≠ saved.
    expect(isDirty(s)).toBe(true);
  });

  it('returnt dieselbe Referenz, wenn saved und buffer schon identisch sind', () => {
    const s = makeEditorState('hello');
    const next = markSaved(s, 'hello');
    expect(next).toBe(s);
  });
});

describe('isDirty', () => {
  it('false bei Identität', () => {
    expect(isDirty({ saved: 'x', buffer: 'x' })).toBe(false);
  });

  it('true bei Unterschied', () => {
    expect(isDirty({ saved: 'x', buffer: 'xy' })).toBe(true);
  });

  it('Whitespace-Unterschiede zählen als dirty', () => {
    expect(isDirty({ saved: 'x', buffer: 'x ' })).toBe(true);
    expect(isDirty({ saved: 'x\n', buffer: 'x' })).toBe(true);
  });
});
