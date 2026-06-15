// Season 39 (Opencode): Pure-Logik fuer die zweite Engine.
//
// `opencode models` druckt pro Zeile eine Modell-ID im Format `provider/model`
// (z.B. `anthropic/claude-sonnet-4-5`, `lmstudio/qwen/qwen3-coder-30b`). Wir
// parsen das defensiv: ANSI-Codes raus, leere Zeilen weg, nur Zeilen mit einem
// `/` (ein Provider-Slash ist Pflicht), Duplikate raus, Reihenfolge erhalten.

// eslint-disable-next-line no-control-regex -- ANSI-Escape-Sequenzen (CSI) sollen entfernt werden.
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

// Parst die rohe stdout-Ausgabe von `opencode models` in eine Liste von
// Modell-IDs. Robust gegen ANSI-Faerbung (falls opencode doch mal einen
// TTY annimmt) und gegen Leerzeilen/Whitespace.
export function parseOpencodeModels(stdout: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.replace(ANSI_PATTERN, '').trim();
    if (line.length === 0) continue;
    // Ein Provider-Slash ist Pflicht — so fallen Banner-/Hinweiszeilen ohne
    // `/` (falls opencode mal welche druckt) automatisch raus.
    if (!line.includes('/')) continue;
    // Whitespace in einer Modell-Zeile gibt es nicht — eine Zeile mit
    // Leerzeichen ist keine Modell-ID (defensiv gegen Tabellen-Ausgabe).
    if (/\s/.test(line)) continue;
    if (seen.has(line)) continue;
    seen.add(line);
    out.push(line);
  }
  return out;
}

// Baut ein lesbares Label aus einer `provider/model`-ID fuer das Dropdown.
// Wir zeigen die volle ID (eindeutig), kuerzen aber nichts ab — der Provider-
// Praefix hilft beim Unterscheiden gleichnamiger Modelle verschiedener Provider.
export function formatOpencodeModelLabel(id: string): string {
  return id;
}
