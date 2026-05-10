import { describe, it, expect } from 'vitest';
import { parseJsonlSegment, normalizeTimestamp } from '../../src/main/jsonl/parser';

// JSONL-Parser-Tests (Sprint 5).
// Testen die Pure-Logik gegen synthetische NDJSON-Strings — kein echtes Filesystem,
// kein chokidar.

const buildLine = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    type: 'assistant',
    timestamp: '2026-05-10T10:00:00.000Z',
    message: {
      model: 'claude-sonnet-4-6',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 10,
        cache_read_input_tokens: 5,
      },
    },
    ...overrides,
  });

describe('parseJsonlSegment — happy path', () => {
  it('parst eine vollständige assistant-Zeile mit usage', () => {
    const segment = buildLine() + '\n';
    const result = parseJsonlSegment(segment);
    expect(result.messages).toHaveLength(1);
    const msg = result.messages[0]!;
    expect(msg.model).toBe('claude-sonnet-4-6');
    expect(msg.inputTokens).toBe(100);
    expect(msg.outputTokens).toBe(50);
    expect(msg.cacheCreationInputTokens).toBe(10);
    expect(msg.cacheReadInputTokens).toBe(5);
    expect(msg.totalTokens).toBe(115); // 100 + 10 + 5
    expect(msg.ts).toBe(Date.parse('2026-05-10T10:00:00.000Z'));
    expect(result.consumedBytes).toBe(Buffer.byteLength(segment, 'utf8'));
    expect(result.warnings).toEqual([]);
  });

  it('parst mehrere Zeilen in einem Segment', () => {
    const segment = buildLine() + '\n' + buildLine({ message: { model: 'claude-opus-4-7', usage: { input_tokens: 200 } } }) + '\n';
    const result = parseJsonlSegment(segment);
    expect(result.messages).toHaveLength(2);
    expect(result.messages[1]!.model).toBe('claude-opus-4-7');
    expect(result.messages[1]!.totalTokens).toBe(200);
  });

  it('verarbeitet Leerzeilen zwischen Records', () => {
    const segment = buildLine() + '\n\n' + buildLine() + '\n';
    const result = parseJsonlSegment(segment);
    expect(result.messages).toHaveLength(2);
    expect(result.warnings).toEqual([]);
  });
});

describe('parseJsonlSegment — Drop-Pfade', () => {
  it('droppt user-Messages (kein Token-Track)', () => {
    const segment = JSON.stringify({ type: 'user', timestamp: '2026-05-10T10:00:00.000Z', message: { content: 'hi' } }) + '\n';
    const result = parseJsonlSegment(segment);
    expect(result.messages).toHaveLength(0);
  });

  it('droppt Zeilen ohne usage-Feld still', () => {
    const segment = JSON.stringify({ type: 'assistant', timestamp: '2026-05-10T10:00:00.000Z', message: { model: 'claude-sonnet-4-6' } }) + '\n';
    const result = parseJsonlSegment(segment);
    expect(result.messages).toHaveLength(0);
    expect(result.warnings).toEqual([]); // usage-fehlt ist legitim, keine Warning
  });

  it('warnt bei kaputtem JSON, droppt die Zeile, parst nachfolgende sauber weiter', () => {
    const segment = '{ kein json' + '\n' + buildLine() + '\n';
    const result = parseJsonlSegment(segment);
    expect(result.messages).toHaveLength(1);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/kein gültiges JSON/);
  });

  it('warnt bei Schema-Verstoß (negative input_tokens)', () => {
    const segment = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-05-10T10:00:00.000Z',
      message: { model: 'claude-sonnet-4-6', usage: { input_tokens: -5 } },
    }) + '\n';
    const result = parseJsonlSegment(segment);
    expect(result.messages).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/Schema-Verstoß/);
  });

  it('toleriert unbekannte Felder (passthrough)', () => {
    const segment = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-05-10T10:00:00.000Z',
      // fictives Future-Feld, das claude-code irgendwann mal liefern könnte
      experimentalToolCallId: 'abc-123',
      message: {
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 100 },
        weirdNewField: { foo: 'bar' },
      },
    }) + '\n';
    const result = parseJsonlSegment(segment);
    expect(result.messages).toHaveLength(1);
    expect(result.warnings).toEqual([]);
  });

  it('droppt Zeilen ohne timestamp', () => {
    const segment = JSON.stringify({
      type: 'assistant',
      message: { model: 'claude-sonnet-4-6', usage: { input_tokens: 100 } },
    }) + '\n';
    const result = parseJsonlSegment(segment);
    expect(result.messages).toHaveLength(0);
  });
});

describe('parseJsonlSegment — Cursor-Verhalten', () => {
  it('lässt eine unvollständige letzte Zeile (kein \\n) im Buffer', () => {
    const completeLine = buildLine() + '\n';
    const partialLine = buildLine({ message: { model: 'claude-opus-4-7', usage: { input_tokens: 200 } } });
    const segment = completeLine + partialLine; // ohne abschließendes \n
    const result = parseJsonlSegment(segment);
    expect(result.messages).toHaveLength(1); // nur die komplette Zeile
    expect(result.consumedBytes).toBe(Buffer.byteLength(completeLine, 'utf8'));
  });

  it('liefert consumedBytes=0 bei leerem Segment', () => {
    const result = parseJsonlSegment('');
    expect(result.messages).toHaveLength(0);
    expect(result.consumedBytes).toBe(0);
  });

  it('berücksichtigt Multi-Byte-Codepoints korrekt im Byte-Counter', () => {
    const lineContent = JSON.stringify({
      type: 'assistant',
      timestamp: '2026-05-10T10:00:00.000Z',
      message: {
        model: 'claude-sonnet-4-6',
        usage: { input_tokens: 1 },
        // Umlaut + Emoji = Multi-Byte-Codepoints
        note: 'Schöner Tag 🌞',
      },
    });
    const segment = lineContent + '\n';
    const result = parseJsonlSegment(segment);
    expect(result.messages).toHaveLength(1);
    expect(result.consumedBytes).toBe(Buffer.byteLength(segment, 'utf8'));
    // Sicherstellen, dass byte-count > char-count ist (sonst könnte der Test bei
    // versehentlichem String-length-Drift unentdeckt bleiben).
    expect(result.consumedBytes).toBeGreaterThan(segment.length);
  });
});

describe('normalizeTimestamp', () => {
  it('akzeptiert ISO-Strings', () => {
    expect(normalizeTimestamp('2026-05-10T10:00:00.000Z')).toBe(Date.parse('2026-05-10T10:00:00.000Z'));
  });

  it('akzeptiert epoch-ms-Zahlen', () => {
    expect(normalizeTimestamp(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('liefert null für ungültige Werte', () => {
    expect(normalizeTimestamp(undefined)).toBeNull();
    expect(normalizeTimestamp('')).toBeNull();
    expect(normalizeTimestamp('garbage')).toBeNull();
    expect(normalizeTimestamp(NaN)).toBeNull();
  });
});
