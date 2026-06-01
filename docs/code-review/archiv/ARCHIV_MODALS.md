# Code-Review · Modals + Components · Archiv (behobene Einträge)

Archivierte Befunde aus [`OFFEN_MODALS.md`](../OFFEN_MODALS.md) — Status **Behoben** oder **Gegenstandslos**.

---

## ESLint-Vor-Pass-Befunde (2026-05-10) — behoben 2026-05-11

Aus dem Initial-Lint-Lauf nach ESLint-Setup. **Status: alle drei im Bereich-8-Review aufgelöst** (siehe [CHANGELOG.md](../../CHANGELOG.md) 2026-05-11).

### ✅ PreCommitModal useMemo-Dep `changedFiles` instabil — behoben

- `src/renderer/modals/PreCommitModal.tsx:102` · Kategorie: **Warnung** (potenziell **Bug**)
- **Beschreibung:** `react-hooks/exhaustive-deps` meldete, dass `changedFiles` als Logical-Expression-Initialisierung jede Render-Phase eine neue Referenz hatte. Das `useMemo` an Zeile 105 lief daher bei jedem Render erneut — Memoization wirkungslos.
- **Auflösung 2026-05-11:** `changedFiles` selbst in `useMemo([state.status])` gewrappt, Dep-Array stabil, beide eslint-disable-Kommentare entfernt.

### ✅ PreCommitModal JSX unescapte Quote-Zeichen — behoben

- `src/renderer/modals/PreCommitModal.tsx:159` · Kategorie: **Warnung** (Lint-Error)
- **Beschreibung:** `react/no-unescaped-entities` meldete ein `"` (U+0022, ASCII) im JSX-Text nach der deutschen Öffnungs-Quote `„` (U+201E).
- **Auflösung 2026-05-11:** Schließquote durch `"` (U+201C, deutsche typografische Quote) ersetzt — Mischung beseitigt, Disable-Kommentar entfernt.

### ✅ DiffViewer Import `useMemo` ungenutzt — behoben

- `src/renderer/components/DiffViewer.tsx:1` · Kategorie: **Warnung**
- **Beschreibung:** Import von `useMemo` aus `react`, im File aber nicht verwendet (Refactoring-Rest aus Sprint 7).
- **Auflösung 2026-05-11:** Import bereinigt, FIXME + Disable entfernt.

---

## 2026-06-01 — Per archive-resolved.py archiviert

Verschoben aus [`OFFEN_MODALS.md`](../OFFEN_MODALS.md). Aufloesung steht je Eintrag in der **Behoben:**-Zeile.

### `HistoryActionModal.handleResume` nutzt hardcoded Font-Size 14 statt `settings.terminal_font_size`

- `src/renderer/modals/HistoryActionModal.tsx:80` · Kategorie: **Bug / Inkonsistenz**
- **Beschreibung:** `HistoryActionModal.handleResume` ruft `estimateTerminalCols(14)` mit hardcoded 14, kommentiert als „Default-Font-Size 14 ist robust für die ersten ~100 ms". Die drei anderen Resume-Pfade (`TabContainer.handleResume:182`, `LeftSidebar.handleResumeFromTabs:191`, `HistoryPane.handleResume:255`) ziehen alle `settings.terminal_font_size`. Bei abweichendem User-Setting sieht der Resume aus dem Action-Modal kurzzeitig falsche cols/rows.
- **Begründung:** Keine Regression durch den v0.2.1-Hotfix, sondern eine bereits bestehende Inkonsistenz zur Sprint-9-Settings-Migration der anderen Resume-Pfade. Praktisch geringer Effekt (Initial-Resize-Schätzung für die ersten ~100 ms, danach übernimmt der echte xterm-Resize). Fix wäre eine Zeile (`settings.terminal_font_size` statt `14`), aber außerhalb des Hotfix-Scopes.
- **Trigger:** Drive-by beim nächsten Touch an `HistoryActionModal` oder als Teil einer „Resume-Pfade vereinheitlichen"-Mini-Season.
- **Behoben:** 2026-06-01 · Inkonsistenz-Fix · Neue Prop `terminalFontSize` (App.tsx reicht `settings.terminal_font_size` durch), `estimateTerminalCols(14)` → `estimateTerminalCols(terminalFontSize)`. Fallback 14 nur während Settings-Load.

---

### `PreCommitModal` setzt `sent` beim manuellen Schließen nicht zurück

- `src/renderer/modals/PreCommitModal.tsx:63,171-175` · Kategorie: **Warnung**
- **Beschreibung:** Nach `handleSend` bleibt `sent=true` bis zum 800-ms-Auto-Close. Wird der Modal in diesem Fenster anders geschlossen (Esc/Backdrop/×) und sofort wieder geöffnet, hängt das korrekte Verhalten daran, dass die Eltern-Komponente unmountet (frischer State). Bei reinem Sichtbarkeits-Toggle bliebe der Button auf „✓ Gesendet".
- **Begründung:** Heute trägt die Annahme (Conditional-Render unmountet). Fix wäre `sent`-Reset beim Close oder ein expliziter Kommentar zur Unmount-Annahme.
- **Trigger:** Drive-by beim nächsten Touch oder falls der Modal je per Sichtbarkeit statt Conditional-Render gehalten wird.
- **Behoben:** 2026-06-01 · Warnung · `handleClose`-Wrapper (bricht Auto-Close-Timer ab + `setSent(false)`) an Esc/Backdrop/×/Abbrechen verdrahtet. Der Success-Auto-Close behält `onClose`, damit `sent` während der 800 ms „✓ Gesendet" anzeigt.

---

### Geteilter modul-globaler `TOKEN_RE` mit `g`-Flag

- `src/renderer/components/templateVariables.ts:37` · Kategorie: **Warnung**
- **Beschreibung:** `TOKEN_RE` (g-Flag) wird von `findVariablesInTemplate` (`.exec`-Schleife, setzt `lastIndex=0` defensiv) und `fillTemplateVariables` (`String.replace`, verwaltet `lastIndex` selbst) geteilt. Aktuell korrekt, aber fragil: jede künftige `.exec`/`.test`-Nutzung ohne `lastIndex`-Reset würde sporadische Treffer-Aussetzer verursachen.
- **Begründung:** Kein aktiver Bug. Sauberer wäre ein RegExp-Literal pro Aufruf oder eine `makeTokenRe()`-Factory statt geteiltem `g`-State.
- **Trigger:** dritte Nutzung des Patterns oder Drive-by beim nächsten Touch an `templateVariables.ts`.
- **Behoben:** 2026-06-01 · Warnung · `TOKEN_RE`-Modulkonstante → `makeTokenRe()`-Factory; `findVariablesInTemplate` und `fillTemplateVariables` bekommen je eine eigene `g`-Flag-Instanz, kein geteilter `lastIndex` mehr.

---

### `resolveAutoVars`-`.then` ohne `.catch` für echte Promise-Rejections

- `src/renderer/modals/TemplatesModal.tsx:285-291` · Kategorie: **Design-by-Choice**
- **Beschreibung:** Der `!result.ok`-Fall wird bewusst geschluckt (dokumentiert: Tokens bleiben literal als Hinweis auf fehlende Quelle). Es fehlt nur ein `.catch` für echte Bridge-Rejections — die liefen unbehandelt durch, statt wie gewünscht `serverAutoVars` leer zu lassen.
- **Begründung:** Bewusste Silent-Drop-Entscheidung für den Result-Fehlerpfad; nur die formale Rejection-Absicherung fehlt.
- **Trigger:** Drive-by beim nächsten Touch — optional leeres `.catch(() => {})` ergänzen.
- **Behoben:** 2026-06-01 · Design-by-Choice · `.catch(() => setServerAutoVars({}))` für echte Bridge-Rejections ergänzt; der `!result.ok`-Result-Fehlerfall bleibt bewusst silent (Tokens literal).

---

### `Number('')` → `0` in den Settings-Number-Inputs

- `src/renderer/modals/SettingsModal.tsx:471-476,683-686,1015-1018` (u.a.) · Kategorie: **Verbesserung**
- **Beschreibung:** Leert der User ein Number-Feld komplett, ist `Number('') === 0`. Bei `>= 0`-Guards wird damit still `0` geschrieben statt das Editieren zuzulassen; bei `> 0`-Guards bleibt der alte Wert, das Feld zeigt aber leer (Controlled-Input-Friktion).
- **Begründung:** Kein Datenfehler, nur leichte Editier-UX-Reibung, konsistent über alle Inputs. Fix: `value === '' → return` voranstellen.
- **Trigger:** beim nächsten Touch an den Settings-Number-Inputs.
- **Behoben:** 2026-06-01 · Verbesserung · `value === '' → return` vor allen 0-schreibenden `>= 0`/0-zulässigen Inputs (screenshot_retention, token_warning_thresholds, context_soft_warning, weekly hour/minute, template_top_n). Die `> 0`-Guards (model_limits, default_limit, p90, font-size) schrieben bei leerem Feld ohnehin nichts und blieben unangetastet (Surgical).

---

### `context_soft_warning` inline gepatcht statt über Patch-Helper

- `src/renderer/modals/SettingsModal.tsx:1075-1080,1095-1098` · Kategorie: **Verbesserung**
- **Beschreibung:** Für `screenshot_retention`, `model_limits`, `token_warning_thresholds`, `template_top_n` gibt es je einen dedizierten Patch-Setter; `context_soft_warning` wird dagegen zweimal inline mit `setField('context_soft_warning', { ... })` gepatcht. Funktional korrekt, nur Stil-Abweichung.
- **Begründung:** Reine Konsistenz-Verbesserung, kein Defekt.
- **Trigger:** beim nächsten Touch am Soft-Warning-Block — `setSoftWarning`-Helper einführen.
- **Behoben:** 2026-06-01 · Verbesserung · `setSoftWarning`-Patch-Helper (analog `setThreshold`/`setTopN`) eingeführt; beide Inline-`setField('context_soft_warning', …)` darüber gefahren.

---

### Magic-Numbers + duplizierte Inline-Styles im TemplatesModal

- `src/renderer/modals/TemplatesModal.tsx:144-148,162-169,741-778` · Kategorie: **Verbesserung**
- **Beschreibung:** Modal-Größe (820), Drag-Bounding-Werte und zwei nahezu identische Button-Inline-Style-Objekte (AutoVarRow) stehen als nackte Zahlen/Inline-Styles, abweichend vom `td-*`-CSS-Klassen-Stil des restlichen Modals.
- **Begründung:** Kosmetik/Konsistenz, kein Defekt.
- **Trigger:** beim nächsten Touch am TemplatesModal — Konstanten zentralisieren, Styles in eine `td-btn-link`-Klasse.
- **Behoben:** 2026-06-01 · Verbesserung · Modul-Konstanten `MODAL_WIDTH_PX`/`MODAL_MAX_HEIGHT_PX`/`DRAG_*` eingeführt; `.td-btn-link`-CSS-Klasse in `app.css` angelegt (existierte vorher nicht) und die duplizierten Inline-Style-Objekte aus beiden „Mehr"/„Weniger"-Buttons entfernt.

---

### `bulletCount`-Heuristik an `- `-Prefix gekoppelt

- `src/renderer/modals/TemplatesModal.tsx:725` · Kategorie: **Verbesserung**
- **Beschreibung:** `bulletCount` zählt nur Zeilen mit exaktem `- `-Prefix. Liefert eine Auto-Var-Quelle `* `, `1. ` oder eingerückte Bullets, zeigt die Sidebar „N Zeichen" statt „N Einträge". Kosmetisch — voller Inhalt bleibt im Preview-Pane sichtbar.
- **Begründung:** Kein Funktionsfehler. Fix: Erkennung gegen `/^\s*[-*]\s/` absichern.
- **Trigger:** wenn eine Auto-Var-Quelle ein abweichendes Bullet-Format liefert, oder Drive-by.
- **Behoben:** 2026-06-01 · Verbesserung · `bulletCount` zählt jetzt gegen `/^\s*[-*]\s/` statt `startsWith('- ')` — `*`- und eingerückte Bullets zählen mit.

---

### Sensitive-File-Default ohne `*.pfx`/`*.p12`/`.npmrc`/`.htpasswd`

- `src/renderer/components/sensitiveFiles.ts:22-30` · Kategorie: **Verbesserung**
- **Beschreibung:** Die geforderten Muster (`.env*`, `*secret*`, `*token*`, `*.pem`, `id_rsa`) sind alle vorhanden. Nicht abgedeckt sind verwandte Secret-Träger: `.pfx`/`.p12` (PKCS#12-Keystores), `.npmrc`/`.pypirc` (Auth-Tokens), `.htpasswd`.
- **Begründung:** Reine Erweiterung der Default-Liste, kein Defekt. Der User kann eigene Patterns ergänzen.
- **Trigger:** beim nächsten Touch an der Sensitive-Patterns-Default-Liste.
- **Behoben:** 2026-06-01 · Verbesserung · `*.pfx`/`*.p12`, `.npmrc`/`.pypirc`, `.htpasswd` zu `SENSITIVE_BASENAME_PATTERNS` ergänzt; `sensitive-files.test.ts` um die neuen Muster (inkl. False-Positive-Guard `npmrc.example`) erweitert.

---

### `DiffViewer`-`original`-Ladefehler nur als `console.warn`

- `src/renderer/components/DiffViewer.tsx:370-373` · Kategorie: **Verbesserung**
- **Beschreibung:** Schlägt `git.show` für `original` fehl, wird `original=''` gesetzt und nur `console.warn` geloggt — der Diff zeigt dann alle Zeilen als Hinzufügung. Bei echten neuen Dateien korrekt, bei einem echten git-Fehler aber als „neue Datei" fehlinterpretiert, ohne UI-Hinweis. Der `doc`-Pfad setzt dagegen `error`.
- **Begründung:** Bewusste Asymmetrie (neue Dateien sollen nicht als Fehler erscheinen); ein echter Fehler bleibt aber unsichtbar.
- **Trigger:** Drive-by — „Datei existiert in ref nicht" vs. sonstiger git-Fehler unterscheiden und letzteren als dezenten Inline-Hinweis zeigen.
- **Behoben:** 2026-06-01 · Verbesserung · `origRes`-Fehlerpfad symmetrisch zum doc-Pfad gemacht (`setError` statt still `setOriginal('')` + `console.warn`). Befund war leicht gedriftet: der Treiber (`git/driver.ts showFile`) fängt echte neue Dateien bereits intern ab und liefert `ok:''`, daher trifft der Else-Zweig nur echte Infrastruktur-Fehler — die deutlich sichtbar zu machen ist korrekt. Eine feinere „nicht-in-ref vs. git-Fehler"-Unterscheidung gehört in den Treiber (MAIN_SERVICES) und bleibt dort offen.

---

### Uneinheitliche Marker-Sprache `PreCommitModal.markChar` vs. `DiffViewer.markFor`

- `src/renderer/modals/PreCommitModal.tsx:311,321-340` · Kategorie: **Verbesserung**
- **Beschreibung:** `markChar` unterscheidet Index- vs. Worktree-Status nicht (zeigt für beide denselben Großbuchstaben), während `DiffViewer.markFor` Index-Marks per Kleinbuchstaben (`m`/`a`) abgrenzt. Kein Bug, nur uneinheitliche Marker-Sprache zwischen den beiden Listen.
- **Begründung:** Rein kosmetische Inkonsistenz.
- **Trigger:** bei einer Marker-Vereinheitlichung die Index-vs-Worktree-Unterscheidung aus DiffViewer auch in PreCommitModal übernehmen.
- **Behoben:** 2026-06-01 · Verbesserung · `markChar` nimmt jetzt `(worktree, index)` und vergibt Kleinbuchstaben (`m`/`a`/`d`/`r`/`c`/`u`) für reine Index-Änderungen — gleiche Marker-Sprache wie `DiffViewer.markFor`.

---

## 2026-06-01 — Per archive-resolved.py archiviert

Verschoben aus [`OFFEN_MODALS.md`](../OFFEN_MODALS.md). Aufloesung steht je Eintrag in der **Behoben:**-Zeile.

### Kein Cleanup von `default_model` / `model_limits` beim Entfernen eines Custom-Modells

- `src/renderer/modals/SettingsModal.tsx:640-648` (`removeCustomModel`) · Kategorie: **Warnung**
- **Beschreibung:** Entfernt der User ein Custom-Modell, das als `default_model` gesetzt ist, bleibt `default_model` auf der nun nicht mehr im Dropdown vorhandenen ID stehen (Controlled-`<select>`-Mismatch). Ein zugehöriger `model_limits[id]`-Eintrag verbleibt als Karteileiche.
- **Begründung:** Praktischer Effekt gering — `default_model` ist nur eine Vorauswahl, der Resolver hat `default_limit`-Fallback. Fix: beim Remove prüfen, ob die ID `default_model` ist, ggf. auf einen Built-in zurücksetzen, und verwaisten `model_limits`-Key mit aufräumen.
- **Trigger:** Drive-by beim nächsten Touch am Custom-Models-Block oder wenn ein User-Report „falsches Default-Modell nach Löschen" auftaucht.
- **Behoben:** 2026-06-01 · Variante B · `removeCustomModel` setzt `default_model` auf das erste Built-in zurück, wenn das gelöschte Modell der Default war, und löscht den verwaisten `model_limits`-Key. Dazu der defensive Select-Guard (siehe #9). User-Entscheidung: B + erstes Built-in.

---

### Controlled-`<select>`-Mismatch wenn `default_model` nicht in der Optionsliste

- `src/renderer/modals/NewSessionModal.tsx:105/447`, `src/renderer/modals/SettingsModal.tsx:658` · Kategorie: **Warnung** (keine Regression)
- **Beschreibung:** Zeigt der `value` auf eine ID, die nicht in `modelOptions` ist, rendert das Select visuell die erste Option, der State bleibt aber auf dem unsichtbaren Wert. Das Verhalten bestand identisch in v0.3.2 (statisches `MODEL_OPTIONS`) und ist durch die erweiterte Built-in-Liste eher entschärft.
- **Begründung:** Kein neuer Defekt, nur Kontext zum Cleanup-Befund oben. Sauberer wäre eine Fallback-Normalisierung (`value` auf erste Option, wenn nicht in der Liste).
- **Trigger:** zusammen mit dem Cleanup-Befund oben angehen.
- **Behoben:** 2026-06-01 · Variante B · Gemeinsamer Helper `resolveModelSelectValue(value, options)` in `@shared/models`; beide Selects (SettingsModal-Default + NewSessionModal-Modell) fallen in der Anzeige auf die erste Option zurück, wenn der Wert nicht in der Optionsliste ist. Display-Guard (belt-and-suspenders); die eigentliche Quelle hält jetzt #8 sauber. Helper-Verhalten in `tests/shared/models.test.ts` abgedeckt.
