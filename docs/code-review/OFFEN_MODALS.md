# Code-Review — Bekannte offene Punkte (Modals + Components)

Befunde für `src/renderer/modals/...` und `src/renderer/components/...`, die bewusst nicht im aktuellen Scope gefixt werden — damit nachfolgende Review-Durchgänge sie nicht erneut melden.

> **Behobene Befunde** sind ins Archiv ausgelagert: [`archiv/ARCHIV_MODALS.md`](./archiv/ARCHIV_MODALS.md). Diese Datei führt nur noch die **offenen** Punkte.

## Format

Siehe [OFFEN_TEMPLATE.md](./OFFEN_TEMPLATE.md).

---

## Bereich-8-Review-Befunde (2026-05-11)

Neue Befunde aus dem manuellen Lese-Pass über alle Modale + Components. Die hier gelisteten Einträge bleiben bewusst offen (Scope, größere Entscheidung, Phase-2-Stub).

### Kein Focus-Trap / Focus-Restore in den Modalen

- `src/renderer/modals/*.tsx` · Kategorie: **Verbesserung**
- **Beschreibung:** Architektur-6.0.1-Prüfpunkt verlangt „Focus-Trap aktiv während offen, Focus-Restore beim Schließen". Aktuell: nur `NewSessionModal` setzt Auto-Focus auf das Title-Input. Tab/Shift+Tab kann den Modal-Bereich verlassen, beim Schließen kein expliziter Focus-Restore.
- **Begründung:** Größere Änderung — sinnvoll als gemeinsamer Hook `useModalA11y(modalRef, isOpen)`, der Tab-Cycling einfängt und beim Unmount den vorherigen `document.activeElement` re-focused. Mit sechs Modalen ist das eine eigenständige Aufgabe, kein Drive-by-Fix.
- **Trigger:** wenn Keyboard-Workflows Pflicht werden (öffentliche Distribution / Accessibility-Pass) oder ein konkreter Bug-Report eintrifft.

### `validateUserPatterns` ungenutzter Export

- `src/renderer/components/sensitiveFiles.ts:69` · Kategorie: **Verbesserung**
- **Beschreibung:** Pure-Logik-Funktion existiert (gibt nicht-kompilierbare RegEx-Quellen aus einer Liste zurück), wird aber im SettingsModal/WorkspaceTab nicht aufgerufen — invalide User-Pattern werden zur Laufzeit in `compileUserPatterns` silent gedroppt.
- **Begründung:** Settings-UX-Verbesserung, gehört konzeptionell zum Sensitive-Patterns-Feature. Wäre additiv zur aktuellen `z.array(z.string())`-Schema-Validation im JSON-Editor und müsste eine eigene UI-Warnung im JsonRawEditor-Apply-Pfad bauen.
- **Trigger:** sobald die Sensitive-Patterns-UX in einer Season erweitert wird (z.B. „Pattern-Tester" im Settings-Modal) — diesen Helper dann verkabeln.

### `useEscapeKey`-Hook-Extraktion

- Fünf Aufrufstellen in `src/renderer/modals/*.tsx` · Kategorie: **Verbesserung**
- **Beschreibung:** Esc-Handler ist in NewSession-, Templates-, PreCommit-, Settings-, UsageDetail- und (seit Bereich-8-Review) HistoryActionModal jeweils inline implementiert (`useEffect` + `keydown` + `preventDefault` + `removeEventListener`). Fallow meldet das als Duplikat-Cluster `TemplatesModal.tsx:63-72 ↔ UsageDetailModal.tsx:36-45`.
- **Begründung:** Mit sechs identischen Aufrufstellen wäre die Extraktion in `useEscapeKey(onClose)` ein klarer Gewinn (verhindert auch das wiederkehrende „Esc-Handler vergessen"-Pattern, das im Bereich-8-Review erst aufgefallen ist). Aber: Refactoring ohne Auftrag (CLAUDE.md Regel 2) — wartet auf bewussten Hook-Hub-Sprint.
- **Trigger:** sobald ein siebter Modal-Typ entsteht, oder als Drive-by im nächsten Modal-Touch.

### CodeMirror-Mount-Pattern in JsonRawEditor und MarkdownEditor

- `src/renderer/components/JsonRawEditor.tsx:134-148` ↔ `src/renderer/components/MarkdownEditor.tsx:198-218` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Fallow meldet 21 Zeilen Duplikat im CM6-Setup (EditorState.create + EditorView + cleanup).
- **Begründung:** Beide Editoren haben unterschiedliche Extensions-Listen und unterschiedliche Buffer-Sync-Logik. Eine `createCmEditor()`-Factory würde nur die Boilerplate-Mitte einsparen, nicht den eigentlichen Setup-Aufwand. Mit nur zwei Aufrufstellen unter der Refactoring-Schwelle.
- **Trigger:** dritter CM6-Editor-Anwender (z.B. ein dedizierter YAML-Frontmatter-Editor) — dann Factory extrahieren.

### Komplexitäts-Hotspots in den Form-Modalen

- `PreCommitModal.tsx:48` (Cyclo 25, CRAP 650) · `TemplatesModal.tsx:52` (Cyclo 17, CRAP 306) · `HistoryActionModal.tsx:28` (Cyclo 14, CRAP 210) · Kategorie: **Design-by-Choice**
- **Beschreibung:** Höchste Komplexitätswerte der gesamten Codebase. Inhärent bei Form-Modalen mit IPC-Lifecycle, Loading/Error/Empty/Content-State-Maschinen und mehreren Render-Pfaden.
- **Begründung:** Mögliche Extraktion (z.B. `PreCommitFileList`, `PreCommitSensitiveWarning`, `PreCommitTriggerInfo` als Sub-Komponenten) würde die Werte halbieren, aber den Top-Level-State weiter zentralisieren. Aktuell tragbar, keine konkreten Bugs daraus.
- **Trigger:** sobald ein konkreter Bug auf einen der Modal-Render-Pfade zurückzuführen ist, der durch Sub-Komponenten besser isoliert wäre.

---

## Release-Review v0.2.0 (2026-05-17)

Befunde aus dem Release-Review von v0.1.2 → v0.2.0, die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### `NewSessionModal` On-Demand-Status-Cache invalidiert nicht bei `projectId`-Wechsel

- `src/renderer/modals/NewSessionModal.tsx:178-202` · Kategorie: **Warnung**
- **Beschreibung:** Der Season-22-Effekt für `docs:on-demand-status` cached den Status modal-lokal über `if (onDemandStatus !== null) return;`. Wenn die `projectId`-Prop sich während des Modal-Lifecycles ändert, wird der alte Cache weiter angezeigt — der Effekt feuert nicht neu, weil `onDemandStatus !== null` ist. In der aktuellen App-Struktur ist das nicht erreichbar: das Modal wird per `setShowNewSessionModal(true)` im `TabContainer` geöffnet und bleibt unverändert offen, bis Submit oder Cancel. Ein Projekt-Wechsel über die Sidebar findet vor dem Modal-Open statt.
- **Begründung:** Implicite Annahme „projectId ist stabil über Modal-Lebensdauer" ist im Code nicht festgehalten. Fix wäre eine zusätzliche Reset-Logik (`useEffect(() => { setOnDemandStatus(null); setOnDemandSelection(new Set()); }, [projectId])`) — drei Zeilen, aber ändert die Cache-Semantik (jeder simulierte Projekt-Wechsel würde IPC neu triggern). Bewusst aus Season-22-Scope rausgehalten, weil die Annahme heute trägt.
- **Trigger:** wenn das NewSessionModal jemals so erweitert wird, dass es Projekt-Wechsel während Open verarbeiten muss (z.B. „Session in anderem Projekt anlegen"-Dropdown), oder als Drive-by-Fix beim nächsten Touch.

---

## Bereich-8-Re-Review (2026-05-31)

Befunde aus dem parallelen 4-Agent-Re-Review über alle Modals + Components. Die hier gelisteten Punkte bleiben bewusst offen (Annahme trägt heute, größere Entscheidung oder additive Verbesserung). Die in derselben Runde gefixten Befunde (Fallback-Badge, YAML-Trenner-Trim, `WEEKLY_WINDOW_HOURS`, mehrstellige Modell-Version, try/catch in `refresh`/`refreshSummary`/`handleSend`/`handleCreate`, Loading-Reset im docs-sync-Cleanup) sind nicht hier, sondern direkt im Code erledigt.

### `DiffViewer`-View-Mount-Effekt ist modus-blind (Deps ohne `mode`/`baselineSha`)

- `src/renderer/components/DiffViewer.tsx:387-416` · Kategorie: **Bug** (latent)
- **Beschreibung:** Der View-Mount-Effekt listet `mode`/`baselineSha` nicht in den Deps. Aktuell verdeckt, weil der Inhalts-Lade-Effekt `original`/`working` bei jedem Wechsel zuerst auf `null` zurücksetzt und damit ohnehin ein Re-Mount erzwingt. Bricht erst, wenn der `null`-Reset im Lade-Effekt je weg-optimiert wird — dann zeigt `unifiedMergeView` weiter die alte Diff-Basis.
- **Begründung:** Im aktuellen Code kein erreichbarer Defekt; der Fix (`mode`/`baselineSha` in die Dep-Liste) ist trivial, würde aber eine heute korrekte Mechanik anfassen. Bewusst latent gelassen.
- **Trigger:** Drive-by, sobald am DiffViewer-Lade-/Mount-Pfad etwas geändert wird (insb. wenn der `null`-Reset angefasst wird).

### `JsonRawEditor` re-mountet bei instabiler `validate`-Prop

- `src/renderer/components/JsonRawEditor.tsx:71,76-148` · Kategorie: **Warnung**
- **Beschreibung:** `validate` fließt über `jsonLinter` → `extensions` → Mount-Effekt. Eine nicht-memoisierte Inline-`validate`-Closure aus der Eltern-Komponente löst pro Render einen kompletten Editor-Re-Mount aus (Cursor/Undo/Scroll verloren). Anders als `MarkdownEditor` (das Callbacks in Refs hält) verlässt sich `JsonRawEditor` auf eine referenz-stabile `validate`-Prop, ohne das zu erzwingen oder zu dokumentieren.
- **Begründung:** Die aktuellen Aufrufstellen reichen stabile `validate`-Werte durch — kein aktiver Bug. Fix wäre eine Ref-Entkopplung wie im MarkdownEditor oder eine `useCallback`-Pflicht im Prop-Kommentar.
- **Trigger:** sobald eine Aufrufstelle eine Inline-`validate`-Closure übergibt, oder beim nächsten Touch am JsonRawEditor.

### Stats-Tabelle zeigt Custom-Modelle ohne User-Label

- `src/renderer/components/ModelsView.tsx:79,123` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Die Stats-Tabelle rendert Modelle via `prettyModelId(row.model)`-Heuristik. Custom-Modelle mit eigenem User-Label erscheinen hier mit der Heuristik, nicht mit dem Label — bewusste Trennung (Stats sind ID-zentriert, Settings-Labels sind UI-Vorlieben), für den User aber potenziell überraschend.
- **Begründung:** Belassen, solange Stats bewusst ID-zentriert bleiben.
- **Trigger:** wenn Custom-Labels durchgängig in der Stats-Ansicht erscheinen sollen.
