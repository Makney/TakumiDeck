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

---

## Bereich-8-Re-Review (2026-05-31)

Befunde aus dem parallelen 4-Agent-Re-Review über alle Modals + Components. Die hier gelisteten Punkte bleiben bewusst offen (Annahme trägt heute, größere Entscheidung oder additive Verbesserung). Die in derselben Runde gefixten Befunde (Fallback-Badge, YAML-Trenner-Trim, `WEEKLY_WINDOW_HOURS`, mehrstellige Modell-Version, try/catch in `refresh`/`refreshSummary`/`handleSend`/`handleCreate`, Loading-Reset im docs-sync-Cleanup) sind nicht hier, sondern direkt im Code erledigt.

### `DiffViewer`-View-Mount-Effekt ist modus-blind (Deps ohne `mode`/`baselineSha`)

- `src/renderer/components/DiffViewer.tsx:387-416` · Kategorie: **Bug** (latent)
- **Beschreibung:** Der View-Mount-Effekt listet `mode`/`baselineSha` nicht in den Deps. Aktuell verdeckt, weil der Inhalts-Lade-Effekt `original`/`working` bei jedem Wechsel zuerst auf `null` zurücksetzt und damit ohnehin ein Re-Mount erzwingt. Bricht erst, wenn der `null`-Reset im Lade-Effekt je weg-optimiert wird — dann zeigt `unifiedMergeView` weiter die alte Diff-Basis.
- **Begründung:** Im aktuellen Code kein erreichbarer Defekt; der Fix (`mode`/`baselineSha` in die Dep-Liste) ist trivial, würde aber eine heute korrekte Mechanik anfassen. Bewusst latent gelassen.
- **Trigger:** Drive-by, sobald am DiffViewer-Lade-/Mount-Pfad etwas geändert wird (insb. wenn der `null`-Reset angefasst wird).

### `PreCommitModal` setzt `sent` beim manuellen Schließen nicht zurück

- `src/renderer/modals/PreCommitModal.tsx:63,171-175` · Kategorie: **Warnung**
- **Beschreibung:** Nach `handleSend` bleibt `sent=true` bis zum 800-ms-Auto-Close. Wird der Modal in diesem Fenster anders geschlossen (Esc/Backdrop/×) und sofort wieder geöffnet, hängt das korrekte Verhalten daran, dass die Eltern-Komponente unmountet (frischer State). Bei reinem Sichtbarkeits-Toggle bliebe der Button auf „✓ Gesendet".
- **Begründung:** Heute trägt die Annahme (Conditional-Render unmountet). Fix wäre `sent`-Reset beim Close oder ein expliziter Kommentar zur Unmount-Annahme.
- **Trigger:** Drive-by beim nächsten Touch oder falls der Modal je per Sichtbarkeit statt Conditional-Render gehalten wird.

### `JsonRawEditor` re-mountet bei instabiler `validate`-Prop

- `src/renderer/components/JsonRawEditor.tsx:71,76-148` · Kategorie: **Warnung**
- **Beschreibung:** `validate` fließt über `jsonLinter` → `extensions` → Mount-Effekt. Eine nicht-memoisierte Inline-`validate`-Closure aus der Eltern-Komponente löst pro Render einen kompletten Editor-Re-Mount aus (Cursor/Undo/Scroll verloren). Anders als `MarkdownEditor` (das Callbacks in Refs hält) verlässt sich `JsonRawEditor` auf eine referenz-stabile `validate`-Prop, ohne das zu erzwingen oder zu dokumentieren.
- **Begründung:** Die aktuellen Aufrufstellen reichen stabile `validate`-Werte durch — kein aktiver Bug. Fix wäre eine Ref-Entkopplung wie im MarkdownEditor oder eine `useCallback`-Pflicht im Prop-Kommentar.
- **Trigger:** sobald eine Aufrufstelle eine Inline-`validate`-Closure übergibt, oder beim nächsten Touch am JsonRawEditor.

### Geteilter modul-globaler `TOKEN_RE` mit `g`-Flag

- `src/renderer/components/templateVariables.ts:37` · Kategorie: **Warnung**
- **Beschreibung:** `TOKEN_RE` (g-Flag) wird von `findVariablesInTemplate` (`.exec`-Schleife, setzt `lastIndex=0` defensiv) und `fillTemplateVariables` (`String.replace`, verwaltet `lastIndex` selbst) geteilt. Aktuell korrekt, aber fragil: jede künftige `.exec`/`.test`-Nutzung ohne `lastIndex`-Reset würde sporadische Treffer-Aussetzer verursachen.
- **Begründung:** Kein aktiver Bug. Sauberer wäre ein RegExp-Literal pro Aufruf oder eine `makeTokenRe()`-Factory statt geteiltem `g`-State.
- **Trigger:** dritte Nutzung des Patterns oder Drive-by beim nächsten Touch an `templateVariables.ts`.

### `resolveAutoVars`-`.then` ohne `.catch` für echte Promise-Rejections

- `src/renderer/modals/TemplatesModal.tsx:285-291` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Der `!result.ok`-Fall wird bewusst geschluckt (dokumentiert: Tokens bleiben literal als Hinweis auf fehlende Quelle). Es fehlt nur ein `.catch` für echte Bridge-Rejections — die liefen unbehandelt durch, statt wie gewünscht `serverAutoVars` leer zu lassen.
- **Begründung:** Bewusste Silent-Drop-Entscheidung für den Result-Fehlerpfad; nur die formale Rejection-Absicherung fehlt.
- **Trigger:** Drive-by beim nächsten Touch — optional leeres `.catch(() => {})` ergänzen.

### `Number('')` → `0` in den Settings-Number-Inputs

- `src/renderer/modals/SettingsModal.tsx:471-476,683-686,1015-1018` (u.a.) · Kategorie: **Verbesserung**
- **Beschreibung:** Leert der User ein Number-Feld komplett, ist `Number('') === 0`. Bei `>= 0`-Guards wird damit still `0` geschrieben statt das Editieren zuzulassen; bei `> 0`-Guards bleibt der alte Wert, das Feld zeigt aber leer (Controlled-Input-Friktion).
- **Begründung:** Kein Datenfehler, nur leichte Editier-UX-Reibung, konsistent über alle Inputs. Fix: `value === '' → return` voranstellen.
- **Trigger:** beim nächsten Touch an den Settings-Number-Inputs.

### `context_soft_warning` inline gepatcht statt über Patch-Helper

- `src/renderer/modals/SettingsModal.tsx:1075-1080,1095-1098` · Kategorie: **Verbesserung**
- **Beschreibung:** Für `screenshot_retention`, `model_limits`, `token_warning_thresholds`, `template_top_n` gibt es je einen dedizierten Patch-Setter; `context_soft_warning` wird dagegen zweimal inline mit `setField('context_soft_warning', { ... })` gepatcht. Funktional korrekt, nur Stil-Abweichung.
- **Begründung:** Reine Konsistenz-Verbesserung, kein Defekt.
- **Trigger:** beim nächsten Touch am Soft-Warning-Block — `setSoftWarning`-Helper einführen.

### Stats-Tabelle zeigt Custom-Modelle ohne User-Label

- `src/renderer/components/ModelsView.tsx:79,123` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Die Stats-Tabelle rendert Modelle via `prettyModelId(row.model)`-Heuristik. Custom-Modelle mit eigenem User-Label erscheinen hier mit der Heuristik, nicht mit dem Label — bewusste Trennung (Stats sind ID-zentriert, Settings-Labels sind UI-Vorlieben), für den User aber potenziell überraschend.
- **Begründung:** Belassen, solange Stats bewusst ID-zentriert bleiben.
- **Trigger:** wenn Custom-Labels durchgängig in der Stats-Ansicht erscheinen sollen.

### Magic-Numbers + duplizierte Inline-Styles im TemplatesModal

- `src/renderer/modals/TemplatesModal.tsx:144-148,162-169,741-778` · Kategorie: **Verbesserung**
- **Beschreibung:** Modal-Größe (820), Drag-Bounding-Werte und zwei nahezu identische Button-Inline-Style-Objekte (AutoVarRow) stehen als nackte Zahlen/Inline-Styles, abweichend vom `td-*`-CSS-Klassen-Stil des restlichen Modals.
- **Begründung:** Kosmetik/Konsistenz, kein Defekt.
- **Trigger:** beim nächsten Touch am TemplatesModal — Konstanten zentralisieren, Styles in eine `td-btn-link`-Klasse.

### `bulletCount`-Heuristik an `- `-Prefix gekoppelt

- `src/renderer/modals/TemplatesModal.tsx:725` · Kategorie: **Verbesserung**
- **Beschreibung:** `bulletCount` zählt nur Zeilen mit exaktem `- `-Prefix. Liefert eine Auto-Var-Quelle `* `, `1. ` oder eingerückte Bullets, zeigt die Sidebar „N Zeichen" statt „N Einträge". Kosmetisch — voller Inhalt bleibt im Preview-Pane sichtbar.
- **Begründung:** Kein Funktionsfehler. Fix: Erkennung gegen `/^\s*[-*]\s/` absichern.
- **Trigger:** wenn eine Auto-Var-Quelle ein abweichendes Bullet-Format liefert, oder Drive-by.

### Sensitive-File-Default ohne `*.pfx`/`*.p12`/`.npmrc`/`.htpasswd`

- `src/renderer/components/sensitiveFiles.ts:22-30` · Kategorie: **Verbesserung**
- **Beschreibung:** Die geforderten Muster (`.env*`, `*secret*`, `*token*`, `*.pem`, `id_rsa`) sind alle vorhanden. Nicht abgedeckt sind verwandte Secret-Träger: `.pfx`/`.p12` (PKCS#12-Keystores), `.npmrc`/`.pypirc` (Auth-Tokens), `.htpasswd`.
- **Begründung:** Reine Erweiterung der Default-Liste, kein Defekt. Der User kann eigene Patterns ergänzen.
- **Trigger:** beim nächsten Touch an der Sensitive-Patterns-Default-Liste.

### `DiffViewer`-`original`-Ladefehler nur als `console.warn`

- `src/renderer/components/DiffViewer.tsx:370-373` · Kategorie: **Verbesserung**
- **Beschreibung:** Schlägt `git.show` für `original` fehl, wird `original=''` gesetzt und nur `console.warn` geloggt — der Diff zeigt dann alle Zeilen als Hinzufügung. Bei echten neuen Dateien korrekt, bei einem echten git-Fehler aber als „neue Datei" fehlinterpretiert, ohne UI-Hinweis. Der `doc`-Pfad setzt dagegen `error`.
- **Begründung:** Bewusste Asymmetrie (neue Dateien sollen nicht als Fehler erscheinen); ein echter Fehler bleibt aber unsichtbar.
- **Trigger:** Drive-by — „Datei existiert in ref nicht" vs. sonstiger git-Fehler unterscheiden und letzteren als dezenten Inline-Hinweis zeigen.

### Uneinheitliche Marker-Sprache `PreCommitModal.markChar` vs. `DiffViewer.markFor`

- `src/renderer/modals/PreCommitModal.tsx:311,321-340` · Kategorie: **Verbesserung**
- **Beschreibung:** `markChar` unterscheidet Index- vs. Worktree-Status nicht (zeigt für beide denselben Großbuchstaben), während `DiffViewer.markFor` Index-Marks per Kleinbuchstaben (`m`/`a`) abgrenzt. Kein Bug, nur uneinheitliche Marker-Sprache zwischen den beiden Listen.
- **Begründung:** Rein kosmetische Inkonsistenz.
- **Trigger:** bei einer Marker-Vereinheitlichung die Index-vs-Worktree-Unterscheidung aus DiffViewer auch in PreCommitModal übernehmen.
