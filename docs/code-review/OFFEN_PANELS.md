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

---

## Release-Review v0.2.0 (2026-05-17)

Befunde aus dem Release-Review von v0.1.2 → v0.2.0, die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### `TerminalTab` Auto-Send-Timer kapselt `isActive` als Closure-Snapshot

- `src/renderer/panels/TerminalTab.tsx:300-315` · Kategorie: **Verbesserung**
- **Beschreibung:** Der Season-21-Auto-Send-Pfad (Docs-Sync / On-Demand-Kontext-Präambel) sitzt in `doSpawn`, der `isActive` aus dem useEffect-Scope kennt. useEffect läuft nur auf `[sessionId]`, also wird `isActive` zum Mount-Zeitpunkt eingefroren. Wenn der User in den 2,5 s Warmup zwischen Spawn-Success und Auto-Send einen anderen Tab fokussiert, läuft `if (isActive) { terminal.focus(); }` mit dem alten Wert. Praktisch egal, weil `terminal.focus()` keinen globalen Side-Effect hat — es fokussiert nur den gemounteten xterm, der nicht aktiv sichtbar ist. Der Auto-Send selbst (`terminal.paste(prompt)` + `pty.write('\r')`) läuft korrekt auf der richtigen Session-PTY.
- **Begründung:** Saubere Fix-Variante wäre `isActiveRef.current` analog zu `initialPromptRef` (bereits via `useRef` umgesetzt im selben Block). Aber: der einzige sichtbare Effekt wäre, dass `terminal.focus()` korrekt unterdrückt würde — null sichtbarer Nutzen, weil der inaktive xterm gar nicht im DOM-Fokus-Pfad liegt.
- **Trigger:** wenn jemals eine zweite Side-Effect-Aktion in den Auto-Send-Branch wandert, die echte Stale-Closure-Bugs zeigen würde (z.B. UI-Toast mit Tab-Name).

---

## Release-Review v0.2.1 (2026-05-17)

Befunde aus dem Release-Review von v0.2.0 → v0.2.1 (Hotfix Resume-UNIQUE-Constraint + Markdown-Preview Side-by-Side), die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### Sidebar-Schließ-Pfade räumen Spawn-Tracking nicht auf

- `src/renderer/panels/LeftSidebar.tsx:171-183` (`handleCloseTab`) · `src/renderer/panels/LeftSidebar.tsx:208-242` (`handleConfirmRemove`) · Kategorie: **Verbesserung-Doku** (latente Lücke)
- **Beschreibung:** Der v0.2.1-Hotfix räumt `spawnedIds` + `initialPrompts` nur in `TabContainer.handleClose` auf — also nur beim Schließen über das Tab-Bar-„×". Die Sidebar-Pfade `handleCloseTab` (Sidebar-„×") und `handleConfirmRemove` (Projekt-Entfernen) räumen den TabContainer-State weiterhin nicht auf.
- **Begründung:** Heute praktisch abgesichert durch den Dedupe-Guard im SessionStore (`stores/sessions.ts:109-113`): `addTab` mit derselben sessionId gibt `existing` zurück, TerminalTab wird nicht unmounted/remounted, `needsSpawn` wird nicht neu ausgewertet. Sauberer Fix wäre Variante B — `needsSpawn`+`initialPrompt` ins `SessionTab`-Schema heben, damit der State zur Session gehört statt zum TabContainer. Dieser Schritt ist bereits in `docs/TECH_SCHULDEN.md` als Auflösungs-Skizze hinterlegt.
- **Trigger:** sobald ein Refactoring den vorausgeschickten `closeTab()` über die Sidebar auch im SessionStore platziert (z.B. um den Verlauf gleichzeitig zu öffnen), reißt die Lücke wieder auf — dann Variante B ziehen.

### Hotfix-Regressionstest auf TabContainer-Integrationsebene fehlt

- `tests/renderer/spawn-tracking-state.test.ts` · Kategorie: **Verbesserung**
- **Beschreibung:** Die acht neuen Tests prüfen die Pure-Helper-Verträge (`removeFromIdSet`/`removeFromIdMap` referenz-stabil bei No-op, neue Instanz bei Treffer) und ein Bugfix-Szenario auf Helper-Ebene. Es fehlt aber ein Renderer-Integrations- oder Hook-Test, der `TabContainer.handleClose` tatsächlich aufruft und danach `addTab` mit derselben sessionId wieder einfügt und verifiziert, dass die Resume-Folge-Aktion (`needsSpawn=false`, `initialPrompt=null`) tatsächlich am Mount ankommt.
- **Begründung:** Der Helper-Vertrag ist der eigentliche Sicherheitsanker und manuell verifizierbar. Ein Integrationstest würde zusätzlich gegen ein versehentliches Aufheben des Cleanups in einer späteren Refactoring-Welle absichern (z.B. wenn jemand `handleClose` extrahiert oder generalisiert).
- **Trigger:** wenn die TabContainer-Lifecycle-Logik nochmal angefasst wird (z.B. im Zuge der Variante-B-Schuld) — dann diesen Test mit-einziehen.

### Markdown-Preview-Layout-Switch wirkt tab-/mount-lokal

- `src/renderer/components/MarkdownEditor.tsx:75-85` · Kategorie: **Verbesserung-Doku** (bewusste Designwahl)
- **Beschreibung:** Der Drei-Modi-Switch (Beide/Editor/Preview) in der Markdown-Editor-Toolbar setzt nur einen tab-lokalen `useState`. Beim Schließen und Wieder-Öffnen derselben Datei greift wieder `initialLayout` aus den Settings — der User-Switch persistiert nicht. Code-Kommentar an Zeile 84-85 dokumentiert das als bewusste Entscheidung („danach lokal pro Datei wechselbar").
- **Begründung:** Die User-Erwartung könnte abweichen („mein Switch wirkt permanent für diese Datei"). Keine konkrete UX-Beschwerde, aber der Punkt sollte als bewusste Designwahl im Code-Review-Gedächtnis stehen, damit künftige Reviews nicht erneut darüber stolpern.
- **Trigger:** wenn die UX-Beschwerde tatsächlich auftaucht — dann Per-Datei-Persistierung als eigene Mini-Season (z.B. via `lastUsedLayout`-Map in den Settings oder als Per-File-Frontmatter-Hint).

### Markdown-Preview reagiert nicht live auf Default-Layout-Wechsel im Settings-Modal

- `src/renderer/panels/EditorPane.tsx:34` ↔ `src/renderer/components/MarkdownEditor.tsx:75-85` · Kategorie: **Verbesserung**
- **Beschreibung:** Ändert der User den `markdown_editor_layout`-Default im Settings-Modal, während ein Markdown-Tab offen ist, bekommt die offene Editor-Instanz den neuen Default NICHT — `initialLayout` ist nur State-Init beim Mount. Erst beim Schließen + Neu-Öffnen einer Datei wirkt der neue Wert.
- **Begründung:** Konsistent mit dem dokumentierten Verhalten („nur den Startwert beim Mount"). Keine Datenverlust-Gefahr, reines UX-Detail. Eine Live-Reaktion wäre ein Effekt in `MarkdownEditor` mit `[initialLayout]` als Dep, der `setLayout(initialLayout)` setzt — würde aber die tab-lokale Switch-Entscheidung des Users überschreiben, sobald er das Settings-Modal öffnet/schließt. Reine Designwahl, kein Bug.
- **Trigger:** wenn der UX-Pfad „User stellt Default um, wundert sich, dass offene Tabs nicht mit umschalten" empirisch wehtut — dann Per-Default-Live-Refresh mit klarer Semantik (nur Tabs ohne lokalen Switch?) als eigene Mini-Season.
