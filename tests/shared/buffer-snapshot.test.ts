import { describe, it, expect } from 'vitest';
import {
  trimBufferSnapshot,
  MAX_BUFFER_SNAPSHOT_LINES,
  MAX_BUFFER_SNAPSHOT_BYTES,
} from '../../src/shared/buffer-snapshot';

// Phase-2 Season-32: Pure-Logik-Tests fuer den Buffer-Snapshot-Trim.
// Deckt die drei Pfade ab — Leerfall (Skip-Persist), Line-Cap (Last-N
// gewinnt) und Byte-Cap (defensives Vorne-Wegschneiden) — plus die
// Kombination beider Caps.

describe('trimBufferSnapshot', () => {
  it('liefert leeren String bei leerer Eingabe', () => {
    expect(trimBufferSnapshot('')).toBe('');
  });

  it('liefert leeren String bei reinem Whitespace (skip persist)', () => {
    expect(trimBufferSnapshot('   \n  \n\n')).toBe('');
  });

  it('reicht kleinen Snapshot unveraendert durch', () => {
    const raw = 'line1\nline2\nline3';
    expect(trimBufferSnapshot(raw)).toBe(raw);
  });

  it('schneidet auf Last-N-Zeilen, wenn ueber Line-Cap', () => {
    const lines = Array.from({ length: 50 }, (_, i) => `line${i}`);
    const raw = lines.join('\n');
    const result = trimBufferSnapshot(raw, { maxLines: 5 });
    // Last-5: line45..line49
    expect(result).toBe(['line45', 'line46', 'line47', 'line48', 'line49'].join('\n'));
  });

  it('behaelt alle Zeilen, wenn Line-Anzahl <= Cap', () => {
    const raw = 'a\nb\nc';
    expect(trimBufferSnapshot(raw, { maxLines: 5 })).toBe(raw);
  });

  it('schneidet vorne auf Byte-Cap, wenn ueber Byte-Limit', () => {
    // 100 Zeilen je 100 Bytes = 10 KB (plus 99 \n). Cap 1 KB.
    const line = 'x'.repeat(100);
    const raw = Array.from({ length: 100 }, () => line).join('\n');
    const result = trimBufferSnapshot(raw, { maxLines: 1000, maxBytes: 1024 });
    const bytes = new TextEncoder().encode(result).length;
    expect(bytes).toBeLessThanOrEqual(1024);
    expect(result.length).toBeGreaterThan(0);
    // Trim soll vom Ende kommen — die letzten Zeilen mussten bleiben.
    expect(result.endsWith(line)).toBe(true);
  });

  it('respektiert Multi-Byte-UTF-8 beim Byte-Cap', () => {
    // 100 Zeilen mit Emoji (4 Bytes pro 😀) — String.length vs UTF-8-Bytes
    // unterscheiden sich, der Cap muss die echten Bytes zaehlen.
    const line = '😀'.repeat(50); // 200 UTF-8-Bytes pro Zeile
    const raw = Array.from({ length: 100 }, () => line).join('\n');
    const result = trimBufferSnapshot(raw, { maxLines: 1000, maxBytes: 2048 });
    const bytes = new TextEncoder().encode(result).length;
    expect(bytes).toBeLessThanOrEqual(2048);
  });

  it('kombiniert Line-Cap + Byte-Cap (Line zuerst, dann Bytes)', () => {
    // 5000 kurze Zeilen, Line-Cap 1000, Byte-Cap so eng dass auch
    // nach Line-Trim noch Byte-Trim noetig ist.
    const lines = Array.from({ length: 5000 }, (_, i) => `line${i.toString().padStart(4, '0')}`);
    const raw = lines.join('\n');
    const result = trimBufferSnapshot(raw, { maxLines: 1000, maxBytes: 5000 });
    const bytes = new TextEncoder().encode(result).length;
    expect(bytes).toBeLessThanOrEqual(5000);
    // Letzte Zeile muss erhalten geblieben sein
    expect(result.endsWith('line4999')).toBe(true);
  });

  it('exportierte Konstanten haben sinnvolle Defaults', () => {
    expect(MAX_BUFFER_SNAPSHOT_LINES).toBe(2000);
    expect(MAX_BUFFER_SNAPSHOT_BYTES).toBe(256 * 1024);
  });
});
