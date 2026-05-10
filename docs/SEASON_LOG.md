# Season-Log

Protokoll aller abgeschlossenen Seasons. Ergänzt [CHANGELOG.md](./CHANGELOG.md) (das den Feature-Mehrwert dokumentiert) mit dem *Prozess-Kontext*: Was lief gut? Was hat gebremst? Was sollte die nächste Season anders machen?

## Unterschied zum CHANGELOG

- **CHANGELOG.md** → Was kann der Nutzer jetzt? (Ergebnis-fokussiert, fachlich)
- **Dieses Dokument** → Wie lief die Season? (Prozess-fokussiert, retrospektiv)

## Format pro Eintrag

- `##`-Überschrift: `Season <N> — <Feature-Name>`
- **Ziel:** Was war der geplante Scope zu Beginn?
- **Ergebnis:** Was wurde tatsächlich fertig? Delta zum Ziel benennen, falls vorhanden.
- **Gut gelaufen:** Konkrete Dinge, die die Season effizient gemacht haben.
- **Gebremst durch:** Konkrete Hindernisse (unklare Anforderungen, technische Überraschungen, Scope-Creep).
- **Für nächste Season:** Maximal 2–3 direkt umsetzbare Hinweise.

Neue Einträge **oben** anfügen (neuste Season zuerst).

---

## Season 8 — Polish (MVP-Abschluss von Phase 1)

**Ziel:** Sprint-8-Polish-Phase: Settings-Dialog (Architektur 6.9, 6 Tabs mit Mix Form-Inputs + Raw-JSON-Editor), Header-Bar (Architektur 6.0, td-titlebar mit Brand/Meta/Window-Controls), Crash-Recovery-Reconciliation-Pass, Datei-Tab-Persistenz pro Projekt, Sensitive-Pattern-Konfigurierbarkeit, Modell-Limit-Defaults auf 200 k, Tastatur-Hints, Error-Handling-Pässe (FS-Permission/SQLite-Locking/claude-Health), `SESSION_NO_CLAUDE_UUID`-Cosmetic-Hint, Build + manuelle GitHub-Release-Anleitung. Plus alle drei TECH_SCHULDEN-Einträge aus Sprint 7 aufgelöst (Datei-Tabs, Sensitive-Patterns, Modell-Limits).

**Ergebnis:** Alle 10 Sprint-Tasks ✅, plus drei Bonus-Bugfixes nach User-Screenshot (Filter-Pillen-Wrap, `frame: false`, Mid-Spalten-Verteilung 1.6fr/1fr). Tests: 396 grün insgesamt (+27 neu in Sprint 8: 9 Reconciliation, 10 settings-auto-save, 7 file-tabs-Persistenz, +1 Test in usage-aggregation für AppSettings-Type-Erweiterung). Suite-Lauf ~1.1 s, weiter komfortabel. Phase 1 ist damit komplett — alle Roadmap-Features auf ✅, MVP ready für `npm run make` und manuelle GitHub-Release.

**Gut gelaufen:**

- **9 Variants vor dem Code, alle Empfehlungen direkt übernommen.** V1-A bis V9-A. Pattern wie Sprints 4/5/6/7 (6/6 → 10/10 → 9/9 → 9/9 → 9/9). Memory-Konvention „UX-Defaults: konvenient vor traditionell" trug 8 von 9 Mal direkt (V6 war neutral). V9-A (Reihenfolge: Settings-Dialog zuerst, dann isolierte Wins, dann Chrome, dann Polish, dann Build) hat sich besonders ausgezahlt — drei Polish-Punkte (Sensitive-Patterns, Modell-Limit-Defaults, P90-Window) hingen am Settings-Dialog-UI; ohne den Dialog zuerst hätten sie zwei Render-Iterationen über dieselbe Komponente gebraucht.
- **Driver-Injection-Pattern trägt durch alle 8 Sprints durchgängig.** `reconciliation.ts` nimmt SessionRepo + MessageRepo + Lifecycle injiziert (Tests fahren mit InMemory-Drivern aus Sprint 2/5, kein echtes SQLite). `settingsAutoSave.ts` nimmt SettingsApi + Scheduler injiziert (Tests fahren mit Manual-Scheduler statt vi.useFakeTimers, deterministisch). `JsonRawEditor` nimmt eine pure `validate(source) → { value, errors }`-Funktion injiziert. Plus drei bestehende Driver weiter im Einsatz (Git, FsTree, JSONL-Read).
- **Pure-Logik-Splits an mehreren Stellen.** `createDebouncedSaver` (Coalescing + Schema-Pre-Validation + Outcome-Stream), `compileUserPatterns` (RegExp-Bauen mit error-tolerant drop), `validateJsonAgainst` (JSON.parse + zod-safeParse mit Error-Mapping), `reconcileCrashedSessions` (selbst, durchgehend pure mit Driver-Inputs). Alle gegen synthetische Inputs testbar; kein vi.fn-basiertes Mocking nötig außer für `window.api`.
- **Alle drei Sprint-7-TECH_SCHULDEN aufgelöst.** Datei-Tabs (V5-A localStorage-Hydrate), Sensitive-Patterns (V8-A additiv), Modell-Limits (defaults.ts auf 200 k). Plus die Sprint-3-Crash-Recovery-Schuld (V4-C) und der Sprint-6/7-`SESSION_NO_CLAUDE_UUID`-Cosmetic-Hint. Fünf Schulden-Einträge in einem Sprint geräumt — der letzte Sprint vor MVP-Release ist genau der Slot, an dem das geht.
- **User-Screenshot-Diagnose hat drei Layout-Defekte in einem Pass gefangen.** Filter-Pillen-Wrap (CSS-Bug aus Sprint 6/7, vorher unentdeckt), Doppel-Header (Sprint-8-Defekt — initial nur td-titlebar dazugebaut ohne `frame: false`), Spalten-Verteilung (Sprint-7-Default war 1fr/1fr, in der Praxis zu eng). Alle drei mit AskUserQuestion-Variants vor dem Code geklärt — User wählte Empfehlungen, Fix in 5 Minuten.

**Gebremst durch:**

- **Doppelter Header initial übersehen.** Beim ersten Sprint-8-Pass habe ich die td-titlebar (Architektur 6.0) in App.tsx eingefügt, ohne die native Electron-Frame zu deaktivieren. Resultat: zwei Header übereinander, einer mit „TakumiDeck" und Standard-Window-Controls, einer mit Brand + Meta + meinen IPC-Window-Controls. Architektur 6.0 sagt klar „Window-Controls (minimieren, maximieren, schließen)" als Teil der Header-Bar — `frame: false` war die implizite Bedingung, die ich beim Sprint-Plan nicht explizit gemacht habe. Lehre: bei UI-Komponenten, die mit Electron-Frame-Konfig interagieren, beim Sprint-Briefing das `BrowserWindow`-Konfig-Setup als expliziten Punkt mit aufnehmen.
- **`@codemirror/lang-json` als neue Dependency vergessen.** Settings-Dialog brauchte den JSON-Sprache-Modus für die Raw-JSON-Editoren. Erstwurf war ein simples textarea mit `JSON.parse`-Validation — aber der User hatte „CodeMirror 6 wiederverwenden" als etablierte Entscheidung markiert. Pivot auf `@codemirror/lang-json` mit `npm install`, ohne dass das im Sprint-Plan explizit als Dependency-Änderung markiert war. ~5 min plus Re-Test der Bundle-Größe (kaum Impact, ~30 KB).
- **Manual-Scheduler-Testfall vergessen.** Erstwurf von `settings-auto-save.test.ts` hatte einen naiven Scheduler, der gecancelte Timer auf no-op setzte — `flushNext()` shifte den ersten Eintrag und kriegte den no-op statt den eigentlichen Timer. Zwei Tests rot, ~5 min Diagnose und Fix (Scheduler überspringt cancelte Slots). Lehre: bei Manual-Scheduler-Patterns die cancel-Semantik im Test-Helper genauso sorgfältig modellieren wie die scheduler-Semantik selbst.

**Für nächste Season:**

- **Phase 1 ist komplett.** Es gibt keinen Sprint 9 in der Roadmap — Phase 2 ist der nächste Schritt, wenn der MVP-Daily-Driver-Use im echten Gebrauch erste Schmerzpunkte zeigt. Phase-2-Slot-Kandidaten aus Architektur 8: volle State-Detection (Permission-Prompts), Trigger-Phrasen-Schnellbuttons, Docs-Sync-Session, erweiterte Template-Variablen, 20%-Kontext-Soft-Warning, Auto-Update via electron-updater, GitHub Actions Build, Markdown-Preview Side-by-Side, Modell-Filter im Verlauf, Diff-Viewer Multi-Tab.
- **Phase-2-Trigger ist „real Daily-Driver-Test über mindestens eine Woche".** Vorher wäre jeder Phase-2-Sprint Spekulation. Konkret: einmal per `npm run make` bauen, installieren, eine Woche statt Claude-Code-CLI direkt nutzen — die Schmerzpunkte werden sich von selbst sortieren.
- **TECH_SCHULDEN-Restbestand ist vertretbar.** Verbleibende Einträge sind alle Edge-Cases mit klar dokumentierter Auflösung: Notes-Auto-Save-best-effort (synchroner IPC bei Bedarf), `awaitWriteFinish`-Latenz (zweiter Polling-Ring bei Bedarf), Multi-Session-Backfill (Sortier-Pass bei Bedarf), `cache_creation/cache_read` summiert (Migration `0004` bei Bedarf), xterm-Console-Error in Dev-Mode (xterm v6 / WebGL-Renderer Phase 5+), Migration-Runner-Tests gegen Fake-Driver (Worker-Threads bei Bedarf), Workspace-Path-Migration (über Settings-Dialog jetzt komfortabel). Plus die drei Schulden mit „keine technische Auflösung möglich"-Status (Pre-Hotfix-Sessions, Migration-Runner-Tests). Keine davon blockt MVP-Release.
- **Memory-Konvention-Stand für Phase 2.** Vier Memories aus Sprint 1-7 weiter aktiv: Dev-Umgebung Windows 11 (Node 24 + `@lydell/node-pty`), StrictMode-Side-Effect-Guard nur für Server-Mutationen, UX-Defaults: konvenient vor traditionell (8/9 in Sprint 8 bestätigt), Zustand-Selectors müssen referenz-stabil sein. Sprint-8-Crash-Recovery-Reminder ist mit ✅ aufgelöst und kann aus dem Memory-Index raus.

---

## Season 7 — Editor + Git + Right-Pane

**Ziel:** Sprint-7-Kern: Markdown-Editor (CodeMirror 6 + lang-markdown + lang-yaml + manueller Save + Inline-YAML-Lint + Preview-Toggle), Datei-Tabs pro Projekt mit Schnellzugriff, hierarchischer Datei-Browser mit Filter, Working-Tree-Diff via @codemirror/merge, PreCommitModal mit Sensitive-File-Warnung und Trigger-Phrase-Send, commit-Pill in der Action-Bar. Plus Notes-Migration aus dem Sprint-3-NotesFooter in den Right-Stack und Drive-by-Cleanup der toten `.td-sidebar-*`-CSS-Blöcke.

**Ergebnis:** Alle Feature-Blöcke ✅. Skeleton-First-Reihenfolge (Q9-A) hat sich gerade beim Mid-Sprint-Layout-Pivot gerettet — Komponenten lagen schon in eigenen Files, der Pivot vom 232-px-Single-Pane auf das 4-Spalten-Grid kostete nur ~30 min. Tests: 369 grün insgesamt (+88 neu in Sprint 7: git-IPC 10, fs-resolve 6, editor-dirty-state 11, yaml-validator 8, quick-access 8, file-tabs-store 12, fs-tree-scanner 7, tree-filter 7, sensitive-files 11, +8 erweiterte git-IPC für git:show). Suite-Lauf ~1.2 s, weiter komfortabel unter der Schmerzgrenze.

**Gut gelaufen:**

- **9 Variants vor dem Code, alle Empfehlungen direkt übernommen.** Wie Sprints 4/5/6 (6/6 → 10/10 → 9/9 → 9/9). Q1-A war eine bewusste Abweichung von der UX-Defaults-Memory („konvenient vor traditionell") — die Spec war eindeutig (Architektur 6.8 + Roadmap), und die Begründung („Markdown-Editing in versionierter Doku ist absichtsvoll, nicht ephemeres Pad-Editing") trägt. Memory-Konvention bleibt für reine UX-Picks gültig, aber Spec hat Vorrang, wenn die App-Workflow-Logik auf Sichtbarkeit von Zwischenzuständen baut.
- **Skeleton-First-Reihenfolge hat den Mid-Sprint-Pivot überlebt.** Phase 1 hat das Right-Pane-Layout früh angelegt, mit eigenen Komponenten pro Sektion (RightPaneCodeSection / RightPaneFilesPanel / NotesPanel). Als der User in Phase 4 den Pivot triggerte („in der Vorlage sieht es besser aus"), war die Aufteilung in `EditorPane.tsx` (3. Grid-Spalte) und `RightStack.tsx` (4. Grid-Spalte) ein 30-min-Refactor — die Komponenten-Logik blieb komplett, nur das App-Layout-Grid und die Eltern-Komposition mussten umgebaut werden. Sprint-6-Lehre („Sidebar zwei Mal gebaut, weil Design-Handoff erst nach User-Feedback durchgezogen wurde") hat sich durch das Skeleton-First-Pattern direkt selbst entschärft.
- **Driver-Injection-Pattern trägt durch Sprint 7 weiter.** GitDriver mit realGitDriver (simple-git) und FakeGitDriver (vi.fn-basiert) — git-IPC-Tests fahren ohne realen Git-Roundtrip, ohne temporäres Repo. FsTreeLikeDriver für den Datei-Browser-Scanner analog Sprint-4-Workspace-Scanner. TemplateFsLikeDriver aus Sprint 6 wiederverwendet für `fs:read/write` (indirekt über `node:fs` im Real-Pfad). Tests fahren ohne better-sqlite3, ohne chokidar, ohne simple-git, ohne echtes Filesystem.
- **Pure-Logik-Splits an mehreren Stellen.** `editorDirtyState` (saved/buffer + isDirty/markSaved/updateBuffer), `validateClaudeMdYaml` (Frontmatter-Extraktion + js-yaml-Parse + Position-Mapping), `buildQuickAccessList` (Standards + phase + on_demand mit Deduplikation), `filterTree` (rekursiv mit Pfad-Hierarchie-Erhalt), `findSensitiveFiles` (Basename-Match), `resolveProjectRelative` (Anti-Traversal). Alle gegen synthetische Inputs testbar, kein Mock-Aufwand. Sprint-1-better-sqlite3-ABI-Schuld trifft Sprint-7-Tests gar nicht erst.

**Gebremst durch:**

- **Layout-Pivot mitten im Sprint.** Briefing hatte Editor + Files + Notes alle in einem 232-px-Right-Pane vorgesehen — visuell zu eng beim ersten User-Test mit echtem Markdown-Inhalt (Code wickelt nach 30 Zeichen, YAML-Linter-Marker schwer lesbar). Pivot auf das Design-Handoff-4-Spalten-Grid (240/1fr/1fr/232) kostete ~30 min Refactor + ~10 min CSS-Migration. Lehre: bei UI-relevanten Sprints den Design-Handoff `claude-export/styles.css` + `app.jsx` PROAKTIV als Spec lesen, nicht nur als Begleit-Referenz. Das `td-main`-Grid (Zeilen 122-195 in `styles.css`) hatte 4 Spalten von Anfang an gezeichnet — die Briefing-Vereinfachung „Editor in den Right-Pane" hat das übersehen.
- **Re-Render-Endlosschleifen durch instabile Zustand-Selectors.** Erster App-Start nach Phase 4 zeigte sofort „Maximum update depth exceeded" und ein schwarzes Fenster. Zwei aufeinanderfolgende Bug-Pattern: (1) Selectors mit Object/Array/Set-Default returnten neue Referenzen pro Render → Zustand interpretiert das als State-Change → infinite. (2) Eltern-Inline-Closure als `onDirtyChange`-Prop + useEffect-deps → bei jedem Render neuer Closure → Effect feuert → setDirty triggert Store-Mutation → infinite. Beide Pattern haben Tests übersehen, weil Vitest die Selectors nicht in einem React-Lifecycle aufruft. Diagnose über DevTools-Console direkt nach User-Hint, Fix in zwei Iterationen (~15 min). Memory-Eintrag „Zustand-Selectors müssen referenz-stabil sein" aufgenommen.
- **`onSave` / `onDirtyChange` als Inline-Lambdas vs. stable-ref-Pattern.** Erster Fix-Versuch hatte nur den Selector gefixed, der zweite Loop kam aus dem onDirtyChange-Effect-Lifecycle. Lehre: bei Editor-Komponenten, die Callbacks an Eltern-Stores reichen, IMMER `useRef`-Pattern für die Callbacks im Komponenten-Body nutzen (analog zum schon vorhandenen `onSaveRef`-Pattern). Plus Store-Mutationen DEFENSIV idempotent machen (early-return bei No-Op) — `setDirty/setSaved/setActive` sind jetzt alle drei No-Op-fest.

**Für nächste Season:**

- **Datei-Tab-Persistenz über App-Restart.** TECH_SCHULDEN-Eintrag — wenn der User in Sprint 8+ den Daily-Driver-Workflow „App schließen, am Folgetag dort weiter machen" testet, wird die fehlende Persistenz auffallen. localStorage-Pfad analog Sprint-5-`activeProjectId` ist die einfache Lösung (~30 min). Slot Sprint 8 oder Phase 2.
- **Settings-konfigurierbare Sensitive-Patterns.** Sprint 8 (Settings-Dialog) ist der natürliche Slot. `AppSettings.sensitive_file_patterns: string[]` mit den jetzigen Defaults; `findSensitiveFiles` bekommt das Array als zweiten Parameter — die Pure-Logik ist schon driver-frei. ~5 Zeilen Verdrahtung plus UI-Form-Field.
- **`SESSION_NO_CLAUDE_UUID`-Cosmetic-Hint im Verlauf-Detail-Pane.** Sprint-6-Reminder ist nach Sprint 7 weiter geschoben (PreCommit + commit-Pill hatten Vorrang). Sprint 8 nimmt das mit, wenn das Verlauf-Pane für den Settings-Dialog ohnehin angefasst wird.
- **Editor-File-Save-Race-Schutz.** `markSaved(state, value)` lässt den Buffer absichtlich unangetastet, falls der User zwischen Save-Trigger und Save-Success weiter getippt hat — dann bleibt das Tab dirty, was korrekt ist. Aber der ServerStand in `savedContent` ist dann veraltet, sobald der nächste Save kommt — der Editor schickt den AKTUELLEN Buffer, der „echte" letzte Save-Wert geht verloren. Praktisch unkritisch (Single-User-App, kein Concurrent-Editing), aber Phase 2+ könnte einen Konflikt-Detector bauen, wenn der User irrtümlich `git checkout`-ähnliche Operationen direkt im Filesystem macht, während der Editor offen ist.

---

## Season 6 — Templates + Season-Tracker

**Ziel:** Sprint-6-Kern: Template-Reader (on-demand-Scan, globaler + Per-Projekt-Ordner + Legacy-Konvention), Variable-Filling-Util (Auto- + User-Variablen mit Pflicht-Validation), TemplatesModal mit Form + Live-Preview, Bracketed-Paste-Send via existierende Sprint-3.5-Mechanik, atomare Season-Counter-Allocation pro Projekt, Verlauf-Panel als Replace-View mit Filter (Typ/Status/Volltext) und Resume aus History. Plus Legacy-Bucket sichtbar machen, cache_creation/cache_read explizit auf Phase 2 verschoben.

**Ergebnis:** Alle fünf Feature-Blöcke ✅. Counter atomar via better-sqlite3-Transaction; Verlauf-Panel mit LEFT-JOIN-Token-Aggregat aus messages-Tabelle; Templates mit on-demand-FsScanner und beide Quellen mit Source-Tag separat; Modal mit Form-Spalte + Live-Preview-Spalte und Pflicht-Validation; Send via dispatched CustomEvent, das der aktive TerminalTab via terminal.paste konsumiert. Plus zwei tiefe Mid-Sprint-Erweiterungen: Resume-Bug-Fix (Variante C: `--session-id` beim Spawn + Migration `0003` + Watcher-Backfill aus Filename-UUID, status-agnostisch) und UX-Fix (× non-destruktiv, neuer `session:archive`-Channel, 3-Sektionen-Sidebar nach Design-Handoff, Action-Bar mit Templates-Pill nach `td-term-bar`-Spec). Tests: 281 grün insgesamt (+62 neu: 5 Counter, 10 History-Filter, 9 Template-Reader, 13 Variable-Filling, +6 UI-Store, 14 Claude-Session-ID + Backfill, weitere Anpassungen). Suite-Lauf ~900 ms.

**Gut gelaufen:**

- **9 Variants vor dem Code, alle Empfehlungen direkt übernommen.** Sprint-6-Briefing hatte 9 offene UX/Architektur-Fragen — Empfehlung 1B/2B/3A/4A/5A/6B/7B/8A/9A wurde 1:1 übernommen, kein Mid-Sprint-Umentscheid aus den Variants. Dasselbe Pattern wie Sprint 4 (6/6) und Sprint 5 (10/10): Variants-Pflicht zahlt sich.
- **Driver-Injection-Pattern trägt jetzt durch Sprint 6 nahtlos.** ProjectRepository um `allocateSeasonNumber` (atomare Transaction) erweitert; SessionRepository um `listHistoryForProject` (mit dynamischer WHERE-Klausel) und `setClaudeSessionId` (idempotenter Check-and-Set); MessageRepository unverändert. InMemory-Driver bekommen jeweils Test-Helper (`seedMessageStats`, `seedSession`); SQL-Drivers nutzen prepared Statements + Transactions. Tests fahren ohne better-sqlite3, ohne Filesystem, ohne chokidar.
- **Pure-Logik-Splits an mehreren Stellen.** Variable-Filling-Util (`fillTemplateVariables` + `findVariablesInTemplate` + `buildAutoVariables`) ist 100 % testbar gegen synthetische Strings; Template-Reader (`listTemplates`) nutzt FsLikeDriver-Injection, Tests fahren mit Plain-Object-Tree statt echtem Filesystem. Watcher-Backfill-Logik (Filename-UUID-Extraktion via `claudeUuidFromJsonlPath`) ist eine Pure-Function in `cwd-encoding.ts`.
- **Memory-Konvention „StrictMode-Side-Effect-Guard nur für Server-Mutationen" hat sich erneut bewährt.** Im HistoryPane gab es initial den Reflex, einen `useRef`-Guard um den `session:history`-Useeffect zu legen — Read-only-IPC, kein Guard nötig. Spart einen subtilen Listener-Tot-Bug (Sprint-5-Falle).
- **Design-Handoff als verbindliche Referenz.** Beim Sidebar-Umbau (User-Feedback „wie im Design") konnte ich `docs/design/claude-export/components.jsx` + `styles.css` 1:1 als Spec nehmen und die `td-panel`/`td-list`/`td-pill`-Klassen direkt übernehmen. Das Design-Asset war bisher nur Architektur-Begleiter; in Sprint 6 das erste Mal als verbindliche UI-Vorlage genutzt.

**Gebremst durch:**

- **Resume-Bug seit Sprint 3 unentdeckt.** Sprint 3 hatte `claude --resume <takumi-uuid>` als Pfad implementiert, aber claude-code matched die UUID gegen seine eigene interne Session-UUID, die bis Sprint 6 nirgends mit unserer abgeglichen war. Sprint 5 hatte den Mismatch im JSONL-Watcher-Mapping fixed, aber den Resume-Pfad nicht angefasst — vermutlich weil Sprint-3-Tests den Resume-Spawn-Args nur gegen ihre eigene UUID validiert haben, nicht gegen einen echten claude-Roundtrip. Beim ersten User-Test in Sprint 6 fiel das sofort auf. ~30 Min Variants-Klärung + Hotfix Variante C (~80 Zeilen Code + 14 Tests). Lehre: für IPC-Pfade, die externe Tools spawnen, beim Sprint-Ende einmal manuell durchspielen, nicht nur die internen Tests grün lassen.
- **× war seit Sprint 3 destruktiv, niemand hat's gemerkt.** Sprint-3-Spec hatte `tab-close → archived` als ein Schritt, und die Tests prüften das auch korrekt. Erst in Sprint 6 mit dem Verlauf-Panel wurde der Schmerz sichtbar — User schließt versehentlich, Session ist tot. UX-Fix Variante B (~45 Min: Channel-Split, neuer Archive-Pfad, Inline-Confirmation). Lehre: Lifecycle-Defaults nicht nur als Truth-Table-Test absichern, sondern auch gegen UX-Konventionen (× = „weg", nicht „endgültig löschen") spiegeln.
- **Sidebar-Layout zwei Mal gebaut.** Erste Sprint-6-Implementation hatte einen schmalen Tabs/Verlauf-Toggle pro Projekt — bei User-Feedback („wie im Design") komplett auf 3-Sektionen-Layout umgebaut (~45 Min). Die Vorab-Variants hatten den Design-Handoff-Stack nicht als Option betrachtet, weil ich es als Sprint-7-Right-Pane-Thema klassifiziert hatte. Lehre: bei UI-relevanten Sprints den Design-Handoff-Ordner explizit als Variant-Quelle in den Vorab-Plan ziehen, nicht erst beim Reverse-Engineering nach User-Feedback.
- **Watcher-Backfill war initial zu eng (nur running/idle).** Erstwurf des Hotfix matchte nur live-Sessions (Sprint-5-Token-Tracking-Pattern), womit Legacy-completed-Sessions weiter resume-tot geblieben wären. Variante-C-Versprechen hätte das nicht eingehalten. Erweiterung auf status-agnostischen Backfill via `listMissingClaudeSessionId` plus separater Filename-Pfad in `backfillClaudeSessionId` (~15 Min). Lehre: bei „kombinierten Variants" jede Teil-Variante separat im Test-Szenario durchgehen, nicht nur die Hauptpfad-Logik prüfen.

**Für nächste Season:**

- **Design-Handoff als verbindliche Vorlage-Quelle aktiv nutzen.** Sprint 7 (Editor + Git + Right-Pane) sollte vor dem ersten Code einen kurzen Pass durch `docs/design/claude-export/components.jsx` + `styles.css` machen, um die `td-code-*` / `td-files-*` / `td-notes-*` / `td-diff-*`-Klassen direkt zu übernehmen — nicht erst wenn der User „wie im Design" sagt. Das spart eine Reverse-Engineering-Iteration.
- **Tote `.td-sidebar-*`-CSS-Blöcke aufräumen.** Sprint-6-Refactor hat ~200 Zeilen tote Regeln zurückgelassen (TECH_SCHULDEN-Eintrag). Sprint 7 fasst die `app.css` ohnehin für Right-Pane-Layout an — beim Touch mitnehmen, nicht eigenständig.
- **Pre-Commit-Panel mit Trigger-Phrasen-Send.** Architektur 6.7 + Sprint-7-Roadmap. Die Action-Bar-Komponente aus Sprint 6 hat schon Platz für eine `commit`-Pill — Sprint 7 sollte sie mitfüllen, plus den Pre-Commit-Modal mit Sensitive-File-Warnung. CLAUDE.md-Frontmatter-Trigger-Phrase (`workbench.trigger_phrases.commit`) ist seit Sprint 4 verfügbar; Send läuft analog zum Templates-Pfad via `td-template-send`-Mechanismus (oder eigener Channel).
- **Pre-Hotfix-Sessions mit `claude_session_id IS NULL` UND ohne JSONL: UX-Hint statt Fehlermeldung.** Aktuell zeigt das Verlauf-Detail-Pane bei Resume einer solchen Session den `SESSION_NO_CLAUDE_UUID`-Fehler. Sprint 7/8 könnte den Fehlerfall direkt als Detail-Pane-Hinweis rendern („Diese Session ist nicht mehr resume-fähig — archivieren?"), inklusive einem Direkt-Archive-Knopf. Cosmetic, kein Blocker.

---

## Season 5 — Token-Dashboard

**Ziel:** Sprint-5-Token-Dashboard-Kern: JSONL-Watcher mit Initial-Scan über `~/.claude/projects/`, Token-Aggregation in `messages` + `usage_buckets`, P90-Limit-Schätzung über rolling 192-h-Fenster, Plannutzungs-Bar-Reihe in der unteren Layout-Zeile (300 px) mit Schwellen-Farben + UsageDetailModal. Plus reduzierte State-Detection (`running ↔ idle` über JSONL-Last-Timestamp) und Übersicht/Modelle-Toggle als Skeleton. Plus Sprint-4-Carry-overs: Per-Projekt-Default-Modell aus CLAUDE.md, localStorage-Hydrate für `activeProjectId`, `displayProjectName`-Helper. Ausdrücklich **kein** `waiting`-Status (Phase 2), **keine** Heatmap (Phase 2), **keine** Per-Bucket-Burn-Rate.

**Ergebnis:** Alle vier Token-Dashboard-Features ✅ plus State-Detection ✅ plus Übersicht-Skeleton ✅. Watcher inkl. Anti-Reentrancy-Map und persistierter Byte-Offset (Migration `0002`); 5h/weekly-Bars zeigen reale historische Daten (Initial-Scan zieht 184 JSONLs in <2 s); Per-Session-Kontext-Bar reagiert live auf claude-Antworten (mit ~100 ms `awaitWriteFinish`-Latenz). Drei Bonus-Bugfixes unterwegs: chokidar v5 Glob-Removal (Mid-Sprint-Discovery), TakumiDeck↔claude-Session-UUID-Mismatch (Mid-Sprint-Pivot auf encodeCwd-Match), Sprint-2-`pty:create → DEFAULT_PROJECT_ID`-Lifeline endgültig aufgelöst, plus StrictMode-Listener-Guard-Falle. Tests: 219 grün insgesamt (147 aus Sprint 1-4 unverändert, 72 neue: 15 Parser, 22 Aggregation/Filter/P90, 11 State-Detection, 10 Lifecycle-Sprint5, 9 UiStore-Hydrate, 5 cwd-Encoding). Suite-Lauf ~720 ms.

**Gut gelaufen:**

- **Variants-Pflicht 10× erfüllt vor dem ersten Code.** Zehn Architektur-Varianten plus eine Drive-by-Frage (Active-Project-Persistenz) wurden mit Effort-Tabelle + Empfehlung vor dem ersten File-Edit geliefert. User hat alle 10 Empfehlungen direkt übernommen — null Mid-Sprint-Umentscheidungen aus Variant-Sicht. Die Memory-Konvention „Daily-Driver-Variante als Empfehlung" passte 10× zu „Variante A".
- **Driver-Injection-Pattern aus Sprint 1-4 trägt nahtlos weiter.** `MessageRepository`, `UsageRepository`, `JsonlOffsetRepository` mit Sqlite- + InMemory-Driver; `JsonlReadDriver` für den Parser. Aggregations-, Parser- und State-Detection-Tests fahren ohne echtes Filesystem, ohne SQLite, ohne chokidar. Die Sprint-1-better-sqlite3-ABI-Schuld trifft Sprint-5-Tests gar nicht erst.
- **Pure-Logik-Trennung an mehreren Stellen.** `parseJsonlSegment` (Pure-NDJSON-Logik), `resolveBarFilter` (SQL-LIKE → Regex-Mapping), `percentileP90` (Pure-Math), `detectActivityState` (Pure-Klassifikation), `encodeCwd` / `encodedCwdFromJsonlPath` (Pure-Path-Helper). Alle gegen synthetische Strings testbar, kein Mock-Aufwand.
- **DB-Direktinspektion via Python beim Bug-Hunting.** Beim ersten Smoke-Test war unklar, ob die Daten schon in der DB sind oder erst dort verloren gehen — `inspect-db.py` (sqlite3 builtin in Python 3.12) hat in 30 Sekunden gezeigt, dass 26 messages mit korrekten Tokens da waren, der Renderer aber 0 anzeigte. Damit war der Bug-Pfad sofort eingegrenzt (UI-Listener, nicht DB/Watcher).
- **Architektur-Aggregations-Flow zahlt sich aus.** Hybrid-Push (Per-Session sofort, global 500 ms debounced) ist schon in Architektur 4 gezeichnet — Implementierung war 1:1 die Spec, kein Eigen-Erfinden. P90-Window mit Fallback bei <24 Buckets verhinderte gleich beim ersten Lauf, dass die Bars unsinnige Werte aus zu wenig Daten zeigen.

**Gebremst durch:**

- **chokidar v5 hat den Glob-Support entfernt — Mid-Sprint-Discovery.** Mein erster Wurf war `watchPath + '**/*.jsonl'` als String-Pattern (chokidar v3-Konvention). Beim ersten Smoke-Test gab es null `[jsonl-watcher]`-Log-Einträge — der Pfad wurde wörtlich interpretiert, kein Watch hat begonnen. ~15 Minuten Debug nach dem User-Screenshot („alle Bars 0"), dann Pivot auf `ignored`-Predicate-Pattern. Lehre: bei Library-Versionen der Major-Sprung-Klasse vorher Release-Notes lesen, nicht von der Sprint-2/3-Erinnerung an alte API ausgehen.
- **TakumiDeck-Session-UUID ≠ JSONL-Filename-UUID.** Architektur 4 hatte den Pact „sessions.id matched zu Claude Codes session-uuid" angenommen — claude-code vergibt aber seine eigene UUID intern, kein `--session-id`-Flag. Beim zweiten Smoke-Test fiel sofort auf, dass alle JSONLs als „extern" markiert wurden. Mid-Sprint-Pivot auf encodeCwd-Match (~25 Minuten Implementation + Tests). Lehre: der Architektur-Pact hat eine ungeprüfte Annahme über externe Tools getragen — vor Sprint-Start zumindest *eine* JSONL-Datei manuell anschauen und das Schema verifizieren.
- **Sprint-2-`pty:create → DEFAULT_PROJECT_ID`-Lifeline schwelte unbemerkt.** Sprint 4 hatte den Renderer (Tabs, Sidebar, Filter) per-Projekt umgebaut, aber den Main-Handler nicht mit-fixed — der Filter dort lief gegen den Renderer-Tab-State, nicht gegen die DB. Sprint 5 räumt mit `messages.project_id` aus der DB → Bug fiel erst dort auf. Plus Sprint-4-Remap-Pass musste erweitert werden, um `messages.project_id` mit-zu-ziehen, sonst hängen Per-Projekt-Aggregate weiter am alten Bucket. ~10 Minuten Diagnose nach DB-Inspect.
- **StrictMode-Listener-Guard-Falle.** Memory-Konvention sagt „useRef-Guard für Renderer-useEffect mit Server-Side-Effect-IPC" — ich habe sie defensiv auch beim `usage:update`-Listener gesetzt, der read-only ist. StrictMode mountet zweimal mit Cleanup dazwischen → Mount 1 register, Cleanup unsubscribe, Mount 2 GUARD blockt re-register → Listener für immer tot. ~5 Minuten Diagnose nach User-Screenshot („Werte updaten nur beim Restart, nicht on the fly"). Lehre: Memory-Konvention um die Negation erweitert (siehe „Für nächste Season").

**Für nächste Season:**

- **StrictMode-Side-Effect-Guard nur für Server-Mutationen, NICHT für Listener-Setup.** Memory-Konvention war zu pauschal — Guards um `addEventListener`-Pattern verhindern das Re-Subscribe nach StrictMode-Cleanup, was zu silent-dead Listeners führt. Der Memory-Eintrag wurde dahingehend präzisiert. Faustregel: wenn der useEffect ein `unsubscribe()` als Cleanup zurückgibt, ist KEIN useRef-Guard nötig — der Effect ist von Natur aus idempotent.
- **Sprint 6 (Verlauf-Panel) räumt eventuell die `cache_creation/cache_read`-Schuld auf.** Aktuell summiert in `tokens_in`. Wenn das Verlauf-Panel Cache-Hits anzeigen soll, lohnt sich Migration `0003` mit getrennten Spalten plus Watcher-Update plus Backfill (Offsets reset → einmaliger Re-Scan beim Start). Siehe TECH_SCHULDEN.md.
- **Modell-Limits auf realistische 200 k anpassen.** Sprint-8-Settings-Dialog ist der natürliche Slot, oder Drive-by im nächsten Sprint, der `defaults.ts` ohnehin anfasst. Optional ein Per-Modell-`extended_context: true`-Flag für die 1-M-Beta. TECH_SCHULDEN.md hat den Eintrag.

---

## Season 4 — Workspace

**Ziel:** Sprint-4-Workspace-Kern: Workspace-Scanner (rekursiv, max-depth 5, Stop bei `CLAUDE.md` / `.git`), CLAUDE.md-Parser mit zod-validiertem `workbench`-Frontmatter, Project-Sidebar (240 px) mit Active-Highlight + Add/Refresh-Buttons, Per-Projekt-Tab-Filter, einmalige `cwd`-Prefix-Migration der Sprint-2/3-Default-Sessions auf echte Projekte. Ausdrücklich **kein** Live-Watcher (Phase 2), **kein** Per-Projekt-Modell-Hook (Sprint 5), **kein** Verlauf-Panel (Sprint 6), **keine** neue Schema-Migration `0002`.

**Ergebnis:** Alle drei Feature-Blöcke ✅. Workspace-Scanner mit Driver-Injection (FsLikeDriver), CLAUDE.md-Parser über `gray-matter` + `ClaudeMdFrontmatterSchema`, LeftSidebar mit Legacy-Bucket-Logik, TabContainer mit projekt-scoped Filter und projekt-scopierter Tab-Navigation. Mid-Sprint-Erweiterung: `session_count` als LEFT-JOIN-Aggregat im `projects`-Listing (war nötig für die Legacy-Bucket-Sichtbarkeit, die initial nur an Live-Tabs hing). Tests: 147 grün insgesamt (56 neue, davon 8 Scanner, 9 Parser, 13 Repo + 2 für `session_count`, 3 UI-Store, 22 Sessions-Store mit erweitertem Projekt-Filter; 91 aus Sprint 1–3 unverändert). Suite-Lauf ~630 ms — komfortabel unter der Schmerzgrenze.

**Gut gelaufen:**

- **Variants-Pflicht 6× erfüllt vor dem ersten Code.** Fünf Architektur-Variants (Scan-Strategie, Parser-Library, Default-Migration, Tab-Filter, Sidebar-State-Lokation) plus eine Scope-Variant (Per-Projekt-Modell jetzt vs. Sprint 5) wurden mit Effort-Tabellen + Empfehlung vor dem ersten File-Edit geliefert. Der User hat alle sechs Empfehlungen direkt übernommen — keine Mid-Sprint-Umentscheidungen. Die Memory-Convention „Daily-Driver-Variante als Empfehlung" passt für UX-Entscheidungen, war hier aber technisch (Async/Sync, Library-Wahl etc.) — die Empfehlung „A" deckt sich trotzdem fast immer mit dem konvenienteren Pfad.
- **Driver-Injection-Pattern aus Sprint 1/2/3 trägt weiter.** `FsLikeDriver` für den Scanner und `ProjectDbDriver` mit `InMemoryProjectDriver` für Repo-Tests sind 1:1 vom Migration-Runner, PtyManager und SessionRepository abgekupfert. Tests fahren ohne echtes Filesystem und ohne SQLite-Verbindung — die better-sqlite3-ABI-Schuld aus Sprint 1 trifft die Sprint-4-Tests gar nicht erst.
- **`gray-matter` sparte Edge-Case-Eigenbau.** Die CLAUDE.md des TakumiDeck-Projekts selbst enthält im Markdown-Body mehrere `---`-Trennlinien; ein selbst geschriebener YAML+Body-Splitter wäre genau dort gestolpert. Library-Pick zahlte sich sofort aus, ohne dass die Bundle-Größe relevant gewachsen wäre.
- **Sidebar-Setup nach `td-*`-Tokens trivial.** Die CSS-Variablen aus `tokens.css` (Claude-Design-Export, Sprint 1) decken Sidebar-Items, Badges, Empty-States und Hover-Verhalten vollständig ab — der Sidebar-CSS-Block ist ~100 Zeilen ohne neue Tokens.
- **Tabs-Filter konsistent zu Sprint-3-Tab-Persistenz.** Variante A (alle xterm dauerhaft mounted, CSS-Toggle) hat sich in Sprint 4 als natürlicher Filter-Layer fortgesetzt — keine widersprüchlichen Mount/Unmount-Pfade, kein Snapshot-Replay-Problem.

**Gebremst durch:**

- **`session_count`-Bedarf erst beim ersten Smoke-Test gesehen.** Die initiale Implementation hatte die Legacy-Bucket-Sichtbarkeit am Renderer-Tab-Count festgemacht — was logisch falsch ist, weil Sprint 4 keine historischen Sessions als Tabs lädt. Folge: Bucket wäre nie aufgetaucht, der ganze Migrations-Pfad „Auto-Match + Legacy-Bucket" wäre unsichtbar geblieben. Fix: LEFT-JOIN-Aggregat im SQL- und InMemory-Driver, neuer `session_count`-Field auf `ProjectRow`. ~20 Zeilen Code, 2 zusätzliche Tests, ~5 Min Diagnose nach User-Screenshot.
- **`cwd`-Mismatch beim Sprint-2/3-Remap.** Sprint 2/3 hat den `cwd` aus `settings.workspace_path` (= Parent-Ordner aller Projekte, z.B. `D:\Projekte`) gespawnt — der `cwd`-Prefix-Match findet keinen Match auf einen echten Project-Pfad, weil der Workspace *oberhalb* der Projekte liegt. Folge: alle 19 Sprint-2/3-Sessions blieben im Legacy-Bucket. Architektur-Variante A („Auto-Match + Legacy-Bucket") deckt das datenverlust-frei ab, aber das Briefing hatte den cwd-Mismatch nicht antizipiert — wäre Sprint 4 strikt zur Sprint-2/3-Logik kompatibel gewesen, wären die Sessions remapbar gewesen. Lehre: für Neusessions ab Sprint 4 ist `cwd = activeProject.path` (gefixt im NewSession-Modal-Pfad), für Altlasten greift Sprint 6 (Verlauf-Panel). Beides in TECH_SCHULDEN.md festgehalten.
- **Empty-State-Cosmetic mit DB-Rohnamen.** Beim Klick auf den Legacy-Bucket zeigt der TabContainer-Empty-State *„Keine Sessions in `__default__`."* — die Sidebar daneben rendert denselben Eintrag korrekt als „Sprint-2/3-Legacy". Zwei separate Code-Pfade, der Sidebar hat eine Sonderbehandlung, der TabContainer nicht. Fix wäre ein Helper, ist aber rein kosmetisch. Habe ich ohne den Fix in TECH_SCHULDEN.md verschoben, weil der User die Trigger-Phrase direkt nach „Option A wählen" gefolgt hat — kein Cosmetic-Slot dazwischen.

**Für nächste Season:**

- **Sprint 5 nimmt Per-Projekt-Modell aus CLAUDE.md mit.** Frage 6 (B = verschieben) hat den Hook absichtlich auf Sprint 5 gelegt — Sprint 5 fasst ohnehin die Modell-Logik fürs Token-Dashboard an und kann dort den `default_model` aus `activeProject.frontmatter.workbench.default_model` mit Fallback auf `settings.default_model` einbauen. Die Parser-Infrastruktur ist da, der IPC-Channel `project:read-claude-md` liefert das Datum.
- **Cwd-Prefix-Match war pragmatisch, nicht strict.** Wenn der User in Phase 2 anfängt, Sub-Ordner als eigene Projects zu adden (z.B. `Monorepo/packages/foo` als eigenes Projekt neben `Monorepo`), würde der jetzige Prefix-Match das innere Projekt bevorzugen, falls es alphabetisch zuerst kommt — nicht das tieferes-Projekt-gewinnt-Pattern. Tests dokumentieren das Verhalten explizit. Falls es jemals zum Problem wird: in der Match-Logik nach `path.length` desc sortieren (längster Match gewinnt). Für MVP nicht nötig.
- **`displayProjectName(p)`-Helper bei nächstem Renderer-Touch mitnehmen.** Empty-State-Cosmetic in TECH_SCHULDEN.md — ~5-Zeilen-Fix, der bei jedem Sprint-5-Modal/Panel-Touch nebenher mitgehen kann, ohne eigenen Slot zu brauchen.
- **Initial-Active-Project-Auswahl ist heuristisch.** LeftSidebar wählt beim Mount das erste *nicht-Legacy*-Projekt als aktiv — ohne Persistenz der letzten Auswahl. Sprint 5+ könnte das in `useUiStore` über `localStorage` oder `settings.json` persistieren, damit der User nach App-Restart wieder beim letzten Projekt landet. Kleiner Komfort, kein Blocker.

---

## Season 3 — Multi-Session

**Ziel:** Sprint-3-Multi-Session-Kern: Tab-System mit dauerhaft mounted xterm-Instanzen, vollständiger Session-Lifecycle (running/completed/archived/interrupted/error), Resume-Funktion mit gespeichertem Modell, NewSessionModal mit Type- und Modell-Picker, Notizen pro Session mit Debounce-Auto-Save, App-Quit ohne Status-Lärm. Ausdrücklich **kein** State-Detection (Sprint 5), **kein** Verlauf-Panel (Sprint 6), **kein** Settings-UI (Sprint 8).

**Ergebnis:** Alle sechs Feature-Blöcke ✅. Tab-System mit Pillen + +-Button + Status-Dot + Resume-Button + ×, Ctrl+Tab/Ctrl+Shift+Tab funktional, NewSessionModal über Ctrl+N und +-Klick. Lifecycle-State-Machine zentral mit 26 Truth-Table-Tests. Notes-Footer mit pure-Logik-Util `createNotesSaver` (10 Tests, fakeTimers). App-Quit-Race behoben — Sprint-2-Default-Transition zu `completed` ist im Shutdown-Pfad abgeschaltet. Tests: 91 grün insgesamt (52 neue, 39 aus Sprint 1-2 unverändert). Pre-Commit-Hook (Husky) ruft typecheck + Vitest, Suite-Lauf ~500 ms.

**Gut gelaufen:**

- **Variants-Pflicht zahlt sich erneut aus.** Fünf Vorab-Variants (Tab-Persistenz, Lifecycle, Resume-Modell, Notes-Save, App-Quit-Race) plus eine Workflow-Variante (Husky-Hook-Tiefe) wurden alle mit klarer Empfehlung vor dem ersten Code geliefert. Der User hat die Empfehlungen 4× direkt übernommen, einmal mit Sprint-8-Verschiebung (Variante C App-Quit-Race) — keine Mid-Sprint-Umentscheidungen nötig.
- **Lifecycle-State-Machine als zentrale Stelle macht Tests trivial.** Eine `ALLOWED`-Map als 2D-Konstante + ein einziger `transition()`-Pfad → 26 Truth-Table-Tests in einer Datei. Jeder erlaubte und disallowed Übergang ist explizit fixiert; Sprint 5 wird die Erweiterung um waiting/idle als bewusste Map-Änderung machen müssen, nicht versehentlich.
- **Pure-Logik-Splits entkoppeln Tests von React + IPC.** `createNotesSaver` ist ein 60-Zeilen-Util, das mit `vi.useFakeTimers()` deterministisch testbar ist — kein React-Renderer, kein Mock-IPC, kein DOM. Identisches Muster wie Sprint-1-Migration-Driver und Sprint-2-PtyManager: Driver-Injection über Konstruktor-Argument.
- **Husky-Pre-Commit-Hook in 10 Minuten.** typecheck + Tests grün-Pflicht ist jetzt von einer Maschine durchgesetzt, nicht mehr nur in CLAUDE.md geschrieben. Working Rule 6 hat Zähne.

**Gebremst durch:**

- **StrictMode-Double-Spawn-Falle erneut, dieses Mal beim pty:create.** Sprint-2-Hinweis warnte vor `crypto.randomUUID()` im Effect — der Fix dort war ein `useRef`-Guard. In Sprint 3 wurde die UUID-Generation korrekt in den Zustand-Store verlagert, aber der Side-Effect (IPC-Spawn) blieb im Effect *ohne* Guard. Folge: erster Mount spawnt PTY ✅, StrictMode-Cleanup, zweiter Mount feuert pty:create erneut → UNIQUE-Constraint auf `sessions.id`. Sichtbar erst beim Smoke-Test, behoben mit ~5 Zeilen `useRef`-Guard. Kostenpunkt: ~10 Minuten Diagnose + Fix nach erstem Smoke-Test.
- **TypeScript-noUncheckedIndexedAccess-Effekte beim Test-Schreiben.** `tabs[0]?.notesDraft` und `tabs[(idx + 1) % tabs.length]?.sessionId` mussten in vier Stellen mit `?.` annotiert werden, weil der Compiler `undefined` an Array-Zugriffen vermutet, obwohl die Logik den Index garantiert hat. Schnell fixbar, aber leichte Reibung beim Tempo.

**Für nächste Season:**

- **Sprint 4 (Workspace) muss das Default-Project erkennen.** TECH_SCHULDEN-Eintrag „Default-Project als FK-Lifeline" aus Sprint 2 ist immer noch offen — Sprint 4 ist der designierte Ort, um den `__default__`-Eintrag (stable UUID `00000000-...0001`) zu identifizieren und die hängenden Sessions entweder dem zur cwd passenden gescannten Project zuzuweisen oder als Legacy-Bucket zu markieren. Lifecycle-State-Machine bleibt dabei unangetastet.
- **Side-Effects in useEffect immer mit Ref-Guard.** Die Sprint-3-Falle ist eine Verallgemeinerung der Sprint-2-Falle: nicht nur UUID-Generation, sondern *jede* IPC-Operation mit Server-Side-Effekt (`pty:create`, später `fs:write`, `git:commit`, etc.) braucht im Renderer einen `useRef`-Guard, weil StrictMode den Effect zweimal feuert. Sprint 4 wird Workspace-Scans triggern (potentiell IPC mit Side-Effects auf der DB) — dort gleich von Anfang an mit Ref-Guard arbeiten.
- **CLAUDE.md-Parser für Sprint 4 robust gegen fehlende `workbench`-Section.** `js-yaml` plus zod-Schema (analog `AppSettingsSchema`) — wenn die Section fehlt oder das Schema nicht passt, klare Fehlermeldung statt undefined-Cascading. Convention aus ENTSCHEIDUNGEN.md („zod-Validation an allen IPC-Boundaries ab Tag 1") gilt sinngemäß auch für File-Boundaries.

---

## Season 2 — Single-Tab-PTY

**Ziel:** Sprint-2-Sessions-Kern: `@homebridge/node-pty-prebuilt-multiarch` integrieren, PTY-Manager mit 16ms-Buffer-Flush, Session-DB-Repository mit Create/Update, xterm.js mit Canvas-Renderer + Standard-Addons, Single-Tab-TerminalPane im Renderer. Ausdrücklich **kein** Multi-Tab, kein Lifecycle-State-Modell, keine State-Detection — alles Sprint 3+.

**Ergebnis:** PTY-Spawn ✅, xterm.js-Terminal ✅, Session-Lifecycle 🟡 (running→completed automatisch, alles Weitere Sprint 3). End-to-end läuft `claude` als ConPTY-Subprozess, der Output landet live im xterm-Canvas, Sessions liegen in der DB. Tests: 39 grün (10 PtyManager + 9 Session-Repo neu, 20 aus Sprint 1 unverändert).

**Gut gelaufen:**

- Variants-Pflicht hat sich erneut ausgezahlt: drei Vorab-Variants (PtyManager-Lifecycle, Binary-Auflösung, Throttle-Strategie) wurden mit jeweils A vor dem ersten Code beantwortet — und die spätere @homebridge-Sackgasse wurde sofort als vierte Variant-Frage eskaliert statt heimlich gelöst.
- Driver-Injection-Pattern aus Sprint 1 ließ sich 1:1 für PtyManager und SessionRepository wiederverwenden. Tests laufen ohne native Module.
- `uncaughtException`-Sicherheitsnetz + Pre-Checks (Binary, cwd) haben den Renderer-Test-Loop trotz mehrerer ConPTY-Fehler (Code 2, Code 267) lauffähig gehalten — kein Restart-Roulette.
- Memory-Update direkt nach dem PTY-Backend-Wechsel: zukünftige Sessions wissen sofort, dass `electron-rebuild` für PTY nicht mehr nötig ist.

**Gebremst durch:**

- **@homebridge-Fork hatte keine Win32-Prebuilts für Electron 33.** Höchste verfügbare ABI war v121 (Electron 30). Wechsel auf `@lydell/node-pty` (NAPI, Plattform-Subpakete) hat ~30 Minuten Variants-Klärung + Install-Iterationen gekostet. Memory-Eintrag aus Sprint 1 (`electron-rebuild -f -w …`) führt direkt in einen Source-Build-Fehler — `-f` überspringt Prebuilt-Download und triggert node-gyp.
- **xterm.js v6 hat den Canvas-Renderer entfernt**, addon-canvas 0.7 ist v5-only. Nicht in der Architektur erwähnt; aufgefallen erst beim Peer-Dependency-Konflikt während `npm install`. Pin auf v5.5 als saubere Lösung.
- **Vite-Renderer-Config aus Sprint 1 hatte `root` nicht gesetzt.** `http://localhost:5173/` lieferte 404, die „Foundation-Smoke-View" hat in Wirklichkeit nie gerendert — Sprint 1 hatte das fälschlich als ✅ gemeldet. Aufgedeckt durch das schwarze Sprint-2-Fenster, behoben mit `root: src/renderer` + absolutem `outDir`.
- **ConPTY-Fehler kommen aus einem Worker-Thread**, normales try/catch fängt sie nicht. Erst der zweite Iterationsschritt (Pre-Check + uncaughtException-Handler) hat sie zähmbar gemacht.

**Für nächste Season:**

- Bevor ein neues npm-CLI gespawnt wird (Sprint 3 wird `claude --resume <id>` einführen), den `resolveExecutable`-Pre-Check auch für CWD und Argumente erweitern, falls Resume bei nicht-existenter Session-UUID still failed.
- `workspace_path`-Validation gehört spätestens beim Settings-Dialog (Sprint 8), aber wenn Sprint 3 / Sprint 4 sowieso Per-Session-cwd einführen, dort gleich einen Existence-Check pro Session-Spawn vorsehen.
- Sprint 3 muss Multi-Spawn unter React-StrictMode sauber lösen — der initRef-Guard im TerminalPane reicht nur für Single-Tab. Bei Tabs nicht mit `crypto.randomUUID()` im Effect arbeiten, sondern Session-IDs aus dem Store nehmen.

---

## Season 1 — Foundation-Skelett

**Ziel:** Sprint-1-Foundation aufsetzen: Electron-Skelett, IPC, SQLite, Settings-System, tokens.css aus Claude-Design-Export.

**Ergebnis:** Alle vier Foundation-Features ✅. Die App startet via `start-dev.bat`, legt `%APPDATA%\TakumiDeck-dev\` mit kompletter Datenstruktur an und zeigt im Smoke-View Version + Default-Settings über die typed IPC-Bridge.

**Gut gelaufen:**

- Variants-Pflicht vor dem Code: vier offene Architektur-Fragen (Settings-Backend, zod-Timing, Logging, Test-Setup) wurden vor dem ersten File-Schreiben mit A/B/C beantwortet — keine Mid-Sprint-Umentscheidungen nötig.
- Fake-Driver-Pattern für den Migration-Runner: ermöglicht Vitest-Läufe unabhängig vom better-sqlite3-ABI-State, der nach `electron-rebuild` ständig kippt.
- Architektur-Doku als Single-Source-of-Truth: SQLite-Schema, Settings-Defaults und IPC-Channels waren zu 100 % vorgegeben, kein Erfinden nebenbei.

**Gebremst durch:**

- `npm install` schlägt mit Node 24 + fehlendem Visual Studio C++ fehl (better-sqlite3 versucht Source-Build). Workaround: `npm install --ignore-scripts` plus manuell `node node_modules/electron/install.js` plus `npx electron-rebuild`. Hat ~20 Minuten Debug gekostet.
- Vite-Forge-Plugin emittet Output-Files nach Entry-Filename. Beide Entries hießen `index.ts` → Output-Kollision in `.vite/build/`. Nach Umbenennen auf `main.ts` / `preload.ts` sauber.
- Electron-Forge im Bash-Background-Spawn detached die Electron-Stderr — Crashes vor `whenReady()` waren unsichtbar. Workaround: temporärer File-Logger via `os.tmpdir()`. In einer echten Terminal-Session unkritisch.

**Für nächste Season:**

- Bei jedem neuen Native-Modul (z.B. `@homebridge/node-pty-prebuilt-multiarch` in Sprint 2) sofort `npx electron-rebuild -f -w <pkg>` einplanen, nicht erst wenn’s knallt.
- IPC-Channels für PTY und Sessions konsequent mit zod-Schema einführen — die Convention aus Sprint 1 nicht aufweichen.
