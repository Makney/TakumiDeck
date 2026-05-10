import { z } from 'zod';
import { JsonlMessageSchema } from '@shared/schemas';
import type { ParsedJsonlMessage } from '@shared/types';

// JSONL-Parser für claude-codes Per-Session-Logs.
//
// Der Parser ist reine Logik — Datei-IO und Byte-Offset-Persistenz machen Watcher
// und Repository. Diese Datei kümmert sich nur darum, ein UTF-8-Segment in Messages
// zu zerlegen (NDJSON), kaputte/unvollständige Zeilen zu droppen und den nächsten
// Lese-Offset relativ zum Segment-Anfang zurückzuliefern.
//
// Driver-Injection für Datei-Reads ist `JsonlReadDriver` weiter unten — Tests
// gegen synthetische Strings (kein echtes Filesystem). Watcher und Tests teilen
// sich `parseJsonlSegment` als Single-Source-of-Truth.

// Welche claude-code-Message-Typen tragen Token-Daten?
// `assistant` ist die einzig sicher relevante Quelle für message.usage; `user` und
// `system` haben keine usage-Felder und werden vom JsonlMessageSchema schon ohne
// `message.usage` rausgefiltert. Wir filtern aber zusätzlich nach Type, damit
// zukünftige Erweiterungen (z.B. `tool_use` mit usage) bewusst hinzugefügt werden.
const TOKEN_BEARING_TYPES = new Set<string>(['assistant']);

export interface ParseSegmentResult {
  messages: ParsedJsonlMessage[];
  // Anzahl Bytes, die innerhalb des Segments verarbeitet wurden — der Watcher addiert
  // das auf den Datei-Start-Offset, um den neuen persistierten Offset zu erhalten.
  // Eine angefangene letzte Zeile (ohne \n) wird NICHT mitgezählt — beim nächsten
  // Watcher-Trigger wird sie als „neue Daten" zusammen mit dem Rest erneut gelesen.
  consumedBytes: number;
  warnings: string[];
}

// Pure-Funktion: Segment + Anfangs-Offset → geparste Messages + verbrauchte Bytes.
// `segment` ist der UTF-8-decodierte Tail-Read der JSONL-Datei ab dem letzten
// persistierten Offset. Die letzten unvollständigen Bytes (= keine \n nach der
// letzten kompletten Zeile) bleiben unverarbeitet, damit der Watcher sie beim
// nächsten Read komplettiert sieht.
export function parseJsonlSegment(segment: string): ParseSegmentResult {
  const messages: ParsedJsonlMessage[] = [];
  const warnings: string[] = [];

  if (segment.length === 0) {
    return { messages, consumedBytes: 0, warnings };
  }

  // Wir splitten manuell, weil wir die exakten Byte-Längen pro Zeile (inkl. \n)
  // brauchen, um den neuen Offset korrekt zurückzugeben. Buffer.byteLength behandelt
  // Multi-Byte-Codepoints korrekt — String.length wäre falsch bei Emojis/Umlauten.
  let consumedBytes = 0;
  let cursor = 0;

  while (cursor < segment.length) {
    const newlineIdx = segment.indexOf('\n', cursor);
    if (newlineIdx === -1) {
      // Unvollständige letzte Zeile — bleibt im Buffer für den nächsten Read.
      break;
    }
    const line = segment.slice(cursor, newlineIdx);
    const lineWithNewline = segment.slice(cursor, newlineIdx + 1);
    cursor = newlineIdx + 1;
    consumedBytes += Buffer.byteLength(lineWithNewline, 'utf8');

    const trimmed = line.trim();
    if (trimmed.length === 0) continue; // Leerzeile zwischen Records — überspringen.

    let raw: unknown;
    try {
      raw = JSON.parse(trimmed);
    } catch (e) {
      warnings.push(`Zeile ist kein gültiges JSON: ${truncate(trimmed, 80)}`);
      continue;
    }

    const validated = JsonlMessageSchema.safeParse(raw);
    if (!validated.success) {
      warnings.push(
        `Schema-Verstoß: ${zodIssueSummary(validated.error)} — ${truncate(trimmed, 80)}`,
      );
      continue;
    }

    const parsed = extractMessage(validated.data, line);
    if (parsed) messages.push(parsed);
  }

  return { messages, consumedBytes, warnings };
}

function extractMessage(
  data: z.infer<typeof JsonlMessageSchema>,
  rawLine: string,
): ParsedJsonlMessage | null {
  // Filter 1: Nur Message-Typen mit usage-Feld berücksichtigen.
  if (data.type !== undefined && !TOKEN_BEARING_TYPES.has(data.type)) {
    return null;
  }

  const usage = data.message?.usage;
  if (!usage) return null;

  const ts = normalizeTimestamp(data.timestamp);
  if (ts === null) return null;

  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const totalTokens = inputTokens + cacheCreation + cacheRead;

  return {
    ts,
    model: data.message?.model ?? null,
    inputTokens,
    outputTokens,
    cacheCreationInputTokens: cacheCreation,
    cacheReadInputTokens: cacheRead,
    totalTokens,
    rawLine,
    // Sprint-6-Hotfix: claude-codes Session-UUID weiterreichen für den
    // Watcher-Backfill von sessions.claude_session_id.
    sessionId: data.sessionId ?? null,
  };
}

// claude-code schreibt timestamps als ISO-String; ältere Versionen evtl. epoch-ms.
// Wir normalisieren auf epoch-ms — die SQLite-Spalten sind alle int(epoch).
export function normalizeTimestamp(input: unknown): number | null {
  if (typeof input === 'number' && Number.isFinite(input)) {
    return input;
  }
  if (typeof input === 'string' && input.length > 0) {
    const parsed = Date.parse(input);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function truncate(s: string, maxLen: number): string {
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

function zodIssueSummary(error: z.ZodError): string {
  const first = error.issues[0];
  if (!first) return 'unbekannter zod-Fehler';
  return `${first.path.join('.') || '<root>'}: ${first.message}`;
}

// --- Filesystem-Driver ----------------------------------------------------

// Schmales Interface für „lies Bytes aus einer Datei ab Offset". Tests injizieren
// eine in-memory-Map; Production nutzt `realJsonlReadDriver`, der fs.promises.open
// + read über die NodeJS-File-Handles benutzt.
export interface JsonlReadDriver {
  // Returnt das Tail-Segment ab `fromOffset` als UTF-8-String plus die aktuelle
  // Datei-Größe. Wenn die Datei kleiner als fromOffset ist (z.B. truncate), wird
  // ab Offset 0 gelesen und truncated=true mitgegeben — der Watcher resettet dann
  // den persistierten Offset.
  readTail(
    filePath: string,
    fromOffset: number,
  ): Promise<{ segment: string; fileSize: number; truncated: boolean }>;
}

import { promises as fs } from 'node:fs';

export const realJsonlReadDriver: JsonlReadDriver = {
  async readTail(filePath, fromOffset) {
    const stat = await fs.stat(filePath);
    const fileSize = stat.size;
    if (fileSize === 0) {
      return { segment: '', fileSize: 0, truncated: false };
    }
    const truncated = fromOffset > fileSize;
    const startOffset = truncated ? 0 : fromOffset;
    if (startOffset >= fileSize) {
      return { segment: '', fileSize, truncated };
    }
    const handle = await fs.open(filePath, 'r');
    try {
      const length = fileSize - startOffset;
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, startOffset);
      return {
        segment: buffer.toString('utf8'),
        fileSize,
        truncated,
      };
    } finally {
      await handle.close();
    }
  },
};
