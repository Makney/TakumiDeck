// Phase 2 Season 33: Pure-Helper fuer Terminal-Buffer-Snapshots.
//
// Verantwortlich fuer das Trimmen eines vom @xterm/addon-serialize
// produzierten Strings auf zwei Schwellen:
//   1. MAX_LINES: Hoechstens N Zeilen am unteren Ende behalten (Newer
//      gewinnt). xterm's scrollback steht auf 5000 (Season 28), 2000
//      Zeilen sind das obere Drittel — der frische Output, Permission-
//      Antworten und der letzte Plan-Block sitzen darin.
//   2. MAX_BYTES: Defensiver Byte-Cap (UTF-8) als Schutz gegen patho-
//      logische Faelle (lange Color-Code-Stacks, riesige `\x1b[...]`-
//      Sequenzen aus TUI-Apps). Greift nach dem Line-Trim und schneidet
//      vorne weiter ab, bis die Snapshot-Bytes unter dem Cap sitzen.
//
// Der Helper verlangt keinen xterm-Kontext und ist deshalb in `shared`
// — beide Tests (Renderer-Cleanup-Pfad, Backend-Cap-Sanity) und der
// Renderer selbst koennen ihn nutzen.

// Top-N Zeilen ab unten. Bei 2000 × ~200 Zeichen sind das ~400 KB als
// Worst-Case (alle Zeilen voll); typische pwsh-Sessions liegen unter
// 50 KB. Der Byte-Cap unten schneidet den theoretischen Worst-Case auf
// 256 KB nach.
export const MAX_BUFFER_SNAPSHOT_LINES = 2000;
// 256 KiB als Top-Cap — bei 50 archivierten Terminal-Sessions sind das
// max. 12 MiB DB-Wachstum. Real liegt der Schnitt deutlich darunter,
// weil die meisten Terminal-Sessions kurze ad-hoc-Shells sind.
export const MAX_BUFFER_SNAPSHOT_BYTES = 256 * 1024;

export interface TrimBufferOptions {
  maxLines?: number;
  maxBytes?: number;
}

// Schneidet einen Buffer-Snapshot auf die Last-N-Zeilen + Byte-Cap.
// Liefert den getrimten Snapshot zurueck. Bei leerer Eingabe oder einem
// effektiv leeren Snapshot (nur Whitespace) gibt es einen leeren String
// zurueck — der Caller entscheidet, ob er den Save-IPC ueberhaupt feuert.
export function trimBufferSnapshot(
  raw: string,
  options: TrimBufferOptions = {},
): string {
  const maxLines = options.maxLines ?? MAX_BUFFER_SNAPSHOT_LINES;
  const maxBytes = options.maxBytes ?? MAX_BUFFER_SNAPSHOT_BYTES;
  if (raw.length === 0) return '';
  // Reine Whitespace-Snapshots (z.B. StrictMode-Double-Mount mit terminal,
  // das noch keine PTY-Daten gesehen hat) gar nicht erst persistieren.
  if (raw.trim().length === 0) return '';

  // Line-Trim: serialize() liefert ANSI-haltigen Text mit \n als
  // Zeilentrenner. \r\n behandeln wir wie \n (split toleriert beide).
  // Das Splitten via /\r?\n/ ist hier OK, weil xterm intern mit \n
  // arbeitet — ein \r ohne \n ist eine ANSI-Bewegung, kein Zeilenbruch.
  const lines = raw.split(/\r?\n/);
  let trimmedLines = lines;
  if (lines.length > maxLines) {
    trimmedLines = lines.slice(lines.length - maxLines);
  }

  let snapshot = trimmedLines.join('\n');

  // Byte-Cap: solange die UTF-8-Laenge ueber dem Cap liegt, vorne
  // Zeilen wegschneiden. Wir nutzen TextEncoder fuer exakte Bytes —
  // String.length zaehlt UTF-16 Code Units und ist bei Color-Codes
  // (alles ASCII) zwar gleich, bricht aber bei Multi-Byte-Inhalten.
  const encoder = new TextEncoder();
  let bytes = encoder.encode(snapshot).length;
  if (bytes <= maxBytes) return snapshot;

  // Heuristik: ab welchem Index muessen wir starten? Wir kennen die
  // Bytes der Gesamtmenge und das Cap — der Anteil drueber kommt
  // vorne weg. Beim Worst-Case (alle Zeilen gleichlang) braucht es
  // einen Pass; bei ungleicher Verteilung schneiden wir lieber
  // konservativ und iterieren ein paar Schritte, statt eine Zeile
  // zu wenig wegzunehmen.
  let startIdx = 0;
  while (bytes > maxBytes && startIdx < trimmedLines.length - 1) {
    // Pro Iteration ein Block von 5 % der Zeilen wegnehmen — das
    // konvergiert in <20 Schritten auf den Cap und vermeidet das
    // Worst-Case-O(n)-pro-Byte.
    const step = Math.max(1, Math.floor(trimmedLines.length * 0.05));
    startIdx += step;
    if (startIdx >= trimmedLines.length) {
      startIdx = trimmedLines.length - 1;
    }
    snapshot = trimmedLines.slice(startIdx).join('\n');
    bytes = encoder.encode(snapshot).length;
  }

  // Sicherheitsnetz: falls der letzte Block alleine schon ueber dem
  // Cap liegt (sehr unrealistisch — eine xterm-Zeile waere dann ueber
  // 256 KiB), den Snapshot von rechts auf den Cap kappen.
  if (bytes > maxBytes) {
    const encoded = encoder.encode(snapshot);
    const trimmed = encoded.slice(encoded.length - maxBytes);
    snapshot = new TextDecoder('utf-8', { fatal: false }).decode(trimmed);
    // Schneidet der Byte-Slice mitten in eine Multi-Byte-UTF-8-Sequenz,
    // ersetzt der Decoder die Teilsequenz durch U+FFFD (3 Bytes beim
    // Re-Encode) — das Ergebnis kann dadurch wieder knapp ueber den Cap
    // rutschen. Vorne zeichenweise nachkappen, bis es wirklich passt.
    while (encoder.encode(snapshot).length > maxBytes && snapshot.length > 0) {
      snapshot = snapshot.slice(1);
    }
  }

  return snapshot;
}
