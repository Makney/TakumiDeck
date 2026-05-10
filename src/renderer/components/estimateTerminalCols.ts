// Sprint 9 — pragmatische cols/rows-Schätzung für den Resume-Pfad.
//
// Beim Resume wird `claude --resume <id>` mit cols/rows aus dem IPC-Aufruf
// gespawnt, BEVOR der TerminalTab im Renderer mountet (also bevor xterm fit()
// läuft). Bislang hat der Renderer hardcoded `cols: 80, rows: 24` an die PTY
// geschickt — wenn die Mid-Column schmaler als 80 cols ist, formatiert
// claude seinen Welcome-/Resume-Output mit zu vielen Zeichen pro Zeile, und
// xterm schneidet rechts ab. Der Buffer wird beim Reflow nicht repariert.
//
// Diese Helper-Funktion misst die aktuelle Mid-Column-Breite aus dem DOM
// und teilt durch eine font-width-Schätzung. Resultat ist nicht
// pixel-genau, aber „gut genug" — der erste fit() im TerminalTab korrigiert
// die Werte sowieso nach dem Mount via `pty:resize`.

const FALLBACK_COLS = 80;
const FALLBACK_ROWS = 24;

// Empirischer Faktor für Monospace-Fonts: bei JetBrains Mono 14 px ist eine
// Spalte ~8.4 px breit. Wir runden auf 0.6 × fontSize, das passt gut für
// JetBrains Mono / Cascadia Code / MesloLGS NF im 13-16 px-Bereich.
const COL_WIDTH_FACTOR = 0.6;
// Eine Zeile ist Höhe ≈ 1.2 × fontSize.
const ROW_HEIGHT_FACTOR = 1.2;

export function estimateTerminalCols(fontSize: number): { cols: number; rows: number } {
  if (typeof document === 'undefined') {
    return { cols: FALLBACK_COLS, rows: FALLBACK_ROWS };
  }
  // Mid-Column ist der Eltern-Container des TerminalTab. Wir messen die
  // sichtbare Größe statt eines fixen 1fr-Werts, damit Sidebar-Resize oder
  // Fenster-Größenänderungen direkt einfließen.
  const midCol = document.querySelector('.td-col-mid-top');
  if (!(midCol instanceof HTMLElement)) {
    return { cols: FALLBACK_COLS, rows: FALLBACK_ROWS };
  }
  const width = midCol.clientWidth;
  const height = midCol.clientHeight;
  if (width <= 0 || height <= 0) {
    return { cols: FALLBACK_COLS, rows: FALLBACK_ROWS };
  }
  // Padding-Abzug: td-terminal-canvas hat 8 px vertical / 10 px horizontal,
  // td-tabs nimmt ~28 px Höhe oben weg, td-term-bar ~28 px unten.
  const usableWidth = Math.max(width - 20, 100);
  const usableHeight = Math.max(height - 60, 100);
  const cols = Math.max(40, Math.floor(usableWidth / (fontSize * COL_WIDTH_FACTOR)));
  const rows = Math.max(10, Math.floor(usableHeight / (fontSize * ROW_HEIGHT_FACTOR)));
  return { cols, rows };
}
