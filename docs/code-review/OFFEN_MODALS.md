# Code-Review — Bekannte offene Punkte (Modals + Components)

Befunde für `src/renderer/modals/...` und `src/renderer/components/...`, die bewusst nicht im aktuellen Scope gefixt werden — damit nachfolgende Review-Durchgänge sie nicht erneut melden.

## Format

Siehe [OFFEN_TEMPLATE.md](./OFFEN_TEMPLATE.md).

---

## ESLint-Vor-Pass-Befunde (2026-05-10) — behoben 2026-05-11

Aus dem Initial-Lint-Lauf nach ESLint-Setup. **Status: alle drei im Bereich-8-Review aufgelöst** (siehe [CHANGELOG.md](../CHANGELOG.md) 2026-05-11).

### PreCommitModal useMemo-Dep `changedFiles` instabil — behoben

- `src/renderer/modals/PreCommitModal.tsx:102` · Kategorie: **Warnung** (potenziell **Bug**)
- **Beschreibung:** `react-hooks/exhaustive-deps` meldete, dass `changedFiles` als Logical-Expression-Initialisierung jede Render-Phase eine neue Referenz hatte. Das `useMemo` an Zeile 105 lief daher bei jedem Render erneut — Memoization wirkungslos.
- **Auflösung 2026-05-11:** `changedFiles` selbst in `useMemo([state.status])` gewrappt, Dep-Array stabil, beide eslint-disable-Kommentare entfernt.

### PreCommitModal JSX unescapte Quote-Zeichen — behoben

- `src/renderer/modals/PreCommitModal.tsx:159` · Kategorie: **Warnung** (Lint-Error)
- **Beschreibung:** `react/no-unescaped-entities` meldete ein `"` (U+0022, ASCII) im JSX-Text nach der deutschen Öffnungs-Quote `„` (U+201E).
- **Auflösung 2026-05-11:** Schließquote durch `"` (U+201C, deutsche typografische Quote) ersetzt — Mischung beseitigt, Disable-Kommentar entfernt.

### DiffViewer Import `useMemo` ungenutzt — behoben

- `src/renderer/components/DiffViewer.tsx:1` · Kategorie: **Warnung**
- **Beschreibung:** Import von `useMemo` aus `react`, im File aber nicht verwendet (Refactoring-Rest aus Sprint 7).
- **Auflösung 2026-05-11:** Import bereinigt, FIXME + Disable entfernt.

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
