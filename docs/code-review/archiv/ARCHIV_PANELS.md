# Code-Review · Panels · Archiv (behobene Einträge)

Archivierte Befunde aus [`OFFEN_PANELS.md`](../OFFEN_PANELS.md) — Status **Behoben** oder **Gegenstandslos**.

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

---

## Release-Review v0.2.1 (2026-05-17) → aufgelöst 2026-05-20 (v0.3.2 Hotfix)

### ✅ Sidebar-Schließ-Pfade räumen Spawn-Tracking nicht auf — aufgelöst 2026-05-20 (v0.3.2 Hotfix)

- `src/renderer/panels/LeftSidebar.tsx:171-183` (`handleCloseTab`) · `src/renderer/panels/LeftSidebar.tsx:208-242` (`handleConfirmRemove`) · Kategorie: **Verbesserung-Doku** (latente Lücke)
- **Beschreibung:** Der v0.2.1-Hotfix räumt `spawnedIds` + `initialPrompts` nur in `TabContainer.handleClose` auf — also nur beim Schließen über das Tab-Bar-„×". Die Sidebar-Pfade `handleCloseTab` (Sidebar-„×") und `handleConfirmRemove` (Projekt-Entfernen) räumen den TabContainer-State weiterhin nicht auf.
- **Begründung (historisch):** Theoretisch abgesichert durch den Dedupe-Guard im SessionStore. Die Lücke ist beim Daily-Use mit dem Sidebar-`×`-Pfad doch echt aufgetreten — User-Repro „× in Aktive-Sessions-Pille → Resume aus History → rote `UNIQUE constraint failed: sessions.id`-Box". Mit v0.3.2 ist Variante B aus der TECH_SCHULDEN-Notiz eingelöst: `needsSpawn` und `initialPrompt` leben am `SessionTab`-Schema; `closeTab` cleart sie implizit, egal welcher Pfad aufruft. Siehe ENTSCHEIDUNGEN-Eintrag „Spawn-Tracking ins SessionTab-Schema heben (A)".

### ✅ Hotfix-Regressionstest auf TabContainer-Integrationsebene fehlt — aufgelöst 2026-05-20 (v0.3.2 Hotfix)

- `tests/renderer/spawn-tracking-state.test.ts` · Kategorie: **Verbesserung**
- **Beschreibung:** Die acht neuen Tests prüfen die Pure-Helper-Verträge (`removeFromIdSet`/`removeFromIdMap` referenz-stabil bei No-op, neue Instanz bei Treffer) und ein Bugfix-Szenario auf Helper-Ebene. Es fehlt aber ein Renderer-Integrations- oder Hook-Test, der `TabContainer.handleClose` tatsächlich aufruft und danach `addTab` mit derselben sessionId wieder einfügt und verifiziert, dass die Resume-Folge-Aktion (`needsSpawn=false`, `initialPrompt=null`) tatsächlich am Mount ankommt.
- **Begründung (historisch):** Mit der v0.3.2-Variante-B-Umstellung sind die Pure-Helper und ihr Test komplett weggefallen. Der zentrale Regressions-Test sitzt jetzt im neuen `useSessionStore Spawn-Tracking`-Block in `tests/renderer/sessions-store.test.ts` und prüft den End-to-End-Pfad direkt am Store: `addTab({sessionId, needsSpawn: true})` → `closeTab(sessionId)` → `addTab({sessionId})` → erwarteter `needsSpawn=false` am neuen Tab. Damit ist der Resume-Pfad auf der Schicht abgesichert, auf der er passiert.
