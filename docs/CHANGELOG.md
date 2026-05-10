# Änderungsprotokoll

Dieses Dokument hält **abgeschlossene** Entwicklungs-Sessions fest. Es ist ein Spickzettel für das zukünftige Ich (und Co-Agenten), um zu sehen *was wann warum* gebaut wurde, ohne durch Git-History graben zu müssen.

## Regel für neue Einträge

Nach jedem erfolgreich implementierten Feature:

1. **Hier** einen neuen Abschnitt mit Datum oben anfügen (neuster zuerst).
2. In [FEATURES.md](./FEATURES.md) den betroffenen Eintrag von ⛔/🟡 auf ✅ setzen.
3. Wenn Roadmap-Phasen erledigt sind, in [ROADMAP.md](./ROADMAP.md) streichen oder als „erledigt" markieren.
4. Wenn architektonische Entscheidungen dabei waren, einen Eintrag in [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md) – dort geht es nur um das *Warum*.

Ein Eintrag ist **kurz und anwendungsorientiert**: „Was kann der Nutzer jetzt, was vorher nicht ging?", plus die wichtigsten Dateien, die sich geändert haben. Die *detaillierte* Code-Beschreibung gehört in die Commit-Message, nicht hierhin.

**Keine „Geänderte Dateien"-Listen** — das liefert die Git-History. Eintrag konzentriert sich auf den Nutzer-Mehrwert und die dahinter stehenden Entscheidungen.

---

## 2026-05-10 — Season 8: Polish — MVP-Abschluss

### Was jetzt geht

- **Settings-Dialog mit sechs Tabs (Architektur 6.9).** Ctrl+K oder Settings-Icon im Header öffnen das Modal: Allgemein (Theme, claude-Binary-Pfad, Open-Data-Folder, Akzent-Farbe), Workspace (Pfad, manueller Re-Scan, Sensitive-Patterns als JSON), Modelle (Default-Modell, Per-Modell-Limits, Default-Limit), Token-Tracking (P90-Window, Warning-Schwellen, Plannutzungs-Bars als JSON), Terminal (Font-Family, Font-Size), About (Version, Repo, Lizenz). Form-Inputs sind Auto-Save mit 500-ms-Debounce + Coalescing pro Patch — Indikator unten links zeigt „Auto-Save aktiv / Speichert… / ✓ Gespeichert (N Felder) / ⚠ <Fehler>". Komplexe Settings (`limit_bars[]`, `sensitive_file_patterns[]`) leben in einem CodeMirror-6-JSON-Editor mit Live-Lint (300-ms-Debounce, zod-validiert) und explizitem „Anwenden"-Knopf — Apply ist nur bei valider Quelle aktiv.
- **Header-Bar (Architektur 6.0, td-titlebar).** 36-px-Bar oben mit drei Sektionen: Brand (匠-Kanji + TakumiDeck + Version), Meta (aktives Projekt, Branch via `git:status`-Cache, running/total Sessions-Counter), Window-Controls (⚙ Settings-Icon + min/max/close). Drag-Region via `-webkit-app-region: drag`. Native Electron-Frame ist `frame: false` — keine doppelte Title-Bar mehr. Branch-Anzeige re-loadet bei Project-Wechsel und nach `td-git-refresh`-CustomEvent (PreCommitModal feuert ihn nach Send) plus manuellem ↻-Knopf, kein Polling.
- **Crash-Recovery-Reconciliation-Pass beim App-Start.** Nach `openDatabase()` läuft `reconcileCrashedSessions`: alle running- und idle-Sessions mit `ended_at IS NULL` werden via `lifecycle.transition('interrupted', 'app-quit')` gepatcht, danach `ended_at` auf `MAX(messages.ts)` der Session korrigiert (genaueste verfügbare Approximation des Crash-Zeitpunkts statt nichtssagendem App-Start-Now). Sessions ohne Messages bleiben bei `now()` als Fallback. Idempotent — zweiter Pass macht nichts mehr.
- **Datei-Tab-Persistenz pro Projekt.** `useFileTabsStore.hydrateFromStorage` rekonstruiert beim App-Start die Tab-Liste pro Projekt aus localStorage (Schlüssel `td.fileTabs`, Schema-versioniert `v: 1`); jeder file-Tab triggert einen `fs:read` im Hintergrund, sodass der Inhalt sauber re-fetched wird. Diff-Tab überlebt unverändert vorne. Persistenz schreibt nur die Tab-Identitäten (id/kind/relPath/label + activeId) — kein Buffer-Cache, sodass extern editierte Dateien beim Re-Open keinen Konflikt-UI brauchen. Korrupte/version-fremde Snapshots werden still verworfen.
- **Konfigurierbare Sensitive-File-Patterns (additiv zu den hartcoded Defaults).** Neue Settings-Spalte `sensitive_file_patterns: string[]` (Default `[]`, RegEx-Quellen). `findSensitiveFiles` nimmt das Array als zweiten Parameter, kompiliert die User-Patterns zur Laufzeit (kaputte Quellen werden still gedroppt) und matcht sie auf den ganzen `relPath` zusätzlich zu den hartcoded Basename-Defaults `.env(.*)`, `secrets.*`, `*.key`, `*.pem`. PreCommitModal reicht die User-Liste durch.
- **Modell-Limit-Defaults korrekt auf 200 000 Token.** TECH_SCHULDEN-Eintrag aufgelöst — Per-Session-Kontext-Bar skaliert jetzt realistisch (80 k Tokens zeigen ~40 % statt vorher ~8 %). Extended-Context-Beta lässt sich pro Modell im Settings-Dialog auf 1 000 000 hochsetzen.
- **Tastatur-Hints unter dem Terminal.** Statische `<kbd>`-Pillen-Reihe: `Enter` senden · `Ctrl+T` Templates · `Ctrl+N` Neue Session · `Ctrl+K` Einstellungen · `Ctrl+Tab` nächster Tab. Lädt zur Erkundung ein, ohne Cheatsheet-Modal.
- **Error-Handling-Pässe (V7-C: User-Aktion vorne, technische Details on-Demand).** FS-IPC mappt EACCES/EPERM/EBUSY auf `FS_PERMISSION` mit konkretem Aktion-Hint („Antimalware-Scanner oder Cloud-Sync könnte die Datei locken"); SQLite bekommt `pragma busy_timeout=5000` und macht damit interne Backoffs statt SQLITE_BUSY-Throws bei parallelem Watcher-Insert + before-quit-Patch; neuer `app:claude-health`-Channel prüft die `claude_binary_path`-Auflösbarkeit beim App-Start und nach jedem PTY-Spawn-Fehler — fehlende Binary erscheint als anklickbarer ⚠-Banner in der Header-Bar, der direkt das Settings-Modal öffnet.
- **`SESSION_NO_CLAUDE_UUID`-Hint im Verlauf-Detail-Pane.** TECH_SCHULDEN-Reminder aus Sprint 6/7 aufgelöst: Resume einer Pre-Hotfix-Session ohne JSONL gibt jetzt eine gezielte Hint-Box („Session ist nicht mehr resume-fähig — externe UUID nicht rekonstruierbar") mit einem Direkt-Archivieren-Knopf statt der nackten globalen Fehlermeldung.
- **Build + Distribution: Squirrel-Setup + Portable-ZIP.** `npm run make` produziert beide Artefakte parallel — `out/make/squirrel.windows/x64/TakumiDeck-<version> Setup.exe` für die klassische Windows-Installation, `out/make/zip/win32/x64/TakumiDeck-win32-x64-<version>.zip` für USB-Stick / Probelauf / Distribution an Freunde ohne Installations-Stress. Manuelle GitHub-Release-Anleitung in `docs/DEV_SETUP.md`. Kein Code-Signing, kein Auto-Update (Phase 5+, Architektur 12).

### Umgesetzte Entscheidungen

- **9 Variants vor dem Code, alle Empfehlungen direkt übernommen.** V1-A (Live-JSON-Lint debounced 300 ms), V2-A (Auto-Save pro Form-Field 500 ms + expliziter Apply für Raw-JSON), V3-B (Branch via Cache + Trigger-Refresh), V4-C (`ended_at` aus `MAX(messages.ts)`), V5-A (nur Tab-Liste, kein Buffer-Cache), V6-B (Setup + Portable-ZIP), V7-C (Mix: User-Aktion vorne, Details on-Demand), V8-A (Sensitive-Patterns additiv), V9-A (Settings-Dialog zuerst, dann isolierte Wins, dann Chrome, dann Polish, dann Build). Plus drei Bugfix-Entscheidungen nach User-Screenshot: Filter-Pillen-Wrap, `frame: false`, Spalten-Verteilung 1.6fr/1fr.
- **Driver-Injection bleibt das tragende Test-Pattern.** `reconciliation.ts` nimmt `SessionRepository` + `MessageRepository` + `SessionLifecycle` injiziert — Tests fahren mit den InMemory-Drivern aus Sprint 2/5, kein echtes SQLite. `settingsAutoSave.ts` nimmt `SettingsApi` + `Scheduler` injiziert — Tests fahren mit Manual-Scheduler statt vi.useFakeTimers, deterministisch ohne Timer-Tricks.
- **Memory-Konvention „UX-Defaults: konvenient vor traditionell" 8 von 9 Mal getragen.** V1-A (Live-Lint statt on-Save), V2-A (Auto-Save statt Save-Button), V3-B (Cache statt Polling — billiger Daily-Driver), V4-C (genaue Approximation statt now()), V5-A (Tab-Liste-Persist statt Buffer-Cache mit Konflikt-UI), V7-C (Mix statt rein-technisch), V8-A (additiv statt komplette Übernahme), V9-A (Skeleton-First-Reihenfolge). V6-B war neutral (Setup+Portable parallel). Memory-Konvention bleibt damit empirisch validiert.

### Mid-Sprint-Anpassungen

- **User-Screenshot zeigte drei Layout-Defekte gleichzeitig.** (1) HistoryPane-Filter-Pillen wurden vom `overflow: hidden` der Mid-Spalte abgeschnitten, weil `.td-history-filter-group` kein `flex-wrap: wrap` hatte (Group-Container mit `<span>Status</span>` + `<div class="td-form-pills">…</div>` als ein Flex-Item). Fix: Group bekommt `flex-wrap: wrap` + `min-width: 0`, Label `flex-shrink: 0`. (2) Doppel-Header (Electron-Native + meine td-titlebar). Fix: `frame: false` in `BrowserWindow`. (3) 1fr/1fr-Mid-Verteilung war für Tabelle + Filter zu eng. Fix: 1.6fr/1fr — Terminal/Verlauf bekommt 62 % der Mittenfläche. Alle drei in einem Pass nach AskUserQuestion-Abklärung.
- **`@codemirror/lang-json` als neue Dependency.** Settings-Dialog braucht den JSON-Sprache-Modus für die Raw-JSON-Editoren. Kein Workaround mit textarea (User hat „CodeMirror 6 wiederverwenden" als etablierte Entscheidung gelistet). Installation per `npm install`, package-lock.json updated.
- **`registerAppIpc()` braucht jetzt `SettingsStore`.** `app:claude-health` muss `claude_binary_path` aus den Settings lesen — Signatur erweitert um optionales `deps?: { settings?: SettingsStore }`. Aufrufer in `main.ts` reicht den Store durch; bei `undefined` (Tests) fällt der Health-Check auf `'claude'` zurück.

### Bonus-Bugfixes unterwegs

- **`PreCommitModal` feuert nach Send `td-git-refresh`.** Header-Bar weiß sonst nicht, dass sich nach einem erfolgreichen Commit-Trigger der Branch-State ändern könnte (z.B. Working-Tree-Clean nach Commit). CustomEvent-Pattern analog `td-template-send` — billiger als ein zusätzlicher IPC-Roundtrip.
- **`TerminalTab` feuert bei Spawn-Fehler `td-claude-recheck`.** Header-Bar re-checkt die Binary-Health, der ⚠-Banner erscheint sofort statt erst beim nächsten manuellen Health-Lookup.

### Offen geblieben (bewusst Phase 2/5+)

- **Code-Signing + Auto-Update** — Architektur 12, Phase 5+. SmartScreen-Warnung bei der ersten Installation ist akzeptierter Single-User-Tradeoff.
- **GitHub Actions Build** — bei Bedarf wenn aktiv geteilt wird. Sprint 8 nutzt manuelle Releases.
- **Light-Theme** — Phase 2. Dark ist im MVP einheitlich.
- **Phase-2/5-Auslassungen aus Architektur 12** unverändert: Worktree-UI, Pull/Fetch/Branch-Switch, Brainstorming-Panel, OpenAI Codex als zweite Engine, semantische Chunk-Suche, mehrere Workspace-Ordner, Stream-JSON-Mode.
- **Notes-Auto-Save bei Hard-Quit best-effort** — TECH_SCHULDEN-Eintrag bleibt. Synchroner IPC-Pfad lohnt sich nur, wenn das in der Praxis schmerzt.
- **`awaitWriteFinish`-Latenz im JSONL-Watcher** — TECH_SCHULDEN. 100-ms-Verzögerung der Live-Updates. Phase-2-Optimierung wäre zweiter Polling-Ring mit fs-stat.
- **Multi-Session-im-selben-cwd-Backfill nimmt nur die jüngste** — TECH_SCHULDEN, Edge-Case.

### MVP-Abschluss

Phase 1 ist komplett. Alle Roadmap-Features auf ✅. 396 Tests grün, Suite ~1.1 s. Ready für `npm run make` und manuelle GitHub-Release.

---

## 2026-05-10 — Season 7: Editor + Git + Right-Pane

### Was jetzt geht

- **Right-Pane als 4-Spalten-Grid (240 / 1fr / 1fr / 232 px).** Editor + Diff bekommen eine eigene breite Spalte (3. Grid-Cell, full-flex), Files + Notes leben als schmaler 232-px-Stack ganz rechts (4. Grid-Cell, full-height), PlanPane wandert von „Mitte unten" nach „Editor unten" (3. Spalte, untere Zeile). StatsPane bleibt unter dem Terminal (2. Spalte unten). Layout-Klassen `td-col-mid-top / -mid-bottom / -right-top / -right-bottom / -right-stack` 1:1 aus `docs/design/claude-export/styles.css` übernommen — nicht mehr selbst erfunden.
- **Markdown-Editor mit CodeMirror 6.** `@codemirror/lang-markdown` + `@codemirror/lang-yaml`, oneDark als Highlighting-Basis plus Custom-Theme-Override für Background / Selection / Cursor / Gutter auf die `td-*`-Variablen. Manueller Save mit Ctrl+S, „○ tippt…/● gespeichert"-Indikator pro Tab, Save-Button in der Editor-Toolbar. Datei-Tabs pro Projekt (eine MarkdownEditor-Instanz pro Tab, CSS-Toggle für Sichtbarkeit — Buffer überlebt Tab-Wechsel analog Sprint-3-xterm-Pattern). Schnellzugriff-Liste aus `workbench.on_demand_files` plus Standards (CLAUDE.md / CHANGELOG / FEATURES / ENTSCHEIDUNGEN / aktuelles Phase-File) — leerer Tab-Stack zeigt die Liste prominent, befüllter Stack zeigt sie als Pill-Footer mit „nicht-bereits-offenen" Einträgen.
- **Inline-YAML-Validation für CLAUDE.md.** Pure-Logik-Util `validateClaudeMdYaml` extrahiert das Frontmatter zwischen `---`-Trennern und ruft `js-yaml.load()` darauf; CodeMirror-Linter hängt das mit 500-ms-Debounce in den Editor und mappt Fehler-Zeilen auf die Quell-Datei (statt auf den Block-internen Offset). Nur Anzeige, kein Auto-Fix.
- **Markdown-Preview-Toggle.** Editor/Preview-Pills in der Toolbar; Preview-Modus rendert via `react-markdown` mit den App-Tokens (Display-Font für Headings, Mono-Font für Code-Blocks, Akzent-Farbe für Links).
- **Diff-Viewer mit `@codemirror/merge`.** Working-Tree-Diff via `git:status` + `git:show`-IPC (HEAD-Version pro Datei) + `fs:read` (Working-Tree-Inhalt) → `unifiedMergeView({ original: HEAD })` mit aktuellem Inhalt als Doc. File-Liste oben mit Status-Mark (M/A/D/?/R), Klick wechselt das aktive File. Clean Tree und Non-Git-Repo bekommen explizite Empty-States. Read-only.
- **PreCommitModal.** Eigener Modal (kein Inline-Drawer) mit Branch-Anzeige + Counts (ahead/behind), File-Liste mit Worktree/Index-Status, Sensitive-File-Warnung (`.env`, `.env.*`, `secrets.*`, `*.key`, `*.pem`) als Pure-Logik-Util mit Basename-Match (kein Pfad-False-Positive). Commit-Trigger geht über die existierende Sprint-6-`td-template-send`-Bracketed-Paste-Mechanik direkt an die aktive PTY — die App committed nicht selbst (Architektur 6.7).
- **commit-Pill in der Action-Bar.** `td-term-bar` neben Templates ergänzt; `⎇ commit` öffnet das PreCommitModal. Disabled, wenn kein Projekt aktiv ist; Status-Hinweis im title-Attribut.
- **Hierarchischer Datei-Browser im Right-Stack.** `fs:list-tree`-IPC scannt das aktive Projekt mit Driver-Injection (Skip-Liste: `node_modules`, `.git`, `dist`, `build`, `.vite`, `.next`, `.idea`, `.vscode`, `out`, `coverage`; versteckte Files raus außer `.gitignore`/`.gitattributes`/`.editorconfig`). Tree mit Click-to-Expand pro Verzeichnis; Filter-Suchfeld vorbelegt mit „.md", aber leerbar. Dateien zeigen einen `M`-Indikator, wenn der entsprechende Datei-Tab gerade dirty ist (kommt aus dem File-Tabs-Store). Klick öffnet die Datei in einem neuen Editor-Tab.
- **Notizen-Panel migriert in den Right-Stack.** Sprint-3-`NotesFooter` ist komplett entfernt; `NotesPanel` lebt jetzt in der unteren Hälfte der 4. Grid-Spalte. Pure-Logik-Util `createNotesSaver` (500 ms Debounce + onBlur + onUnmount + beforeunload) ist unverändert wiederverwendet — alle 10 bestehenden Tests tragen weiter. Empty-State, wenn keine Session aktiv.
- **Filesystem-IPC `fs:read` / `fs:write` mit Anti-Traversal.** Renderer schickt `projectId` + `relPath`; Main resolved gegen den Project-Pfad und prüft per `path.relative`, dass das Ergebnis innerhalb des Project-Roots bleibt. `..\..\windows\system32`-Versuche werden als `FS_PATH_ESCAPED` abgewiesen, bevor irgendein Filesystem-Aufruf läuft.
- **simple-git als neue Dependency mit Driver-Injection.** `GitDriver`-Interface (`status` / `diff` / `showFile`) mit `realGitDriver` (simple-git) und Fake-Driver für Tests. `git:status` / `git:diff` / `git:show`-IPC liefern Branch + geänderte Files, Working-Tree-Patch und HEAD-Version pro Datei; alle drei Channels mit `PROJECT_NOT_FOUND` / `NOT_A_GIT_REPO` / `GIT_*_FAILED`-Codes statt nackten simple-git-Exceptions.
- **Per-Projekt-Datei-Tab-Stack.** `useFileTabsStore` analog Sprint-4-Terminal-Tabs: `tabs[projectId]: FileTab[]` plus `activeId[projectId]`. Diff-Tab ist Sonderfall mit fester ID `'diff'` und sitzt immer ganz links pro Projekt. Tab-Schließen wählt links bevorzugt, sonst rechts, sonst null als nächste aktive Tab-ID — gleiches Pattern wie der Terminal-Tab-Stack.
- **Tote Sidebar-CSS-Blöcke aufgeräumt (TECH_SCHULDEN-Drive-by).** Pre-3-Sektionen-Layout-Klassen (`.td-sidebar-header / -title / -actions / -icon-btn / -list / -item-* / -badge / -item-wrap / -views / -view-btn`) sind aus `app.css` raus, plus die alten `.td-notes-footer / -header / -toggle / -meta / -textarea`-Blöcke. Nur die noch genutzten `.td-sidebar-empty / -empty-soft / -error` bleiben. Generische `.td-panel:nth-child(2)` / `.td-panel-history`-Regeln auf `.td-sidebar > .td-panel*` gescoped, damit der Right-Stack nicht versehentlich erbt.

### Umgesetzte Entscheidungen

- **9 Variants vor dem Code, alle Empfehlungen direkt übernommen.** Q1 A (manueller Save, gegen UX-Default-Memory), Q2 B (Filter mit `.md`-Default), Q3 A (eigener PreCommitModal), Q4 B (500 ms YAML-Debounce), Q5 B (oneDark + Custom-Override), Q6 B (Per-Projekt-Datei-Tab-Stack), Q7 A (Sensitive-Patterns hartcoded), Q8 A (NotesFooter komplett raus), Q9 A (Skeleton-First-Reihenfolge). Plus eine Mid-Sprint-Layout-Entscheidung (Editor in eigener breiter Spalte statt im 232-px-Right-Pane) — siehe Mid-Sprint-Anpassungen.
- **Skeleton-First-Phasenreihenfolge aus Sprint-6-Lehre.** Phase 1 (Right-Pane-Skeleton + Notes-Migration + CSS-Cleanup) zuerst, damit die Layout-Risiken früh sichtbar werden. Hat sich beim User-Feedback nach Phase 4 ausgezahlt — der Layout-Schmerz war sofort sichtbar, Pivot auf das Design-Handoff-4-Spalten-Grid kostete nur ~30 min, weil alle Komponenten schon in eigenen Files lagen und nur das App-Grid + die Eltern-Aufteilung umgebaut werden musste.

### Mid-Sprint-Anpassungen

- **Layout-Pivot von Single-Right-Pane (232 px Stack mit 3 Sektionen) auf 4-Spalten-Grid (240 / 1fr / 1fr / 232).** Briefing hatte den Editor im 232-px-Right-Pane vorgesehen — visuell zu eng beim ersten User-Test. User-Feedback: „in der Vorlage sieht es besser aus". Design-Handoff (`docs/design/claude-export/styles.css` Zeilen 122-195 + `app.jsx` Layout-Grid) hat von Anfang an 4 Spalten gezeichnet (Editor in eigener `1fr`-Spalte, Files+Notes als separate `td-col-right-stack`-Spalte ganz rechts, PlanPane unter dem Editor statt unter dem Terminal). `RightPane.tsx` aufgeteilt in `EditorPane.tsx` (Editor + Diff, breite Spalte) und `RightStack.tsx` (Files + Notes, schmale Spalte) — saubere Trennung pro Grid-Cell. ~30 min inkl. CSS-Cleanup. Lehre wandert ins SEASON_LOG.
- **Re-Render-Endlosschleifen durch instabile Selectors.** Erster App-Start zeigte zwei aufeinanderfolgende „Maximum update depth exceeded"-Crashes: (1) `useFileTabsStore((s) => ... ?? [])` und `useFileTabsStore((s) => { return new Set() })` returnten neue Referenzen pro Render, was Zustand als State-Change interpretierte → infinite Re-Render. (2) Eltern reichten `(d) => setDirty(...)` als Inline-Closure an MarkdownEditor durch, dessen useEffect-deps `[dirty, onDirtyChange]` enthielten → bei jedem Render neuer Closure, Effect feuert, `setDirty` triggert Store-Mutation auch bei No-Op, neuer Render, neuer Closure, infinite. Zwei getrennte Fixes: stable EMPTY-Module-Konstanten + `useMemo` für abgeleitete Sets/Maps; und `setDirty/setSaved/setActive` im Store idempotent (early-return bei No-Op) plus `onDirtyChange` über einen Ref im MarkdownEditor.
- **NotesFooter-Migration brauchte CSS-Pfad-Auflösung.** Sprint-3-`NotesFooter` hatte eigene `.td-notes-footer / -header / -toggle / -textarea`-Klassen mit Footer-Layout-Annahmen (border-top, expanded-Höhe, Toggle-Button). Im Right-Stack als full-Sektion sind die Annahmen falsch. CSS-Block ersetzt durch eine schlanke `.td-notes / -head / -body / -saving / -empty`-Variante, die das Design-Handoff-Vokabular 1:1 spiegelt.

### Bonus-Bugfixes unterwegs

- **`setActive` / `setDirty` / `setSaved` jetzt idempotent.** Defensiv-Pattern, das den oben beschriebenen Re-Render-Loop final entschärft — Store-Mutationen ohne Wert-Änderung sind ab sofort No-Ops, was auch bei zukünftigen Eltern-Inline-Closures keinen Loop mehr triggern kann.
- **Sprint-6-`SESSION_NO_CLAUDE_UUID`-Cosmetic-Punkt offen geblieben.** SEASON_LOG hatte das als Sprint-7-Cosmetic-Slot vorgemerkt; Phase 7 hat den PreCommitModal gebaut, aber das Verlauf-Detail-Pane für tote Sessions nicht angefasst — bleibt für Sprint 8.

### Offen geblieben (bewusst verschoben)

- **Side-by-Side-Markdown-Preview** — Architektur 8 / 12 Phase-2-Auslassung. Toggle (Editor ↔ Preview) reicht im MVP.
- **Diff-Viewer-Multi-Tab (Working / Staged / Session)** — Phase 2. Sprint 7 zeigt nur Working-Tree-Diff.
- **YAML-Auto-Fix** — Phase 2. Sprint 7 zeigt nur Marker.
- **Pull / Fetch / Branch-Switch** — Phase 5+ (Worktrees). simple-git-Driver ist da, der App-Pfad fehlt bewusst.
- **Eigener Commit-Workflow durch die App** — Architektur 6.7. App schickt nur die Trigger-Phrase an Claude, das committed real.
- **Settings-konfigurierbare Sensitive-Patterns** — Sprint 8 (Settings-Dialog). Bis dahin hartcoded.
- **Per-Bucket-Burn-Rate / Heatmap-Filter** — Sprint 5 hatte das schon offen, weiter Phase 2.
- **`SESSION_NO_CLAUDE_UUID`-Cosmetic-Hint im Verlauf-Detail-Pane** — Sprint-6-SEASON_LOG-Reminder, nach Sprint 8 verschoben (PreCommit + commit-Pill hatten Vorrang).

---

## 2026-05-10 — Season 6: Templates + Season-Tracker

### Was jetzt geht

- **Atomare Season-Nummerierung pro Projekt.** `pty:create` allokiert beim Spawn einer `feature`-Session die nächste Season-Nummer in einer better-sqlite3-Transaktion (Read+Increment in einem Statement) und persistiert sie sofort. Bug/Review/Docs-Sync bleiben ohne Nummer (Architektur 6.6). Lücken bei Spawn-Fehler sind explizit akzeptiert — kein Rollback, weil das Hauptrisiko (nicht-konsumierte Nummer) trivial ist und ein Rollback Race-Conditions öffnen würde. NewSessionModal zeigt im Feature-Pfad die Vorschau „Diese Season wäre #N" aus dem `next_season_number`-Feld der Project-Row.
- **Verlauf-Panel als Replace-View.** Sidebar-Klick auf einen Verlauf-Eintrag oder den „Verlauf"-Reiter wechselt den Hauptbereich vom Tab-Stack auf eine Tabelle mit allen Sessions des aktiven Projekts. Filter-Bar mit Type-Pills, Status-Pills und Volltext-Suche im Titel; Detail-Pane rechts mit Notizen, Token-Aufschlüsselung (in/out/Messages) und Resume-Button. Sortierung jüngste-zuerst per `started_at DESC`. Token-Aggregate kommen via LEFT-JOIN aus der `messages`-Tabelle (Sprint-5-Persistenz). Tabs laufen im Hintergrund mounted weiter — kein xterm-Buffer-Verlust beim Wechsel.
- **Resume-Button auf jedem Status, der es erlaubt.** Verlauf-Detail-Pane zeigt den Resume-Button für completed / interrupted / error / idle. Bei bereits offenem Tab wird statt einem zweiten Spawn der existierende Tab fokussiert (Q5 Variante A). Archived bleibt Endzustand und ist explizit blockiert.
- **Sprint-2/3-Legacy-Bucket sichtbar mit Banner.** Klick auf den Legacy-Bucket öffnet das Verlauf-Panel mit einem Hinweis-Banner („Sessions aus Sprint 2/3, bevor der Workspace-Scanner echte Projekte erkannt hat"). Resume aus dem Verlauf greift dort identisch — der TECH_SCHULDEN-Eintrag „Sprint-2/3-Legacy UI-blind" ist damit aufgelöst.
- **Templates aus zwei Quellen, on-demand gescannt.** Ctrl+T oder die Templates-Pill in der Action-Bar öffnen das Modal; `fs:list-templates` scannt bei jedem Open frisch den globalen Ordner (`%APPDATA%\TakumiDeck\templates\*.md`), den Per-Projekt-Ordner (`<projekt>\docs\templates\*.md`) und die Legacy-Konvention (`<projekt>\docs\*_TEMPLATE.md`). Beide Quellen erscheinen als separate Listen-Einträge mit Source-Tag (Global/Projekt) — Konflikte bei gleichem Dateinamen werden bewusst nebeneinander angezeigt (Q2 Variante B).
- **Variable-Filling mit Pflicht-Validation und Live-Preview.** `{{...}}`-Tokens werden anhand des Templates erkannt und nur die genutzten Variablen-Felder im Modal angezeigt. Auto-Variablen (PROJEKT_NAME, NEXT_SEASON_NR, CURRENT_PHASE_FILE, DATUM) sind read-only aus Project-Row + CLAUDE.md-Frontmatter + Datum gefüllt. User-Variablen FEATURE_NAME / AUFGABE sind Pflicht (markiert, blockiert Send), HINWEISE optional (Multiline-Textarea). Live-Preview-Spalte zeigt den ersetzten Text während des Tippens; unbekannte Tokens bleiben als Platzhalter sichtbar mit Warnhinweis.
- **Send via Bracketed-Paste an die aktive PTY.** Modal feuert ein `td-template-send`-CustomEvent, das der aktive TerminalTab via `terminal.paste(text)` an den PTY-Stream legt — gleiche Mechanik wie Sprint-3.5-Copy/Paste. claude erkennt den \x1b[200~...\x1b[201~-Block und verarbeitet ihn als ein Eingabe-Event, nicht zeilenweise.
- **× auf einem Tab ist non-destruktiv.** Tab-Schließen killt nur den PTY (falls noch läuft) — der Lifecycle wandert via `pty:exit` auf `completed`, die Session bleibt im Verlauf erreichbar und resume-fähig. Aus Versehen geschlossene Sessions sind kein Datenverlust mehr. Expliziter Archivieren-Schritt läuft jetzt über das Verlauf-Detail-Pane mit Inline-Confirmation („Wirklich? Session ist danach nicht mehr resume-fähig.").
- **Sidebar im Design-Layout (3 Sektionen).** Stack aus `td-panel`-Sektionen wie im Claude-Design-Handoff: **Projekte** mit ↻-Refresh und + Add Project, **Aktive Sessions** mit Status-Dot + Name + ↻-Resume + ×-Schließen pro Tab + + Neue Session im Footer, **Verlauf** mit kompakter Quickliste (max 10) und Klick = Sprung ins HistoryPane mit Vorauswahl. Modal-State (NewSession/Templates) liegt jetzt im UiStore, damit Sidebar und Tab-Bar denselben Zustand teilen. Der frühere Tabs/Verlauf-Toggle entfällt.
- **Action-Bar unter dem aktiven Terminal.** Schmale Bar mit `td-pill`-Elementen aus dem Design-Export (`td-term-bar` styles.css 532): Modell-Pill (read-only Indikator), Templates-Pill (primärer Pfad zum Modal, falls Ctrl+T system-weit gebunden ist), Status-Badge rechts (●/○/✓/⏸/✗/◌).

### Umgesetzte Entscheidungen

- **9 Variants vor dem ersten Code, alle Empfehlungen übernommen.** Template-Discovery (B on-demand), Konfliktauflösung (B beide separat), Variablen-Filling-UI (A Form + Preview), Verlauf-Panel-Position (A Replace-View), Resume bei offenem Tab (A fokussieren), Counter-Increment-Zeitpunkt (B atomar im Main), cache_creation/cache_read (B weiter Phase 2), Legacy-Sessions im Verlauf (A sichtbar mit Banner), Implementations-Reihenfolge (A Season-Tracker zuerst).
- **Sprint-6-Hotfix Variante C: Resume-Bug-Fix kombiniert.** A für neue Sessions (`claude --session-id <takumi-uuid>` beim ersten Spawn) plus B für Legacy (Migration `0003_claude_session_id.sql` mit nullable Spalte, Watcher-Backfill aus dem JSONL-Filename, status-agnostisch). Sprint-5-Annahme „claude-code unterstützt --session-id nicht" war überholt — claude-code liefert das Flag offiziell. Resume-Pfad nutzt jetzt `claude_session_id ?? id`, mit klarer Fehlermeldung `SESSION_NO_CLAUDE_UUID` für Sessions, die nie eine JSONL-Antwort produziert haben.
- **× non-destruktiv (Variante B aus 4-Wege-Vergleich).** Tab-Schließen und Session-Archivieren sind jetzt zwei getrennte Aktionen mit eigenen IPC-Channels (`session:close` ohne Lifecycle-Patch, neuer `session:archive` mit Lifecycle-Transition zu archived). Confirmation läuft inline im Detail-Pane statt als zusätzliches Modal — ein Klick aktiviert die rote Bestätigung, ein zweiter führt aus.
- **Sidebar nach Design-Handoff-Layout.** 3-Sektionen-Stack (Projekte / Aktive Sessions / Verlauf) statt Single-Liste mit View-Toggle. Klassen aus `docs/design/claude-export/styles.css` 1:1 übernommen (`td-panel`, `td-list`, `td-pill`, `td-action-btn` etc.).

### Mid-Sprint-Anpassungen

- **Resume war seit Sprint 3 tot.** Erst beim ersten User-Test in Sprint 6 fiel auf, dass `claude --resume <uuid>` mit „No conversation found" scheitert, weil claude-code intern eigene Session-UUIDs vergibt. Sprint 5 hatte den Mismatch nur für den JSONL-Watcher-Mapping-Pfad gefixt (encodeCwd), nicht für den Resume-Pfad. Hotfix Variante C zog die saubere Lösung nach (siehe oben).
- **× war nach Sprint 3 destruktiv.** Sprint-3-Spec hatte `tab-close → archived` als ein Schritt; das Verlauf-Panel hat den Schmerz erst sichtbar gemacht. UX-Fix Variante B trennt die zwei Aktionen.
- **Sidebar-View-Toggle „Tabs/Verlauf" entfiel zugunsten 3-Sektionen-Layout.** Erste Implementation hatte einen schmalen Toggle unter dem aktiven Project — das Design-Handoff hat aber von Anfang an drei separate Sektionen vorgesehen. Beim User-Feedback („wie in der Design-Vorlage") komplett umgebaut.
- **Watcher-Backfill war zunächst nur für running/idle-Sessions gedacht.** Der Backfill-Pass aus dem Hotfix matchte initial nur live-Sessions (Sprint-5-Token-Tracking-Pfad). Damit wären Legacy-completed-Sessions weiter resume-tot geblieben — Variante C hätte ihr Versprechen nicht eingelöst. Erweiterung auf status-agnostischen Backfill via `listMissingClaudeSessionId()`-Repo-Methode + Filename-UUID-Extraktion.

### Bonus-Bugfixes unterwegs

- **claude-code-Session-UUIDs überhaupt.** ENTSCHEIDUNGEN.md aus Sprint 5 sagte „kein --session-id-Flag" — Stand 2026-05-10 ist das überholt. Variante C des Resume-Hotfix nutzt das Flag jetzt offiziell.
- **Modal-State in TabContainer war nicht zugänglich für die Sidebar.** Sprint-6-UI-Fix verschiebt `showNewSessionModal` und `showTemplatesModal` in den UiStore — beide Quellen (+ in der Tab-Bar, + in der Sidebar) öffnen denselben Zustand.
- **HistoryPane sortierte Filter unsauber.** Default-Filter blendete `archived` nicht aus, sodass die Liste nach Archivieren mit alten Karteileichen verstopft war. Default ist jetzt explizit `running/idle/completed/interrupted/error` ohne archived; Status-Filter erlaubt das Einblenden.

### Offen geblieben (bewusst verschoben)

- **`cache_creation` / `cache_read` getrennt persistieren** — Q7 B, weiter Phase 2. Verlauf-Detail-Pane zeigt summierte tokens_in/tokens_out, was für Sprint-6-UX reicht.
- **commit-Pill und ctx-Mini-Bar in der Action-Bar** — Sprint 7 (Pre-Commit-Panel + Trigger-Phrase-Send). Sprint 6 hat nur die Templates-Pill plus Modell- und Status-Anzeige.
- **Pre-Hotfix-Sessions ohne JSONL-Antwort sind dauerhaft resume-tot.** Sessions, die spawn-error sofort hatten oder vor jeder Antwort geschlossen wurden, haben weder eine vorgegebene noch eine vom Watcher backfillbare claude-UUID. Resume liefert den klaren `SESSION_NO_CLAUDE_UUID`-Fehler. TECH_SCHULDEN-Eintrag dokumentiert das.
- **Mehrere Legacy-Sessions im selben cwd: nur die jüngste wird gebackfilled.** Wenn der User vor dem Hotfix mehrfach im selben Projekt Sessions ohne JSONL-Antwort gespawnt hat, mappt der Watcher die UUID auf die jüngste — die anderen bleiben null. TECH_SCHULDEN-Eintrag.
- **Tote `.td-sidebar-*`-CSS-Blöcke** aus dem Pre-3-Sektionen-Layout. Cosmetic, kein Funktionsschaden — beim nächsten Renderer-Touch mit aufräumen.

---

## 2026-05-10 — Season 5: Token-Dashboard

### Was jetzt geht

- **Token-Dashboard immer sichtbar.** Untere Zeile (300 px) mit einer Bar pro `settings.limit_bars`-Eintrag (5h, weekly_all, weekly_design, weekly_sonnet) plus Per-Session-Kontext-Bar für den aktiven Tab. Schwellen-Farben aus `settings.token_warning_thresholds` (gelb 70 %, orange 85 %, rot 95 %, darüber rot mit diagonalen Streifen). Klick auf eine Bar öffnet das `UsageDetailModal` mit Per-Modell-Tabelle und einem Recharts-Linien-Diagramm — Top-Level-Bars sind reines CSS, Recharts kommt nur dort zum Einsatz, wo eine echte Zeit-/Modell-Reihe Mehrwert bringt.
- **JSONL-Watcher liest historische und live Sessions ein.** chokidar mit `awaitWriteFinish` (100 ms Stability-Threshold) auf `~/.claude/projects/`, Initial-Scan zieht alle existierenden JSONL-Files an, persistierter Byte-Offset pro Datei (neue `jsonl_offsets`-Tabelle, Migration `0002`). Pro neuer Zeile: NDJSON-Parse über zod-Schema mit `.passthrough()` für unbekannte Felder, Drop kaputter Zeilen mit Logging. Pro `usage`-Zeile: Insert in `messages` (für Sessions, die TakumiDeck kennt) plus Upsert in `usage_buckets` (Hourly-Aggregat pro Modell).
- **TakumiDeck-Sessions matchen ihre JSONL-Datei über `encodeCwd`.** claude-code vergibt eigene UUIDs; der Filename matcht NICHT unsere `sessions.id`. Watcher liest den Eltern-Ordnernamen, encoded den `cwd` jeder running/idle-Session nach demselben Schema (`:/\\` → `-`) und matched. Bei mehreren Treffern (mehrere Sessions im selben Projekt) gewinnt die jüngste.
- **P90-Limit-Schätzung mit Fallback.** Rolling 192-h-Fenster über die Hourly-Buckets, gefiltert auf das gleiche Modell-Set wie die Bar selbst. Bei <24 Buckets (= <1 Tag Daten) Fallback auf `settings.model_limits[default_model]` mit `limitSource = 'fallback'`. Tooltip auf der Bar zeigt die Quelle. Custom-Bars dürfen ein `model_pattern` als SQL-LIKE-Glob mitgeben.
- **State-Detection running ↔ idle.** Alle 2 s prüft eine Loop für jede running/idle-Session den letzten `messages.ts`-Eintrag. Jünger als 3 s → `running`, sonst `idle`. Sessions ohne jegliche Messages (frisch gespawnt) bleiben unverändert, damit ein neuer Tab nicht sofort als idle erscheint, bevor claude überhaupt etwas geschrieben hat. Sidebar-Status-Dot reagiert (Pulse bei running, statisch grau bei idle). Lifecycle-State-Machine erweitert um `running ↔ idle`; `running → waiting` bleibt explizit verboten (Permission-Prompt-Recognition ist Phase 2).
- **Stats-Pane Übersicht/Modelle-Toggle.** Zwei-Tab-Skeleton unter dem Terminal-Bereich. „Übersicht" liefert drei Mini-Karten (aktuelle Session, letzte 5 h, letzte 168 h), die direkt aus dem Token-Dashboard-Store kommen. „Modelle" ist Phase-2-Stub mit Hinweispille.
- **Per-Projekt-Default-Modell aus CLAUDE.md (Sprint-4-Carry-over).** `NewSessionModal` zieht den Default jetzt aus `activeProject.frontmatter.workbench.default_model` mit Fallback auf `settings.default_model`. `useUiStore` cached die Frontmatter beim Project-Select über `project:read-claude-md` mit StrictMode-Side-Effect-Guard.
- **Aktives Projekt persistiert über App-Restart.** `useUiStore` hydriert `activeProjectId` aus `localStorage` beim Mount, schreibt zurück bei jedem `setActiveProject`. Tote Referenzen (Projekt zwischenzeitlich umbenannt) fallen sauber auf den heuristischen Default zurück.
- **Drive-by `displayProjectName(p)`.** TECH_SCHULDEN-Empty-State-Fix: Sidebar und TabContainer-Empty-State teilen sich jetzt einen Helper, der den DB-Rohnamen `__default__` auf „Sprint-2/3-Legacy" mappt.
- **Sprint-2-Lifeline `pty:create → DEFAULT_PROJECT_ID` endgültig aufgelöst.** Der Handler nimmt jetzt `projectId` aus dem IPC-Input statt hartcoded auf den Default zu zeigen. Sprint-4-Remap zieht beim App-Start auch `messages.project_id` der umgehängten Sessions mit — Per-Projekt-Aggregate (Sprint 6+) zeigen damit den richtigen Bucket.

### Umgesetzte Entscheidungen

- **Variante A überall** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). 10 Vorab-Variants für Sprint-5-Architektur (Watcher-Scope, Token-Persistenz, State-Detection-Heuristik, Push-Cadence, P90-Window, Layout-Position, Recharts-Strategie, Modell-Cache, Offset-Persistenz, Active-Project-Hydrate) wurden vor dem ersten Code mit Effort-Tabelle + Empfehlung geliefert; User hat alle 10 Empfehlungen direkt übernommen.
- **Sessions-Mapping über `encodeCwd` statt UUID** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). claude-code vergibt eigene Session-UUIDs, die NICHT mit unseren matchen. Variante A war ursprünglich „UUID match" — beim ersten Smoke-Test fiel sofort auf, dass das nicht trägt. Mid-Sprint-Pivot auf cwd-Encoding-Match.

### Mid-Sprint-Anpassungen

- **chokidar v5 unterstützt keine Glob-Patterns mehr.** Mein erster Wurf (`watchPath + '**/*.jsonl'`) wurde als wörtlicher Pfad interpretiert — Watcher hat schlicht nichts gewatcht, kein einziger Log-Eintrag. Fix: Root-Pfad watchen plus `ignored`-Predicate, das alle Non-`.jsonl`-Files ausschließt. Plus `ready`-Event mit Info-Log als Diagnose.
- **`session_count`-Bedarf-Pendant für Sprint 5.** Sprint 4 hatte den `session_count`-Aggregat erst nach erstem Smoke-Test gebraucht; Sprint 5 hat zwei vergleichbare Spät-Erkenntnisse: (1) `pty:create` war seit Sprint 2 hartcoded auf `DEFAULT_PROJECT_ID` — Sprint 4 hatte den Renderer per-Projekt umgebaut, aber den Main-Handler nicht mit-fixed; (2) Sprint-4-Remap zieht jetzt auch `messages.project_id` mit, sonst hängen Per-Projekt-Aggregate weiter am alten Bucket.

### Bonus-Bugfixes unterwegs

- **chokidar v5 Glob-Support entfernt** — siehe Mid-Sprint-Anpassung. Diagnose über fehlende `[jsonl-watcher]`-Log-Einträge nach Initial-Scan.
- **TakumiDeck-Session-UUID ≠ JSONL-UUID** — Mapping-Pivot auf `encodeCwd`-Match. Bei mehreren Sessions im selben cwd gewinnt die jüngste; Limitation in TECH_SCHULDEN.md.
- **`pty:create` hat seit Sprint 2 `DEFAULT_PROJECT_ID` hartcoded.** Schwelte unbemerkt, weil Sprint-4-Per-Projekt-Filter über den Renderer-Tab-State lief, nicht über die DB. Sprint 5 räumt mit `messages.project_id` aus der DB → der Bug fiel erst hier auf. Schema-Erweiterung: `PtyCreateInputSchema.projectId` Pflicht-Feld.
- **StrictMode-Listener-Guard-Falle.** Im PlanPane war ein `useRef`-Guard um den `usage:update`-Listener gewickelt. StrictMode mountet zweimal mit Cleanup dazwischen → Mount 1 register, Cleanup unsubscribe, Mount 2 GUARD blockt re-register → Listener für immer tot. Fix: Guard entfernt — Memory-Konvention sagt Guard nur für Server-Side-Effect-IPCs (pty:create, fs:write, git:commit), Listener-Setup ist read-only und muss bei jedem Mount frisch.

### Offen geblieben (bewusst verschoben)

- **Modell-Limits-Defaults auf realistische 200k-Werte umstellen** — siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md). Aktuell zeigt die Per-Session-Kontext-Bar bei Sonnet 4.6 ~8 % statt der echten Kontext-Auslastung, weil das Limit auf 1 M (extended context) statt 200 k steht. Quick-Fix: User editiert `settings.json` direkt; saubere Lösung mit Sprint 8 (Settings-Dialog).
- **awaitWriteFinish-Latenz von 100 ms** für aktive JSONL-Files. Bei laufenden Antworten kommt der Watcher-Push erst, wenn claude für 100 ms nicht mehr schreibt. Im Sprint-5-Smoke-Test war das spürbar, aber tolerabel — Phase-2-Optimierung wäre ein zweiter „Polling-Ring" mit kürzerer Frequenz für aktive Files.
- **`cache_creation` / `cache_read` getrennt persistieren.** Aktuell summiert in `tokens_in`. Fürs Detail-Modal in Sprint 5 ausreichend; Verlauf-Panel in Sprint 6 entscheidet, ob die getrennte Spalten-Persistenz nötig wird.
- **Volle State-Detection mit `waiting` (Permission-Prompts)** — Phase 2. Sprint 5 schreibt nur `running ↔ idle`; `waiting` bleibt im Schema, wird aber nicht aktiv beschrieben.
- **Heatmap-View in StatsPane** — Phase 2. Sprint 5 reserviert nur den `usage:heatmap`-Channel als Stub.
- **Per-Bucket-Burn-Rate im UsageDetailModal** — Sprint 5 zeigt einen Per-Modell-Linien-Plot als Vereinfachung. Per-Bucket über die Window-Größe würde einen weiteren IPC-Roundtrip kosten und ist Phase-2-Material.

---

## 2026-05-09 — Season 4: Workspace

### Was jetzt geht

- **Linke Sidebar mit Projekten.** 240 px Spalte links zeigt alle erkannten Projekte aus dem konfigurierten `workspace_path` mit Active-Highlight, Pfad-Hinweis und einem Running-Badge (live aus den offenen Tabs). `+` öffnet einen Datei-Dialog (Pflicht-Marker: `CLAUDE.md` muss im Ordner liegen), `↻` scant den Workspace neu. Default-Project bleibt als „Sprint-2/3-Legacy"-Bucket sichtbar, solange noch DB-Sessions daran hängen — sobald `session_count = 0` ist, verschwindet er von selbst.
- **Workspace-Scanner findet Projekte automatisch.** Beim App-Start läuft ein async-rekursiver Walk über `workspace_path` (Promise-Pool, Konkurrenz 4), max-depth 5, stoppt bei jedem Ordner mit `CLAUDE.md` (= Projekt erkannt) oder `.git` (Stop ohne Erkennung). Versteckte Ordner und `node_modules` werden übersprungen. Ergebnis landet in `projects` mit `has_git`-Flag.
- **CLAUDE.md-Frontmatter wird sauber geparst.** `gray-matter` trennt YAML+Body, `ClaudeMdFrontmatterSchema` validiert die `workbench:`-Section strict — `trigger_phrases.docs_update` und `commit` sind Pflicht (in Working-Rules referenziert), `default_model` / `current_phase_file` / `on_demand_files` sind optional. Keine Frontmatter und „workbench fehlt" sind legitime Zustände; kaputte YAML liefert klare Result-Errs (`CLAUDE_MD_PARSE` / `CLAUDE_MD_INVALID_FRONTMATTER`).
- **Per-Projekt-Tab-Filter ohne Buffer-Verlust.** Tab-Bar zeigt nur Tabs des aktiven Projekts (Renderer-Filter über `activeProjectId`); alle xterm-Instanzen aller Projekte bleiben dauerhaft mounted (CSS verbirgt sie), PTYs der inaktiven Projekte laufen weiter. Beim Projekt-Wechsel rotiert `activeId` automatisch auf den ersten Tab des neuen Projekts oder auf den Empty-State. `Ctrl+Tab` / `Ctrl+Shift+Tab` navigieren projekt-scoped; der `+`-Button und `Ctrl+N` sind ohne aktives Projekt inert.
- **NewSession-Modal nutzt jetzt den Projekt-Pfad als `cwd`.** Bisher kam der `cwd` aus `settings.workspace_path` (= Parent-Ordner) — neue Sessions starten jetzt im Pfad des aktiven Sidebar-Projekts. Damit ist die Sprint-2/3-cwd-Mismatch-Falle für Neu-Sessions behoben.
- **Default-Project-Migration beim App-Start.** Nach dem Initial-Scan läuft ein `cwd`-Prefix-Match: Sprint-2/3-Sessions, deren `cwd` innerhalb eines erkannten Project-Pfads liegt, werden auf das echte Project umgehängt. Wer `workspace_path` als `cwd` hatte (= alle Sprint-2/3-Defaults), bleibt im Legacy-Bucket — siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md).
- **Project-IPC + Driver-Pattern für Repo.** Vier neue Channels: `project:list`, `project:add` (Main öffnet `dialog.showOpenDialog` selbst, prüft CLAUDE.md-Pflicht), `project:scan-workspace`, `project:read-claude-md`. `ProjectRepository` mit `SqliteProjectDriver` + `InMemoryProjectDriver` analog Sessions; `session_count` per LEFT-JOIN-Aggregat zur Lesezeit.
- **Renderer-Stores sauber getrennt.** Neuer `useUiStore` (Architektur-2-konform) hält `activeProjectId`; neuer `useProjectStore` lädt/refresht/added Projekte. `SessionTab` trägt `projectId`; `selectTabsForProject` als Selector; `pickNextActive` rotiert nur innerhalb des Projekts.

### Umgesetzte Entscheidungen

- **Variante A (Async-Walk mit Konkurrenz-Limit)** für den Scanner (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Skaliert mit, wenn der Workspace mal mehr Subordner hat; Test-Aufwand identisch zur synchronen Variante (FsLikeDriver-Injection).
- **Variante A (gray-matter)** für den CLAUDE.md-Parser (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Kapselt BOM/CRLF/Markdown-Body-mit-`---`-Edge-Cases; Library-Dep wiegt im Electron-Kontext nicht.
- **Variante A (Auto-Match per cwd-Prefix mit Legacy-Bucket)** für die Default-Project-Migration (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Treffer wandert auf das echte Project, kein Treffer bleibt im sichtbaren Legacy-Bucket — datenverlust-frei.
- **Variante A (Renderer-Filter über `activeProjectId`)** für den Per-Projekt-Tab-Filter (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Konsistent zu Sprint-3-Tab-Persistenz: alle xterm bleiben mounted, der Wechsel ist eine reine Render-Operation.
- **Variante A (neuer `useUiStore`)** für die Sidebar-Auswahl-Persistenz (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Architektur-Kapitel-2-konform; Sprint 5 (Token-Dashboard-Detail) wird denselben Store mit-nutzen.
- **Per-Projekt-Modell-Default verschoben auf Sprint 5** (Variante B aus Frage 6). `NewSessionModal` nutzt weiterhin `settings.default_model`. Sprint 5 hat ohnehin pro-Modell-Logik und kann die Per-Projekt-Hierarchie aus dem CLAUDE.md-Frontmatter sauber einbauen.
- **Schema-Migration `0002` entfiel.** Da Per-Projekt-Modell verschoben wurde, brauchten wir keine neue Spalte in `projects` — `0001_init.sql` reicht für Sprint 4.

### Mid-Sprint-Anpassung

- **`session_count` als LEFT-JOIN-Aggregat in `projects`-Listing.** Erste Implementation hatte die Legacy-Bucket-Sichtbarkeit nur an offenen Renderer-Tabs gehängt — Sprint 4 lädt aber keine historischen Sessions als Tabs, der Bucket wäre nie aufgetaucht. Lösung: das Repo joint die Session-Anzahl pro Project zur Lesezeit, der Renderer entscheidet anhand des DB-Counts, ob der Bucket sichtbar ist. 56 → 56 neue Tests + 2 spezifisch für `session_count`-Aggregat.

### Offen geblieben (bewusst verschoben)

- **Per-Projekt-Modell aus CLAUDE.md ziehen** — Sprint 5.
- **Live-Watcher (chokidar) für Workspace** — Phase 2 (Sprint 5 setzt den Watcher zuerst für JSONL-Token-Tracking ein).
- **Settings-UI für `workspace_path`** — Sprint 8. Bei ungültigem Pfad zeigt die Sidebar jetzt einen sauberen Empty-State mit Hinweis auf `settings.json`.
- **Verlauf-Panel für Legacy-Bucket-Sessions** — Sprint 6. Die übrig gebliebenen Sprint-2/3-Sessions sind aktuell nur über direkte DB-Tools erreichbar (siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md)).

---

## 2026-05-09 — Sprint 3.5: Copy/Paste im Terminal

### Was jetzt geht

- **Drei parallele Copy/Paste-Wege im Terminal.** Smart Ctrl+C/V (Windows-Terminal-Konvention: copy bei Selection mit Auto-Clear, sonst SIGINT durchlassen; Ctrl+V immer paste), Ctrl+Shift+C/V (cross-platform-Standard), Ctrl+Insert/Shift+Insert (Unix-X11-Konvention, Bypass für globale Screenshot-Hotkey-Konflikte). Alles geht durch eine pure Logik-Util `createCopyPasteKeyHandler`, der xterm via `attachCustomKeyEventHandler` vor dem PTY-Routing greift; Paste schickt Bracketed-Paste-Sequenzen, damit claude den Block nicht zeilenweise interpretiert.
- **Selection-Highlight im dunklen Theme dezent.** `selectionBackground` auf 18 % Alpha emerald reduziert, `selectionForeground` ganz raus — leere Terminal-Zellen werden nicht mehr zur grünen Wand, gefüllte Zeilen behalten ihre Original-Vordergrundfarbe.
- **Fokus-Restaurierung nach Modal-Close und Klick im Terminal-Padding.** TabContainer dispatcht ein `td-focus-active`-Window-Event nach dem Schließen des NewSessionModal; TerminalTab fängt es und ruft `terminal.focus()`. Plus `onMouseDown` auf der Terminal-Pane fordert den Fokus zurück, wenn der User irgendwo im Padding klickt — sonst bleibt er auf zuletzt gedrücktem Button kleben und Tastatur-Events erreichen xterm nicht.
- **DevTools per F12 / Ctrl+Shift+I.** Mit `autoHideMenuBar: true` und ohne benutzerdefiniertes Application-Menu griffen Electrons Default-Accelerator nicht; jetzt explizit über `webContents.before-input-event` gehookt.

### Umgesetzte Entscheidungen

- **Smart Ctrl+C/V als Default-Empfehlung** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Drei Bindings parallel statt nur einer „reinen" Variante — der User entscheidet je nach Fingergedächtnis und globalem Hotkey-Konflikt. Smart-Variante räumt nach jedem Copy die Selection ab, damit der nächste Ctrl+C wieder als SIGINT durchläuft.
- **Pure-Logik-Trennung wie schon `createNotesSaver`.** `createCopyPasteKeyHandler` ist driver-injected (ClipboardLike + getTerminal-Lambda) — 17 Tests laufen ohne echtes xterm und ohne Browser-Clipboard.

### Bekannt-und-beobachtet (nicht Sprint-3.5-Bug)

- **xterm-Console-Error `Cannot read properties of undefined (reading 'dimensions')`** in Dev-Mode beim Tab-Mount/Unmount-Race unter React-StrictMode. xterm-internes Race zwischen `Viewport.syncScrollArea` und `RendererService.dispose`. Funktional harmlos (Tippen, Copy/Paste, Tab-Wechsel laufen), in Production-Builds ohne StrictMode tritt es nicht auf. Eintrag in [TECH_SCHULDEN.md](./TECH_SCHULDEN.md).
- **claude-Code-Pasted-Text-Komprimierung.** Bei Pastes >~100 Zeilen ersetzt claude den Inhalt im Terminal durch einen Platzhalter `[Pasted text #N +K lines]`. Das ist claudes Feature, nicht unser Bug — die Bracketed-Paste-Pipeline schickt alle Bytes, claude entscheidet die Anzeige.

---

## 2026-05-09 — Season 3: Multi-Session

### Was jetzt geht

- **Mehrere claude-Sessions parallel als Tabs.** Im Tab-Bar oben Pillen mit Status-Dot, Title, Resume- und ×-Button; rechts ein +-Button. Tab-Wechsel via Klick oder `Ctrl+Tab` / `Ctrl+Shift+Tab`. Alle xterm-Instanzen bleiben dauerhaft mounted (per CSS sichtbar/versteckt) — der Buffer überlebt jeden Tab-Wechsel. Architektur-K2-Annahme „2-5 Tabs realistisch" ist die Speichergrenze.
- **Vollständiger Session-Lifecycle.** Status-Übergänge `running → completed` (PTY-Exit), `running → interrupted` (App-Quit), `running → error` (Spawn-Failure), `running/completed/interrupted/error → archived` (Tab-Schließen via ×), `completed/interrupted/error → running` (Resume) laufen alle durch eine zentrale `SessionLifecycle`-Klasse, die disallowed-Transitions ablehnt und `ended_at` als Side-Effect setzt/nullt.
- **Resume von beendeten Sessions.** Auf Tab-Pillen mit Status `completed`/`interrupted`/`error` erscheint ein ↻-Button; ein Klick spawnt `claude --resume <session-id>` mit dem ursprünglichen `cwd` und gespeichertem `current_model`, der Status wandert zurück auf `running`. Pre-Checks (Binary-Auflösung, cwd-Existenz) wie beim ersten Spawn.
- **NewSessionModal mit Modell-Picker.** `Ctrl+N` oder `+` öffnet ein Backdrop+Dialog (Architektur 6.0.1) mit Title-Input, Type-Pills (Feature/Bug/Review/Docs-Sync) und Modell-Dropdown (human-readable Labels „Opus 4.7" usw., Model-IDs intern). Default aus `settings.default_model`, Esc schließt, Auto-Focus auf Title.
- **Notizen pro Session mit Auto-Save.** Collapsible Footer unter dem aktiven Terminal mit Plain-Text-Textarea. Auto-Save nach 500 ms Debounce, plus Sofort-Flush bei Blur, Tab-Wechsel (Component-Unmount) und `window.beforeunload`. Idempotent: derselbe Wert wird nicht doppelt gespeichert.
- **App-Quit ohne Status-Lärm.** `before-quit` markiert die Lifecycle als `shuttingDown`, patcht alle running-Sessions synchron auf `interrupted`, dann erst `killAll()`. Der `pty:exit`-Handler prüft das Flag und überschreibt nicht mehr — Sprint-2-Bug („alle Sessions beim Quit fälschlich auf completed") ist behoben.
- **Pre-Commit-Gate.** Husky-Pre-Commit-Hook ruft `npm run typecheck && npm test` (Working Rule 6). 91/91 Tests grün, Suite-Lauf ~500 ms — komfortabel unter der Schmerzgrenze.

### Umgesetzte Entscheidungen

- **Tab-Persistenz: Variante A (alle xterm dauerhaft mounted, CSS-Toggle)** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Snapshot/Replay (B) und Single-Instance-Multiplexing (C) wären für 2-5 Tabs Premature-Optimization mit echten Bug-Risiken (ANSI-Escape-Replay, Cursor-Reset).
- **Lifecycle-State-Machine: Variante A (zentraler Reducer)** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Eine `SessionLifecycle`-Klasse kennt alle erlaubten From×To-Übergänge — disallowed wird abgelehnt, Side-Effects (`ended_at`) zentral. Sprint 5 (State-Detection mit waiting/idle) erweitert sauber dieselbe Stelle.
- **Resume-Modell: Variante A (gleiches Modell wie ursprünglich)** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Architektur 6.2 ist Spec; `/model` im laufenden Claude reicht für die seltenen Modell-Wechsel-Fälle.
- **Notes-Save: Variante B (Debounce + onBlur + onUnmount + beforeunload)** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Pure-Logik-Util `createNotesSaver` ist driver-injected — Tests fahren ohne React und IPC.
- **App-Quit-Race: Variante A (synchrone DB-Patches vor killAll)** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Variante C (Reconciliation beim nächsten App-Start) auf Sprint 8 verschoben — siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md).
- **Husky-Pre-Commit-Hook eingerichtet.** `npm run typecheck && npm test` als Gate; Working Rule 6 hat damit eine Maschine, die sie durchsetzt.

### Bonus-Bugfix unterwegs

- **StrictMode-Double-Spawn beim ersten Tab-Mount.** `pty:create` wurde im Dev-Mode zweimal gefeuert (StrictMode-Effekt → Cleanup → Re-Effekt) und schlug beim zweiten Mal an der UNIQUE-Constraint auf `sessions.id` an. Fix: `useRef`-Guard pro Tab-Instanz, der die Spawn-Dispatch-Phase markiert (Sprint-2-Pattern, war bei der Multi-Tab-Refaktorisierung herausgefallen, weil der Briefing-Hinweis nur auf UUID-Generation zielte — der Side-Effect-Aspekt wurde unterschätzt).

### Offen geblieben (bewusst verschoben)

- **State-Detection (running vs. waiting/idle via JSONL-Event-Frequenz)** — Sprint 5. Status-Dot bleibt in Sprint 3 statisch („running" solange PTY lebt, sonst die persistierte Status-Spalte).
- **Crash-Recovery für orphane running-Sessions beim App-Start** — Sprint 8 (siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md)). Variante C aus Sprint-3-Briefing, vom User explizit dorthin verschoben.
- **Verlauf-Panel mit historischen Sessions** — Sprint 6. In Sprint 3 sind Tabs ein Live-Konzept; Resume gilt nur für Sessions, deren Tab noch im Bar liegt.
- **Settings-UI für Modell-Liste / claude-Binary** — Sprint 8 (Settings-Dialog).

---

## 2026-05-09 — Season 2: Single-Tab-PTY

### Was jetzt geht

- **claude läuft im xterm-Terminal.** Beim App-Start spawnt TakumiDeck `claude --model <default>` als ConPTY-Subprozess im konfigurierten `workspace_path`; der Output landet live im xterm-Canvas im Renderer. Eingabe, Resize und natürliches Beenden funktionieren end-to-end.
- **PTY-Output ist gegen IPC-Overload gedrosselt.** Pro Session puffert der Main-Prozess ankommende Daten und flusht alle 16 ms in einem einzigen `pty:data`-Event Richtung Renderer (Architektur K3). Lazy-Timer: ohne Daten keine Idle-Last, ohne Output kein leerer Tick.
- **Sessions landen in der DB.** Jede Session bekommt eine Row in `sessions` mit `status='running'` beim Spawn; bei natürlichem PTY-Exit wird automatisch auf `status='completed'` plus `ended_at` gewechselt. `session:update` erlaubt dem Renderer Notes/Title/Status-Patches.
- **Renderer crashed nicht mehr durch ConPTY-Worker-Errors.** Pre-Checks für `claude_binary_path` (über `where`/`which`) und `cwd` (Existenz) plus ein `uncaughtException`-Handler im Main-Prozess fangen die typischen Fehler (`ERROR_FILE_NOT_FOUND`, `ERROR_DIRECTORY`) sauber ab — der User sieht eine klare Meldung statt eines „A JavaScript error occurred"-Dialogs.

### Umgesetzte Entscheidungen

- **@lydell/node-pty als PTY-Backend** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Der ursprünglich genannte @homebridge-Fork hat keine Win32-Prebuilts mehr für Electron 33+; lydell verteilt NAPI-Binaries via optionale Subpakete (esbuild-Stil) und ist Electron-Version-unabhängig.
- **xterm.js auf v5.5 gepinnt** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). v6 hat den Canvas-Renderer entfernt; Architektur-K2 verlangt explizit Canvas (kein WebGL).
- **`claude_binary_path` als Setting mit PATH-Default** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Default `'claude'` greift den PATH ab, der Pre-Check bevorzugt auf Windows `.exe`/`.cmd`/`.bat` über das endungslose Unix-Shell-Script.
- **PtyManager als Klasse mit injiziertem Spawn-Driver.** Spiegelt das SettingsStore-Pattern aus Sprint 1; Tests fahren mit Fake-Driver, kein realer Subprozess. Listener-Setter statt EventEmitter, weil die IPC-Bridge ohnehin nur einen Konsumenten hat.
- **Default-Project als FK-Lifeline** (siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md)). Bis der Workspace-Scanner aus Sprint 4 echte Projekte erkennt, hängen alle Sessions an einem stabilen `__default__`-Project-Row.

### Bonus-Bugfix unterwegs

- **Vite-Renderer-Config hatte `root` nicht gesetzt.** Die Sprint-1-Foundation-Smoke-View hat in Wirklichkeit nie gerendert (`http://localhost:5173/` lieferte 404, der Sprint-1-Eintrag war voreilig); der Bug fiel erst auf, als das schwarze Fenster in Sprint 2 sichtbar wurde. Fix: `root: src/renderer` + absoluter `outDir` in `vite.renderer.config.ts`.

### Offen geblieben (bewusst verschoben)

- **Multi-Tab + Tab-System** — Sprint 3.
- **Session-Lifecycle für interrupted / error / archived + Resume-Button** — Sprint 3. Sprint 2 hat nur die `running → completed`-Transition automatisch.
- **Notizen pro Session (Auto-Save)** — Sprint 3. `session:update` kann Notes schon, das Renderer-Textarea fehlt.
- **Modell-Auswahl-Dialog** — Sprint 3+. Sprint 2 spawnt mit `settings.default_model`, ohne UI-Picker.
- **State-Detection (running vs. idle via JSONL-Event-Frequenz)** — Sprint 5.
- **Settings-UI für `workspace_path` / `claude_binary_path`** — Sprint 8 (Settings-Dialog). Wer aus Sprint 1 einen ungültigen `workspace_path` mitbringt, muss `settings.json` aktuell noch manuell editieren.

---

## 2026-05-09 — Season 1: Foundation-Skelett

### Was jetzt geht

- **Die App startet.** `npm start` (oder `start-dev.bat`) öffnet ein Electron-Fenster mit dem Foundation-Smoke-View, das Version + komplettes Default-Settings-JSON vom Main-Prozess über die typed IPC-Bridge empfängt. Vorher gab es nur Doku, keinen lauffähigen Code.
- **Persistente Datenstruktur ist da.** Beim ersten Start legt die App `%APPDATA%\TakumiDeck-dev\` mit `settings.json` (Defaults aus Architektur K4), `data.sqlite` (WAL-Mode + komplettes Schema aus `0001_init`), `logs/` und `templates/` an.
- **IPC-Boundary ist sicher.** `contextIsolation: true` + `sandbox: true` + zod-Runtime-Validation für jedes Payload — Renderer hat keinen Node-Zugriff, fehlerhafte Calls liefern saubere Result-Objekte statt Exceptions.

### Umgesetzte Entscheidungen

- **Eigene JSON-Operationen statt electron-store** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Atomic write via `.tmp` + rename, zod-Validierung beim Lesen.
- **zod-Runtime-Validation an allen IPC-Boundaries ab Tag 1** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). Verhindert, dass spätere Channels still ohne Validation eingeführt werden.
- **electron-log** als Logging-Library, schreibt in `<userData>/logs/main.log` (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)).
- **Vitest-Setup direkt mit Foundation-Smoke-Tests** (siehe [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md)). 20 Tests grün: Result-Helper, zod-Schemas, SettingsStore-Roundtrip, Migration-Runner.

### Offen geblieben (bewusst verschoben)

- **PTY + xterm.js + Tabs** — Kern von Sprint 2.
- **Volles Layout (Sidebar / Terminal / Right-Pane / Plannutzung)** — der Smoke-View ist nur ein JSON-Dump, das echte Layout kommt mit den jeweiligen Sprints (Sidebar mit Sprint 4, Right-Pane mit Sprint 7).
- **Migration-Tests gegen echte SQLite-Verbindung** — siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md), Fake-Driver-Pattern stattdessen.

---

## Template-Eintrag (beim ersten echten Eintrag ersetzen)

## YYYY-MM-DD — Season <Nummer>: <Feature-Name>

### Was jetzt geht

- **<Kern-Mehrwert aus Nutzersicht>.** Ein Satz, der beschreibt, was neu möglich ist. Vorher-Zustand kurz mit dazugegeben („Vorher war …").
- **<Zweiter Mehrwert, falls mehrere>.**

### Umgesetzte Entscheidungen

- **Variante A / B / C gewählt.** Kurz Begründung, warum die Alternative nicht genommen wurde. (Details gehören in [ENTSCHEIDUNGEN.md](./ENTSCHEIDUNGEN.md), hier nur der Anker.)
- **<Andere Entscheidung mit Scope-Charakter>.**

### Offen geblieben (bewusst verschoben)

- **<Teil, der explizit ausgeklammert wurde>.** Wandert nach Phase 2 / in eine eigene Season / in die Roadmap.
