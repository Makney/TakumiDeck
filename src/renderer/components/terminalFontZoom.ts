// Phase-2 Season-28: Pure-Logik fuer den Per-Tab-Font-Zoom (Ctrl+Mausrad).
//
// Der Zoom ist session-lokal — wird beim Tab-Close vergessen und nicht in
// AppSettings persistiert. Settings-weite Schriftgroesse bleibt der Default
// fuer neue Tabs; Persistierung wandert in eine spaetere Phase, wenn klar
// ist, ob User die Praeferenz pro Projekt oder global wollen.
//
// Begrenzung 8..32: unter 8 wird xterms Glyph-Atlas unleserlich; ueber 32
// reflowt der WebGL-Renderer den Buffer sehr aggressiv und macht das Scrollen
// wieder ruckelig — die obere Grenze ist also empirisch und kein harter
// Plattform-Cap.

export const TERMINAL_FONT_SIZE_MIN = 8;
export const TERMINAL_FONT_SIZE_MAX = 32;
export const TERMINAL_FONT_SIZE_STEP = 1;

// Begrenzt einen Font-Size-Wert auf das erlaubte Intervall. Wird sowohl beim
// initialen Lesen aus den Settings (Defense-in-Depth gegen veraltete Konfigs)
// als auch nach jedem Zoom-Schritt aufgerufen.
export function clampFontSize(size: number): number {
  if (!Number.isFinite(size)) return TERMINAL_FONT_SIZE_MIN;
  if (size < TERMINAL_FONT_SIZE_MIN) return TERMINAL_FONT_SIZE_MIN;
  if (size > TERMINAL_FONT_SIZE_MAX) return TERMINAL_FONT_SIZE_MAX;
  return Math.round(size);
}

// Liefert die naechste Font-Groesse fuer ein Wheel-Event mit gedruecktem Ctrl.
// deltaY < 0 bedeutet „nach oben gescrollt" (Standard-Browser-Konvention) und
// erhoeht die Groesse; deltaY > 0 verringert sie. deltaY === 0 ist No-Op.
export function nextZoomFontSize(currentSize: number, deltaY: number): number {
  if (deltaY === 0) return clampFontSize(currentSize);
  const direction = deltaY < 0 ? +1 : -1;
  return clampFontSize(currentSize + direction * TERMINAL_FONT_SIZE_STEP);
}
