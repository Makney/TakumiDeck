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
