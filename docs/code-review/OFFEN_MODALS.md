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

---

## Release-Review v0.2.1 (2026-05-17)

Befunde aus dem Release-Review von v0.2.0 → v0.2.1, die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### `HistoryActionModal.handleResume` nutzt hardcoded Font-Size 14 statt `settings.terminal_font_size`

- `src/renderer/modals/HistoryActionModal.tsx:80` · Kategorie: **Bug / Inkonsistenz**
- **Beschreibung:** `HistoryActionModal.handleResume` ruft `estimateTerminalCols(14)` mit hardcoded 14, kommentiert als „Default-Font-Size 14 ist robust für die ersten ~100 ms". Die drei anderen Resume-Pfade (`TabContainer.handleResume:182`, `LeftSidebar.handleResumeFromTabs:191`, `HistoryPane.handleResume:255`) ziehen alle `settings.terminal_font_size`. Bei abweichendem User-Setting sieht der Resume aus dem Action-Modal kurzzeitig falsche cols/rows.
- **Begründung:** Keine Regression durch den v0.2.1-Hotfix, sondern eine bereits bestehende Inkonsistenz zur Sprint-9-Settings-Migration der anderen Resume-Pfade. Praktisch geringer Effekt (Initial-Resize-Schätzung für die ersten ~100 ms, danach übernimmt der echte xterm-Resize). Fix wäre eine Zeile (`settings.terminal_font_size` statt `14`), aber außerhalb des Hotfix-Scopes.
- **Trigger:** Drive-by beim nächsten Touch an `HistoryActionModal` oder als Teil einer „Resume-Pfade vereinheitlichen"-Mini-Season.

---

## Release-Review v0.4.0 (2026-05-29)

Befunde aus dem Release-Review von v0.3.2 → v0.4.0 (Settings-Tab „Modelle" mit `custom_models` + Auto-Refresh, NewSessionModal Modell-Sentinel für terminal-Sessions), die bewusst nicht release-blockierend sind und in eigenen Seasons aufgelöst werden.

### Kein Cleanup von `default_model` / `model_limits` beim Entfernen eines Custom-Modells

- `src/renderer/modals/SettingsModal.tsx:640-648` (`removeCustomModel`) · Kategorie: **Warnung**
- **Beschreibung:** Entfernt der User ein Custom-Modell, das als `default_model` gesetzt ist, bleibt `default_model` auf der nun nicht mehr im Dropdown vorhandenen ID stehen (Controlled-`<select>`-Mismatch). Ein zugehöriger `model_limits[id]`-Eintrag verbleibt als Karteileiche.
- **Begründung:** Praktischer Effekt gering — `default_model` ist nur eine Vorauswahl, der Resolver hat `default_limit`-Fallback. Fix: beim Remove prüfen, ob die ID `default_model` ist, ggf. auf einen Built-in zurücksetzen, und verwaisten `model_limits`-Key mit aufräumen.
- **Trigger:** Drive-by beim nächsten Touch am Custom-Models-Block oder wenn ein User-Report „falsches Default-Modell nach Löschen" auftaucht.

### Controlled-`<select>`-Mismatch wenn `default_model` nicht in der Optionsliste

- `src/renderer/modals/NewSessionModal.tsx:105/447`, `src/renderer/modals/SettingsModal.tsx:658` · Kategorie: **Warnung** (keine Regression)
- **Beschreibung:** Zeigt der `value` auf eine ID, die nicht in `modelOptions` ist, rendert das Select visuell die erste Option, der State bleibt aber auf dem unsichtbaren Wert. Das Verhalten bestand identisch in v0.3.2 (statisches `MODEL_OPTIONS`) und ist durch die erweiterte Built-in-Liste eher entschärft.
- **Begründung:** Kein neuer Defekt, nur Kontext zum Cleanup-Befund oben. Sauberer wäre eine Fallback-Normalisierung (`value` auf erste Option, wenn nicht in der Liste).
- **Trigger:** zusammen mit dem Cleanup-Befund oben angehen.
