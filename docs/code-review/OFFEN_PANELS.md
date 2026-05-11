# Code-Review — Bekannte offene Punkte (Panels)

Befunde für `src/renderer/panels/...` und `src/renderer/{App,main}.tsx`, die bewusst nicht im aktuellen Scope gefixt werden — damit nachfolgende Review-Durchgänge sie nicht erneut melden.

## Format

Siehe [OFFEN_TEMPLATE.md](./OFFEN_TEMPLATE.md).

---

## Bereich-7-Review (2026-05-11) — aufgelöst

Die ESLint-Vor-Pass-Befunde von 2026-05-10 sind im Bereich-7-Review behandelt:

- `TabContainer.tsx:166` — echter Stale-Closure-Bug, `settings.terminal_font_size` als Dep ergänzt. Inline-Disable entfernt.
- `TabContainer.tsx:216` — `"` durch typografische Closing-Quote `"` (U+201C) ersetzt, passt zum `„`-Opener. Inline-Disable entfernt.
- `EditorPane.tsx:312` — `QuickAccessFooter` und `QuickAccessFooterProps` als dead code entfernt (Sprint-9-Layout hat den Footer zugunsten der rechten FilesPanel-Spalte entfernt).

Zusätzlich im Bereich-7-Review aufgelöste Befunde (nicht im Initial-Lint-Lauf):

- `LeftSidebar.tsx:178` und `HistoryPane.tsx:174-178` — Resume nutzte hardcoded `cols: 80, rows: 24`; Sprint-9-Fix (`estimateTerminalCols`) war nur in `TabContainer.handleResume` migriert. Beide Pfade nachgezogen, `HistoryPane` bekommt `settings` als neuen Prop.
- `PlanPane.tsx:46-61` — Listener-Closure capturete stale `barIds`; Deps auf `[barIds, refreshBars, refreshContext]` gesetzt, Inline-Disable entfernt.
- `TerminalTab.tsx:195-198` — Spawn-RAF wurde in der Cleanup-Funktion nicht gecancelt; RAF-Handle wird jetzt getrackt und in der Cleanup abgebrochen (Edge-Case: Tab-Unmount im 16-ms-Fenster zwischen Schedule und Fire).
- `TerminalTab.tsx:226` — Focus-Callback liest `terminalRef.current` jetzt direkt im RAF statt aus einer Capture-Variable.
- `TabContainer.tsx:91` — `useState<Set<string>>` mit Lazy-Initializer.
