// Phase 2 Season 4 — Template-Body-Extraktion (Variante A1).
//
// Pure Logik: nimmt den vollen Markdown-Inhalt einer Template-Datei und liefert
// den eigentlichen Prompt-Block zurück. Konvention:
//
//   - Reader sucht das erste `##`/`###`-Heading, dessen Text mit „Vorlage"
//     beginnt (case-insensitive, z.B. „Vorlage", „Vorlage (Inhalt)").
//   - Direkt darunter folgt ein Fenced-Code-Block (``` … ```). Dessen Inhalt
//     (ohne Fence-Zeilen) ist der Body.
//   - Findet sich kein passendes Heading oder kein Fence darunter, wird der
//     komplette Eingabe-String zurückgegeben. Damit funktionieren minimale
//     Templates ohne Erklärtext (= Datei IST der Prompt) und Alt-Templates,
//     die der Konvention nicht folgen, weiterhin.
//
// Konvention dokumentiert in docs/templates/SEASON_PROMPT.md selbst — dort
// liegt der Block heute schon unter `## Vorlage (Inhalt)` in einem ``` -Fence.

// Heading-Erkennung: ## oder ### (vier+ # behandeln wir nicht — Vorlage gehört
// nicht auf Level 4+). Whitespace nach den #-Zeichen ist Pflicht laut CommonMark.
const VORLAGE_HEADING_RE = /^(#{2,3})\s+vorlage\b/i;

// Fence-Erkennung: drei oder mehr Backticks bzw. Tildes, optional gefolgt von
// einem Info-String (z.B. ```ts). Schliessender Fence muss aus mindestens so
// vielen Zeichen desselben Typs bestehen — wir matchen aber nur „mindestens drei
// derselben Sorte", weil Vorlagen real keine Nested-Fences enthalten.
const FENCE_OPEN_RE = /^(\s*)(`{3,}|~{3,})/;

export function extractTemplateBody(content: string): string {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    if (!VORLAGE_HEADING_RE.test(line)) continue;
    // Ab i+1 nach erstem Fence-Open suchen. Leere Zeilen und gewöhnlicher
    // Markdown-Text dazwischen sind erlaubt (z.B. ein kurzer Einleitungssatz),
    // aber sobald ein neues `##`/`###`-Heading auftaucht, ist der Vorlage-
    // Abschnitt vorbei — dann gibt es keinen Fence und wir fallen am Ende
    // auf den vollen Content zurück.
    for (let j = i + 1; j < lines.length; j++) {
      const candidate = lines[j];
      if (candidate === undefined) break;
      if (/^#{2,3}\s+/.test(candidate)) break;
      const openMatch = candidate.match(FENCE_OPEN_RE);
      if (!openMatch) continue;
      const fenceMarker = openMatch[2];
      if (fenceMarker === undefined) break;
      const fenceChar = fenceMarker[0];
      const fenceLen = fenceMarker.length;
      // Schliessenden Fence finden: gleiche Sorte, mindestens dieselbe Länge,
      // führender Whitespace egal. Innen-Zeilen werden 1:1 übernommen, inklusive
      // leerer Zeilen am Anfang/Ende. Wir trimmen den Body am Ende um genau eine
      // führende und genau eine nachfolgende Leerzeile, weil viele Templates
      // mit ```<newline>Inhalt<newline>``` formatiert sind und sonst eine
      // ungewollte Blank-Line entsteht.
      const bodyLines: string[] = [];
      let closed = false;
      for (let k = j + 1; k < lines.length; k++) {
        const inner = lines[k];
        if (inner === undefined) break;
        const trimmed = inner.trim();
        if (trimmed.length >= fenceLen) {
          const allSame = [...trimmed].every((ch) => ch === fenceChar);
          if (allSame) {
            closed = true;
            break;
          }
        }
        bodyLines.push(inner);
      }
      if (!closed) break;
      return trimEdgeBlankLines(bodyLines).join('\n');
    }
    // Heading gefunden, aber kein Fence darunter — abbrechen und Fallback.
    break;
  }
  return content;
}

function trimEdgeBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start] === undefined || lines[start]?.trim() === '')) {
    start++;
  }
  while (end > start && (lines[end - 1] === undefined || lines[end - 1]?.trim() === '')) {
    end--;
  }
  return lines.slice(start, end);
}
