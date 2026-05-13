// Phase 2 Season 4 — Doku-Parser fuer Auto-Variablen.
//
// Pure Logik: liest Markdown-Strings und extrahiert Section-Listen fuer die
// neuen Template-Auto-Variablen {{TECH_SCHULDEN_RELEVANT}} und
// {{LETZTE_ENTSCHEIDUNGEN}}.
//
// Die Konvention der Quell-Dateien laut docs/TECH_SCHULDEN.md und
// docs/ENTSCHEIDUNGEN.md:
//
//   - Jeder Eintrag steht unter einer eigenen `##`-Ueberschrift.
//   - Erledigte Schulden tragen ein gruenes Haekchen direkt im Titel (`✅`).
//     Solche Eintraege gelten als „nicht mehr relevant" und werden gefiltert.
//   - ENTSCHEIDUNGEN.md ist neuste-zuerst sortiert; Top-3 = erste drei
//     `##`-Bloecke nach dem Datei-Kopf.
//   - TECH_SCHULDEN.md ist Reihenfolge nach Eintrag-Datum (neuere oben);
//     Top-N = die ersten N noch nicht erledigten Eintraege.
//
// Beide Parser teilen sich denselben Section-Splitter (`parseMarkdownSections`),
// damit die Konvention an einer Stelle gepflegt wird. Spezialisierte Formatter
// produzieren die finalen Strings, die als Variable in den Prompt eingesetzt
// werden.

// Eine `##`-Section. `body` ist alles zwischen dem Heading und dem naechsten
// `##`-Heading (oder Dateiende), ohne das Heading selbst, ohne fuehrende/nach-
// gestellte Leerzeilen.
export interface MarkdownSection {
  title: string;
  body: string;
}

const SECTION_HEADING_RE = /^##\s+(.+?)\s*$/;
const HORIZONTAL_RULE_RE = /^\s*-{3,}\s*$/;

// Spaltet einen Markdown-String in seine `##`-Sections auf. `#`-Sections
// (= Datei-Kopf) werden ignoriert — die Datei-Konvention nutzt sie nur als
// Titel der ganzen Doku.
export function parseMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  let current: { title: string; bodyLines: string[] } | null = null;
  let inCodeFence = false;
  let fenceMarker = '';
  for (const line of lines) {
    // In Code-Bloecken keine Heading-Erkennung — sonst wuerde `## …` im Code-
    // Beispiel die Section unerwartet zerreissen.
    if (!inCodeFence) {
      const fenceOpen = line.match(/^\s*(`{3,}|~{3,})/);
      if (fenceOpen && fenceOpen[1] !== undefined) {
        inCodeFence = true;
        fenceMarker = fenceOpen[1][0] ?? '';
        current?.bodyLines.push(line);
        continue;
      }
    } else {
      const trimmed = line.trim();
      if (trimmed.length > 0) {
        const allSame = [...trimmed].every((ch) => ch === fenceMarker);
        if (allSame) {
          inCodeFence = false;
          fenceMarker = '';
        }
      }
      current?.bodyLines.push(line);
      continue;
    }

    const match = line.match(SECTION_HEADING_RE);
    if (match && match[1] !== undefined) {
      if (current) {
        sections.push(finalize(current));
      }
      current = { title: match[1].trim(), bodyLines: [] };
      continue;
    }
    if (current) {
      current.bodyLines.push(line);
    }
  }
  if (current) {
    sections.push(finalize(current));
  }
  return sections;
}

function finalize(current: { title: string; bodyLines: string[] }): MarkdownSection {
  let start = 0;
  let end = current.bodyLines.length;
  while (start < end && (current.bodyLines[start] ?? '').trim() === '') start++;
  while (end > start && (current.bodyLines[end - 1] ?? '').trim() === '') end--;
  // Trailing Horizontal-Rule (`---`) zaehlt nicht zum Body — TECH_SCHULDEN.md und
  // ENTSCHEIDUNGEN.md trennen Eintraege mit `---`-Linien.
  while (end > start && HORIZONTAL_RULE_RE.test(current.bodyLines[end - 1] ?? '')) {
    end--;
    while (end > start && (current.bodyLines[end - 1] ?? '').trim() === '') end--;
  }
  return {
    title: current.title,
    body: current.bodyLines.slice(start, end).join('\n'),
  };
}

// Erkenntnis aus der Konvention: erledigte Schulden tragen ein ✅ im Titel.
function isResolvedSchulden(title: string): boolean {
  return /✅/.test(title);
}

// META-Sections-Filter: TECH_SCHULDEN.md und ENTSCHEIDUNGEN.md beginnen mit
// erklaerendem Kopf-Material (`## Unterschied zu anderen Dokumenten`,
// `## Wann kommt ein Eintrag hier rein?`, `## Format pro Eintrag`). Diese
// Sections gehoeren NICHT in die {{LETZTE_ENTSCHEIDUNGEN}}- oder
// {{TECH_SCHULDEN_RELEVANT}}-Variable.
//
// Echte Eintraege erkennt man am Pflicht-Label: Schulden-Eintraege tragen
// `**Bereich:**`, Entscheidungs-Eintraege tragen `**Entscheidung:**` direkt
// im Body. META-Sections haben keines davon — die Filter-Funktion prueft
// dieses Label und laesst sonst die Section liegen.
function hasLabel(body: string, label: string): boolean {
  const re = new RegExp(`(^|\\n)\\*\\*${escapeForRegex(label)}:\\*\\*`);
  return re.test(body);
}

// Findet eine `**Label:**`-Zeile im Body und gibt deren Text (ohne Label, ohne
// trailing Whitespace) zurueck. Mehrzeilen werden zusammengezogen (bis zur
// naechsten Leerzeile oder zum naechsten `**…**`-Label).
function extractLabeledLine(body: string, label: string): string | null {
  const lines = body.split(/\r?\n/);
  const re = new RegExp(`^\\*\\*${escapeForRegex(label)}:\\*\\*\\s*(.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const match = line.match(re);
    if (!match) continue;
    const collected: string[] = [];
    const first = match[1]?.trim() ?? '';
    if (first.length > 0) collected.push(first);
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (next === undefined) break;
      if (next.trim() === '') break;
      if (/^\*\*[^*]+:\*\*/.test(next)) break;
      collected.push(next.trim());
    }
    return collected.join(' ').trim() || null;
  }
  return null;
}

function escapeForRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Formatter fuer {{TECH_SCHULDEN_RELEVANT}}. Filter:
//   - Eintraege mit ✅ im Titel werden weggelassen.
//   - Es werden hoechstens `limit` offene Eintraege (in Datei-Reihenfolge) ausgegeben.
//   - Pro Eintrag: Titel + Bereich (sofern vorhanden) + Was-Zeile (sofern vorhanden).
//
// Format-Beispiel (zwei Eintraege):
//
//   - exactOptionalPropertyTypes: false
//     Bereich: tsconfig.json
//     Was: Compiler-Option steht auf false …
//
// Wenn keine offenen Eintraege existieren, wird ein leerer String zurueckgegeben —
// der Prompt zeigt dann an der Variable-Stelle nichts, was im Template-Kontext
// die korrekte „nichts zu erinnern"-Botschaft ist.
export function formatTechSchuldenRelevant(markdown: string, limit: number): string {
  if (limit <= 0) return '';
  const sections = parseMarkdownSections(markdown);
  // Erst META-Sections raus (kein `**Bereich:**`), dann erledigte aus dem Titel.
  const realEntries = sections.filter((s) => hasLabel(s.body, 'Bereich'));
  const open = realEntries.filter((s) => !isResolvedSchulden(s.title));
  const top = open.slice(0, limit);
  if (top.length === 0) return '';
  return top.map(formatSchuldenEntry).join('\n\n');
}

function formatSchuldenEntry(section: MarkdownSection): string {
  const parts: string[] = [`- ${section.title}`];
  const bereich = extractLabeledLine(section.body, 'Bereich');
  if (bereich) parts.push(`  Bereich: ${bereich}`);
  const was = extractLabeledLine(section.body, 'Was');
  if (was) parts.push(`  Was: ${was}`);
  return parts.join('\n');
}

// Formatter fuer {{LETZTE_ENTSCHEIDUNGEN}}. Top-N `##`-Sections in Datei-
// Reihenfolge (Konvention: neuste oben). Pro Eintrag: Titel + Entscheidung-Zeile.
//
// Format-Beispiel:
//
//   - Trigger-Phrasen-Schnellbuttons: dynamisch aus Frontmatter
//     Entscheidung: Die Action-Bar rendert pro Eintrag …
export function formatLetzteEntscheidungen(markdown: string, limit: number): string {
  if (limit <= 0) return '';
  const sections = parseMarkdownSections(markdown);
  // META-Sections raus — echte Eintraege tragen `**Entscheidung:**` im Body.
  const realEntries = sections.filter((s) => hasLabel(s.body, 'Entscheidung'));
  const top = realEntries.slice(0, limit);
  if (top.length === 0) return '';
  return top.map(formatEntscheidungEntry).join('\n\n');
}

function formatEntscheidungEntry(section: MarkdownSection): string {
  const parts: string[] = [`- ${section.title}`];
  const entscheidung = extractLabeledLine(section.body, 'Entscheidung');
  if (entscheidung) parts.push(`  Entscheidung: ${entscheidung}`);
  return parts.join('\n');
}
