// Phase 2 Season 21 — Pure Logik fuer die Docs-Sync-Session.
//
// Diese Datei lebt im `shared/`-Layer, weil sowohl der Main (IPC-Status-Resolver
// + Hashing) als auch der Renderer (Modal-Status-Anzeige + Prompt-Send) die
// Helper hier nutzen:
//   - `DOCS_SYNC_FILES`        — Whitelist der vier Doku-Dateien
//   - `computeFileSyncStatus`  — vergleicht Original-Hash gegen Summary-Frontmatter
//   - `parseSummaryFrontmatter`— extrahiert source_hash + summarized_at aus dem
//     Frontmatter-Block einer Summary-Datei (lockerer Parser, kein gray-matter)
//   - `buildDocsSyncPrompt`    — baut den deutschen Prompt aus der Subset-Auswahl
//
// Die Werte sind als Konstanten exportiert, weil alle vier Files projekt-relativ
// stabil sind. Eine User-Konfiguration ist explizit nicht vorgesehen (analog zur
// Easter-Egg-Werk-Liste aus Season 19).

export interface DocsSyncFileDescriptor {
  // Dateiname ohne Verzeichnis — wird gleichzeitig als Anzeige-Label im Modal
  // und als Basename fuer die Summary verwendet.
  name: string;
  // Projekt-relativer Pfad zur Original-Doku (Forward-Slash, IPC-Konvention).
  sourcePath: string;
  // Projekt-relativer Pfad, an dem die Summary erwartet wird.
  summaryPath: string;
}

// Vier Doku-Dateien aus dem Roadmap-Eintrag (PHASE2.md Bereich „Docs-Sync").
// Reihenfolge folgt dem Doku-Stack: CHANGELOG zuerst (historischer Blick),
// FEATURES als Status-Snapshot, dann die zwei Reflexions-Files.
export const DOCS_SYNC_FILES: DocsSyncFileDescriptor[] = [
  {
    name: 'CHANGELOG.md',
    sourcePath: 'docs/CHANGELOG.md',
    summaryPath: 'docs/SUMMARIES/CHANGELOG.md',
  },
  {
    name: 'FEATURES.md',
    sourcePath: 'docs/FEATURES.md',
    summaryPath: 'docs/SUMMARIES/FEATURES.md',
  },
  {
    name: 'TECH_SCHULDEN.md',
    sourcePath: 'docs/TECH_SCHULDEN.md',
    summaryPath: 'docs/SUMMARIES/TECH_SCHULDEN.md',
  },
  {
    name: 'ENTSCHEIDUNGEN.md',
    sourcePath: 'docs/ENTSCHEIDUNGEN.md',
    summaryPath: 'docs/SUMMARIES/ENTSCHEIDUNGEN.md',
  },
];

// Status pro Datei. `missing-source` heisst die Original-Doku selbst fehlt
// (z.B. Projekt hat noch keine CHANGELOG.md) — Auswahl bleibt moeglich, aber
// das Modal markiert die Zeile als nicht-sinnvoll. `missing-summary` ist der
// Default-Zustand bevor je eine Sync lief.
export type DocsSyncFileState =
  | 'missing-source'
  | 'missing-summary'
  | 'stale'
  | 'fresh';

export interface DocsSyncFileStatus {
  name: string;
  sourcePath: string;
  summaryPath: string;
  state: DocsSyncFileState;
  // ISO-8601-String aus dem Summary-Frontmatter, falls vorhanden. Renderer
  // zeigt einen menschenlesbaren Hinweis („vor 3 Tagen") daneben.
  summarizedAt: string | null;
}

// Frontmatter-Format, das eine Docs-Sync-Session schreiben muss:
//
//   ---
//   source: docs/CHANGELOG.md
//   source_hash: <sha256-hex der Original-Datei zum Sync-Zeitpunkt>
//   summarized_at: 2026-05-17T14:30:00Z
//   ---
//
// Andere Felder werden ignoriert; fehlende Felder fuehren zu `null` und das
// Modal zeigt die Summary als „veraltet" (= stale), damit der naechste Sync
// die Datei nachzieht.
export interface SummaryFrontmatter {
  source_hash: string | null;
  summarized_at: string | null;
}

// Lockerer Frontmatter-Parser: erwartet den Block `---\n...\n---` am Datei-
// Anfang und liest `key: value`-Paare. Nicht-string-Werte (z.B. YAML-Maps)
// werden ignoriert; wir brauchen hier nur zwei flache String-Felder. Wenn das
// File ueberhaupt keinen Frontmatter-Block hat, gibt es `null` zurueck — der
// Caller behandelt das wie eine fehlende Summary (= stale).
export function parseSummaryFrontmatter(content: string): SummaryFrontmatter | null {
  // Defensive: BOM (U+FEFF) am Datei-Anfang abstreifen, falls die Summary-
  // Datei mit Encoding-Header geschrieben wurde.
  const trimmed = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  if (!trimmed.startsWith('---')) return null;
  // Erste Zeile (`---`) ueberspringen, dann bis zum naechsten `---` lesen.
  const newlineAfterOpen = trimmed.indexOf('\n', 3);
  if (newlineAfterOpen === -1) return null;
  const rest = trimmed.slice(newlineAfterOpen + 1);
  const closeMatch = rest.match(/^---\s*$/m);
  if (!closeMatch || closeMatch.index === undefined) return null;
  const block = rest.slice(0, closeMatch.index);
  const result: SummaryFrontmatter = { source_hash: null, summarized_at: null };
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.+?)\s*$/);
    if (!m || m[1] === undefined || m[2] === undefined) continue;
    const key = m[1];
    // YAML-Strings koennen in Anfuehrungszeichen stehen — die strippen wir
    // defensive ab, weil sowohl `summarized_at: 2026-...` als auch
    // `summarized_at: "2026-..."` legitime Schreibweisen sind.
    let value = m[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key === 'source_hash') result.source_hash = value;
    if (key === 'summarized_at') result.summarized_at = value;
  }
  return result;
}

// Pure Status-Berechnung: bekommt das Lookup-Ergebnis aus dem Filesystem
// (Original-Hash + Summary-Inhalt) und entscheidet die Stufe. Wird vom Main-
// IPC-Handler gerufen, der die FS-Reads selbst orchestriert.
//
//   sourceHash    null  → Original existiert nicht (state = missing-source)
//   summaryRaw    null  → Summary-Datei existiert nicht (state = missing-summary)
//   sourceHash != summary.source_hash → Original wurde geaendert (state = stale)
//   Frontmatter fehlt / source_hash fehlt → stale (defensive)
//   sonst → fresh
export function computeFileSyncStatus(args: {
  descriptor: DocsSyncFileDescriptor;
  sourceHash: string | null;
  summaryRaw: string | null;
}): DocsSyncFileStatus {
  const { descriptor, sourceHash, summaryRaw } = args;
  if (sourceHash === null) {
    return {
      name: descriptor.name,
      sourcePath: descriptor.sourcePath,
      summaryPath: descriptor.summaryPath,
      state: 'missing-source',
      summarizedAt: null,
    };
  }
  if (summaryRaw === null) {
    return {
      name: descriptor.name,
      sourcePath: descriptor.sourcePath,
      summaryPath: descriptor.summaryPath,
      state: 'missing-summary',
      summarizedAt: null,
    };
  }
  const fm = parseSummaryFrontmatter(summaryRaw);
  const summarizedAt = fm?.summarized_at ?? null;
  if (!fm || fm.source_hash === null) {
    return {
      name: descriptor.name,
      sourcePath: descriptor.sourcePath,
      summaryPath: descriptor.summaryPath,
      state: 'stale',
      summarizedAt,
    };
  }
  return {
    name: descriptor.name,
    sourcePath: descriptor.sourcePath,
    summaryPath: descriptor.summaryPath,
    state: fm.source_hash === sourceHash ? 'fresh' : 'stale',
    summarizedAt,
  };
}

// IPC-Result-Shape. `generatedAt` ist epoch-ms aus dem Main-Prozess (Renderer
// braucht das nicht; reine Debug-Hilfe). `files` ist deterministisch in der
// Reihenfolge von DOCS_SYNC_FILES.
export interface DocsSyncStatusResult {
  files: DocsSyncFileStatus[];
  generatedAt: number;
}

// Phase-2 Season-22 — Helper fuer den On-Demand-Kontext-Pfad. CLAUDE.md
// listet On-Demand-Files mit `path: docs/...`-Eintraegen; die zugehoerige
// Summary lebt unter `docs/SUMMARIES/<basename>` (gleiche Konvention wie die
// vier festen Docs-Sync-Files). Diese Funktion baut den Descriptor, damit
// `computeFileSyncStatus` ohne Sonderpfad funktioniert.
//
// Edge-Cases:
//   - Backslashes im Pfad → werden zu Forward-Slash normalisiert (Frontmatter
//     auf Windows kann beides liefern).
//   - Doppelte Slashes oder `./`-Prefix → werden gestrippt.
//   - Leerer Basename (z.B. relPath endet auf `/`) → `null` Rueckgabe;
//     Caller filtert.
export function deriveOnDemandDescriptor(
  relPath: string,
): DocsSyncFileDescriptor | null {
  const normalized = relPath
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\.\//, '');
  if (normalized.length === 0) return null;
  const parts = normalized.split('/');
  const name = parts[parts.length - 1] ?? '';
  if (name.length === 0) return null;
  return {
    name,
    sourcePath: normalized,
    summaryPath: `docs/SUMMARIES/${name}`,
  };
}

// Phase-2 Season-22 — Entfernt den fuehrenden YAML-Frontmatter-Block aus
// einer Summary-Datei, damit der Inhalt als Praeambel an die frische Session
// gepastet werden kann. Bestehende Helper (parseSummaryFrontmatter) liest die
// Metadaten — fuer den Body brauchen wir die Bytes *nach* dem zweiten `---`.
//
// Falls kein Frontmatter-Block vorhanden ist, wird der Input unveraendert
// zurueckgegeben (lockerer Vertrag — eine Summary ohne Frontmatter ist
// technisch erlaubt, sie ist nur „stale" im Status).
export function stripFrontmatter(content: string): string {
  const trimmed = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  if (!trimmed.startsWith('---')) return trimmed;
  const newlineAfterOpen = trimmed.indexOf('\n', 3);
  if (newlineAfterOpen === -1) return trimmed;
  const rest = trimmed.slice(newlineAfterOpen + 1);
  const closeMatch = rest.match(/^---\s*$/m);
  if (!closeMatch || closeMatch.index === undefined) return trimmed;
  const afterClose = rest.slice(closeMatch.index + closeMatch[0].length);
  // Eine eventuelle Leerzeile direkt nach dem Frontmatter-Block strippen,
  // damit der eingefuegte Body sauber am ersten echten Inhalt anfaengt.
  return afterClose.replace(/^\r?\n/, '');
}

// Phase-2 Season-22 — Bundle aus Pfad + Body fuer den Praeambel-Builder.
// Renderer haelt das Array sortiert (Reihenfolge aus CLAUDE.md frontmatter)
// und filtert vor dem Aufruf auf die per Checkbox ausgewaehlten Files.
export interface ContextPreambleItem {
  relPath: string;
  summaryBody: string;
}

// Phase-2 Season-22 — Baut den Praeambel-Text, den TakumiDeck nach erfolg-
// reichem PTY-Spawn an die frische Session pastet. Format pro Datei:
//
//   ## Kontext: docs/CODING_RULES.md
//
//   <summary body ohne frontmatter>
//
//   ---
//
// Trennstrich zwischen den Bloecken; am Ende ein kurzer Hinweis, dass es
// sich um Summaries handelt und der Volltext via Pfad nachgeladen werden
// kann. Leere Eingabe → leerer String; Caller (Modal) muss das vor dem
// Submit abfangen.
export function buildContextPreamble(items: ContextPreambleItem[]): string {
  if (items.length === 0) return '';
  const blocks = items.map((item) => {
    const body = item.summaryBody.trim();
    return `## Kontext: ${item.relPath}\n\n${body}\n`;
  });
  return [
    blocks.join('\n---\n\n'),
    '---',
    '',
    'Diese Kontext-Bloecke sind komprimierte Zusammenfassungen aus `docs/SUMMARIES/`. Wenn du die volle Datei brauchst, lies sie ueber den Pfad oben nach.',
  ].join('\n');
}

// Pure Prompt-Builder. Nimmt die Subset-Auswahl an, gibt den deutschen Prompt
// zurueck, den die neue Claude-Code-Session als erstes Input bekommt.
//
// Defensive Verhalten:
//   - Leere Liste → leerer String. Der Caller muss das abfangen (Submit-
//     Button ist disabled).
//   - Auswahl enthaelt Files, deren Original missing-source ist → der Prompt
//     listet sie trotzdem mit auf; Claude bekommt damit den expliziten Auftrag
//     zu pruefen und den Fall (Original fehlt) im Output zu erwaehnen. Der
//     User kann via Checkbox abwaehlen, wenn er das nicht will.
export function buildDocsSyncPrompt(selectedFiles: DocsSyncFileDescriptor[]): string {
  if (selectedFiles.length === 0) return '';
  const fileLines = selectedFiles
    .map((f) => `- \`${f.sourcePath}\` → \`${f.summaryPath}\``)
    .join('\n');
  return [
    'Bitte komprimiere die folgenden Doku-Dateien zu kompakten Zusammenfassungen.',
    '',
    'Quelle → Ziel:',
    fileLines,
    '',
    'Vorgaben:',
    '- Lies jede Quell-Datei vollstaendig.',
    '- Schreibe pro Datei eine eigene Summary unter dem angegebenen Ziel-Pfad. Lege das Verzeichnis `docs/SUMMARIES/` an, falls es noch nicht existiert.',
    '- Halte die Summary kurz (Ziel: 20-40 Zeilen Markdown), strukturiere sie sinnvoll und betone wiederkehrende Muster statt einzelner Eintraege.',
    '- Jede Summary beginnt mit einem Frontmatter-Block in genau diesem Format:',
    '',
    '```',
    '---',
    'source: <pfad zur originaldatei, relativ zur projektwurzel>',
    'source_hash: <sha256-hex der originaldatei, in kleinbuchstaben>',
    'summarized_at: <UTC-Zeitstempel im Format YYYY-MM-DDThh:mm:ssZ>',
    '---',
    '```',
    '',
    '- Den `source_hash` berechnest du selbst aus dem Datei-Inhalt der Quelle (SHA-256, hex-encoded). Nutze dafuer ein Bash-Tool wie `sha256sum` oder `certutil -hashfile <pfad> SHA256`.',
    '- Wenn eine Quell-Datei nicht existiert, schreibe stattdessen einen kurzen Hinweis ins Chat (nicht ins Summary-File).',
    '',
    'Wenn alle Summaries geschrieben sind, melde dich kurz mit der Anzahl der bearbeiteten Dateien.',
  ].join('\n');
}
