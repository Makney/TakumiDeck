// Layout-Konstanten laut Architektur Kapitel 4 (TAKUMIDECK_ARCHITEKTUR.md).
//
// Diese Werte sind fest im Code verankert (keine Settings) — sie definieren das
// Grid-Skelett der App. Andere Stellen (CSS-Variablen, App.tsx-Style-Props) sollen
// hierauf referenzieren, damit eine Layout-Anpassung nur an einer Stelle anfällt.

export const LAYOUT = {
  TITLEBAR_HEIGHT: 36,
  // Season-30-UI-Overhaul: Sidebars 240/232 → 300/300 px (initial 400 wirkte
  // optisch zu breit). Symmetrische Aussen-Spalten ziehen den Mittelteiler
  // exakt auf die Fenstermitte.
  COL_LEFT_WIDTH: 300,
  COL_RIGHT_WIDTH: 300,
  // Einheitliche Hoehe fuer alle Top-Bars (Titlebar, Sidebar-Section-Heads,
  // Terminal-/Editor-Tabs, Files-/Notes-/History-/Stats-/Plan-Header) — ergibt
  // ein durchgehendes Chrome-Band parallel zur Titlebar.
  SECTION_HEAD_HEIGHT: 36,
  // Sprint-5-Bottom-Row: PlanPane (limit-bars) + StatsPane (Übersicht/Modelle).
  // Architektur 4 (LAYOUT.ROW_BOTTOM_HEIGHT) gibt 300 px verbindlich vor.
  ROW_BOTTOM_HEIGHT: 300,
  TAB_BAR_HEIGHT: 28,
  TERMINAL_FOOTER_HEIGHT: 24,
  RADIUS_PILL: 2,
  RADIUS_MODAL: 4,
  RADIUS_TOAST: 3,
} as const;
