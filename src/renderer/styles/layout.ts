// Layout-Konstanten laut Architektur Kapitel 4 (TAKUMIDECK_ARCHITEKTUR.md).
//
// Diese Werte sind fest im Code verankert (keine Settings) — sie definieren das
// Grid-Skelett der App. Andere Stellen (CSS-Variablen, App.tsx-Style-Props) sollen
// hierauf referenzieren, damit eine Layout-Anpassung nur an einer Stelle anfällt.

export const LAYOUT = {
  TITLEBAR_HEIGHT: 36,
  COL_LEFT_WIDTH: 240,
  COL_RIGHT_WIDTH: 232,
  // Sprint-5-Bottom-Row: PlanPane (limit-bars) + StatsPane (Übersicht/Modelle).
  // Architektur 4 (LAYOUT.ROW_BOTTOM_HEIGHT) gibt 300 px verbindlich vor.
  ROW_BOTTOM_HEIGHT: 300,
  TAB_BAR_HEIGHT: 28,
  TERMINAL_FOOTER_HEIGHT: 24,
  RADIUS_PILL: 2,
  RADIUS_MODAL: 4,
  RADIUS_TOAST: 3,
} as const;
