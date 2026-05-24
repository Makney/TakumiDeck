# Design-Entscheidungen

Dieses Dokument hält die **Warum-Entscheidungen** fest, nicht die Was-Entscheidungen. Wenn jemand (auch das zukünftige Ich in einer neuen Session) fragt *„warum haben wir damals nicht einfach …?"*, dann steht es hier.

## Wann kommt ein Eintrag hier rein?

- Scope- oder Architektur-Frage mit **mehreren sinnvollen Lösungen**.
- Entscheidung für eine Variante, die **später hinterfragt werden könnte**.
- Bewusst offen gelassene Baustellen, damit sie nicht als „vergessen" wirken.

**Nicht** hier rein: triviale Umsetzungsdetails, Bugfixes ohne Design-Anteil, kurzfristige Präferenzen.

## Format pro Eintrag

- Eine `##`-Überschrift mit prägnantem Titel.
- Abschnitte in dieser Reihenfolge:
  - **Entscheidung:** der gewählte Weg, 1–2 Sätze.
  - **Varianten:** A / B / C mit Kernmerkmal, markiert welche gewählt wurde.
  - **Grund:** *warum* A gewinnt — oder warum B/C disqualifiziert sind.
  - **Konsequenz:** was das für zukünftige Arbeit bedeutet (kein Boilerplate — nur wenn relevant).
  - Optional **Implementierungsdetail:** wenn die Umsetzung selbst eine Wahl war (z.B. Whitelist statt Blacklist).

Neue Einträge wandern **oben** an (neuster zuerst). Keine Daten in den Titel — der Titel ist thematisch, das Datum steckt implizit in der Git-History.

---

## Season-30-UI-Overhaul (Block 1): symmetrische Sidebars + Single-Source-Header-Band

**Entscheidung:** Drei Achsen-Entscheidungen fuer den ersten Block der UI-Symmetrierung, in einem Eintrag gebuendelt, weil sie sich gegenseitig stuetzen. (1) Sidebars beidseitig **300 px** breit, statt der ungleichen 240/232 oder dem initial vorgeschlagenen 400/400. (2) Einheitliche Bandhoehe aller Top-Bars ueber **`--td-section-head-h: 36px`** als Single-Source-Token, statt pro Klasse individuelle `padding`-Stacks zu pflegen. (3) Den Sprint-7-`border-left` an `.td-plan-pane` **ersatzlos entfernen**, weil das Grid-Gap die Trennlinie ohnehin liefert.

**Varianten (Sidebar-Breite):**

- **A** 300 px beidseitig — symmetrisch ums Mittel, fuer Files-Stack komfortabler als 240 px, ohne den Mittel-Spalten zu viel Platz wegzunehmen. (Gewaehlt)
- **B** 400 px beidseitig — der Initial-Wunsch aus dem Variants-Brief; im Live-Test optisch zu wuchtig, Mittel-Spalten visuell zu schmal.
- **C** Asymmetrisch belassen (240/232) — wuerde die Wahrnehmung der Fenstermitte unaufgeloest lassen.

**Varianten (Bandhoehe-Mechanik):**

- **D** Single-Source-CSS-Variable `--td-section-head-h` in `tokens.css` plus Spiegel als `LAYOUT.SECTION_HEAD_HEIGHT` in `layout.ts`. Acht Header-Klassen lesen `var(...)`. (Gewaehlt)
- **E** Subgrid / Container-Queries fuer Auto-Aligning ohne fixe Hoehe. Theoretisch eleganter, aber riskant fuer den `.td-tab`-`bottom: -1px`-Overlap-Trick (Window-Frame-Tab-Optik aus Sprint 9), der mit Subgrid potentiell bricht.
- **F** Pro Klasse weiter individuelle `padding`-Stacks tunen, bis sie visuell gleich aussehen. Nicht skalierbar — der naechste Sprint mit einem neuen Header haette wieder dasselbe Problem.

**Varianten (`.td-plan-pane`-`border-left`):**

- **G** Border-Left ersatzlos entfernen, weil das Grid-Gap die Trennlinie liefert. (Gewaehlt)
- **H** Border-Left in den anderen Bottom-Pane (`.td-dash-pane`) spiegeln, damit beide gleich-versetzt sind. Wuerde die Doppellinie nur verdoppeln statt aufloesen.
- **I** Grid-Gap auf 2 px erhoehen, damit der Border-Left nicht doppelt zeichnet. Wuerde die anderen drei Trennlinien (Left-Sidebar↔Mid-Top, Mid-Top↔Right-Top, Right-Top↔Right-Stack) ebenfalls verdoppeln — Nebenwirkung trifft das ganze Layout fuer ein lokales Problem.

**Grund:** 300 px (A) ist der gemessene Kompromiss aus zwei User-Iterationen — 240 zu eng (Tabs trunkieren, Files-Filter wrappen), 400 zu wuchtig (Mittel-Spalten verlieren Lesbarkeit). Der `--td-section-head-h`-Token (D) macht aus einem 8-Klassen-Refactor eine 1-Wert-Aenderung fuer die naechste Anpassung; die acht Klassen lesen denselben Wert, `box-sizing: border-box` sorgt dafuer, dass die 1-px-Bottom-Border die Hoehe nicht ueberlaeuft. Der `border-left`-Removal (G) ist die einzig saubere Aufloesung — der Border war seit dem Grid-Refactor in Sprint 7 tote Last und entstand vor der gap-Aera; in der Mischung aus uneinheitlichen Padding-Hoehen fiel er optisch nicht auf, jetzt mit Bandangleichung schon.

**Konsequenz:** Kuenftige Header-Aenderungen (z. B. Bandhoehe anpassen) treffen genau eine Stelle: `tokens.css` + `layout.ts`. Falls eine neue Pane einen Top-Bar braucht: dieselbe Konvention anwenden (`height: var(--td-section-head-h); padding: 0 14px; box-sizing: border-box; align-items: center`). Sidebar-Breiten haben jetzt eine gemeinsame Konstante (`LAYOUT.COL_LEFT_WIDTH == LAYOUT.COL_RIGHT_WIDTH`); wenn die irgendwann auseinanderlaufen sollen (z. B. Files-Stack breiter als LeftSidebar), bewusst zwei Werte einfuehren statt unbeabsichtigt zu driften.

**Implementierungsdetail:** Der Spiegel von `--td-section-head-h` als `LAYOUT.SECTION_HEAD_HEIGHT` ist redundant — heute liest keine TypeScript-Komponente diesen Wert direkt. Aber das Pattern fuer `LAYOUT.COL_LEFT_WIDTH` / `COL_RIGHT_WIDTH` ist etabliert (mehrere TS-Komponenten konsumieren die LAYOUT-Konstanten), und Single-Source-of-Truth zwischen CSS und TS lebt traditionell so. Falls in Zukunft eine TS-Komponente die Header-Hoehe braucht, sitzt der Wert schon da.

---

## Right-Pane-Polish (Season 29.5): localStorage statt Settings, Toggle-Pillen, Watcher-Reuse

**Entscheidung:** Vier Achsen-Entscheidungen fuer den Right-Pane-Polish, bewusst in einem Eintrag gebuendelt, weil sie sich gegenseitig stuetzen. (1) Filter-UI als Toggle-Pillen-Reihe unter dem Suchfeld, statt Dropdown-Popover oder Smart-Suchfeld. (2) Persistenz der Filter-Wahl in `localStorage('td.fileBrowserFilter')`, statt im `AppSettings`-Schema. (3) Sensitive-Warning-Gate als eine Pflicht-Confirm-Checkbox, statt Per-File-Checkboxen. (4) Git-Status-Marker via Reuse des Season-29-`fs:changed`-Watcher-Pushs plus `git:status`-Pull, statt eigenem simple-git-Polling-Loop. Konflikt-Regel beim Marker: Editor-Dirty schlaegt Git-Status auf dem gleichen UI-Slot.

**Varianten (Filter-UI):**

- **A** Toggle-Pillen-Reihe unter dem Suchfeld mit kurzen Endungs-Labels, Multi-Select als OR, kombiniert mit Suchtext als AND. (Gewaehlt)
- **B** Filter-Icon mit Dropdown-Checkbox-Popover. Spart Platz im 232-px-Stack, aber versteckt die Aktion.
- **C** Smart-Suchfeld: `.ts` als Substring matched heute schon, Multi-Endung ist mit einem Textfeld aber nicht ausdrueckbar.

**Varianten (Persistenz):**

- **D** `localStorage('td.fileBrowserFilter')` mit defensivem `normalize` (Schrott → Defaults). Folgt der Repo-Konvention `td.heatmapWeeks` / `td.statsRange` fuer reinen UI-Memory-State. (Gewaehlt)
- **E** `AppSettings.file_browser_filter` mit Schema-Migration auf Version 3. Wuerde den Roadmap-Wortlaut „Persistiert in Settings" buchstaeblich erfuellen.

**Varianten (Sensitive-Gate):**

- **F** Eine Pflicht-Confirm-Checkbox „Ich habe diese Dateien geprueft" ueber dem Send-Button, Reset beim Modal-Re-Open. (Gewaehlt)
- **G** Per-File-Confirm-Checkboxen — jede sensitive Datei einzeln abhaken.
- **H** Send-Button-Label wechselt zu „⚠ Trotzdem senden" als Soft-Warning, kein echtes Gate.

**Varianten (Status-Quelle):**

- **I** `git:status`-IPC ueber das `fs:changed`-Push-Event aus Season 29 reusen. (Gewaehlt)
- **J** Eigener simple-git-Polling-Loop im Main alle 2 s — wortwoertlich Roadmap, aber duplizierter Pfad zu `git:status`.
- **K** Renderer-`setInterval(git:status, 2s)` — gleiche Nachteile wie J plus Background-Tab-Drosselung.

**Grund (Filter-UI):** A ist im Daily-Use sichtbar entdeckbar und folgt dem `td-dash-tab`-Wortschatz aus der Stats-Pane — der User erkennt Multi-Select-Pillen wieder. B verlangt einen Klick mehr und einen versteckten State (welche Endungen sind aktiv?), C scheitert an der Multi-Endungs-Anforderung der Roadmap.

**Grund (Persistenz):** D nutzt die Tatsache, dass der Filter UX-Memory ist — „wo war ich zuletzt", kein Konfigurations-State. Der Repo hat dafuer ein etabliertes Pattern (`td.heatmapWeeks`, `td.statsRange`) und keinen Drift-Druck (das `td.`-Prefix isoliert sauber). E haette die Settings-Schema-Migrations-Pipeline fuer reinen UI-Erinnerungs-Wert angesteuert, plus Settings-Modal-Slot, plus IPC-Roundtrip pro Filter-Aenderung — Overengineering fuer den Use-Case. Der Roadmap-Wortlaut „persistiert in Settings" wird als „bleibt erhalten" gelesen, nicht buchstaeblich.

**Grund (Sensitive-Gate):** F ist die richtige Friktions-Stufe — eine Checkbox, ein Klick zur Bestaetigung. Sensitive-Listen sind typisch 1–2 Files, Per-File-Checkboxen (G) waeren bei jedem zweiten Commit-Trigger sieben Klicks Aufwand fuer Null Mehrwert (User liest die Liste sowieso vor dem Haekchen). H ist kein Gate, sondern bloss kosmetisches Re-Labeling — der bestehende Phase-1-Pfad „Soft-Warning + Send geht durch" ist genau das, was die Roadmap explizit nicht mehr will.

**Grund (Status-Quelle):** I nutzt die Tatsache, dass `ProjectFilesWatcher` (Season 29) bereits chokidar auf den Projekt-Root abonniert und Push-Events liefert — kein zweiter Watcher noetig, kein Polling-Loop, der bei Idle umsonst pollt. `git:status` als Pull-Pfad existiert seit Sprint 7 und liefert genau die richtigen Statuscodes. J haette einen zweiten Pfad geschaffen, der das gleiche IPC anders ausloest — duplizierter Code mit langsamerer Reaktion (Push vs. 2-s-Tick). K hat zusaetzlich das Background-Tab-Throttling-Problem.

**Konsequenz:** Vier neue Pure-Helper plus ein Component-Refactor: `treeFilter.filterTree` bekommt einen optionalen `ReadonlySet<string>`-Parameter (Default leer = Phase-1-Verhalten), `fileBrowserPrefs.ts` (neu) kapselt localStorage-Round-Trip + `TOGGLEABLE_EXTENSIONS`-Konstante, `fileMarker.ts` (neu) liefert die `pickFileMarker(isDirty, gitStatus)`-Funktion mit fixer Konflikt-Regel, `preCommitGate.ts` (neu) extrahiert die `canSendCommitTrigger`-Pure-Funktion aus dem Modal-Body. Marker-Konflikt: Editor-Dirty wird im gleichen UI-Slot dargestellt wie Git-Modified — kein Doppel-Marker — weil der 232-px-Stack visuell sonst laut wird; die Dirty-Information ist aktueller (lokale, ungespeicherte Edits) und schlaegt deshalb. Sobald der User speichert, ist die Dirty-Flag weg und der Git-Marker uebernimmt nahtlos.

**Implementierungsdetail:** `TOGGLEABLE_EXTENSIONS` ist eine curated Liste (`md`/`ts`/`tsx`/`json`/`css`/`html`/`py`/`yml`) — bewusst nicht exhaustiv, sondern auf den TakumiDeck-Stack ausgerichtet. Der User kann ueber das Suchfeld trotzdem jede beliebige Endung matchen (`.rs`, `.toml`), die Pillen sind der Schnellzugriff, nicht das Limit. Endungs-Filter wirkt auch bei Dir-Self-Match strikt: ein Such-Query, das den Ordner-Namen matched, zieht NICHT versehentlich alle Endungs-fremden Children mit — sonst wuerde ein Endungs-Toggle durch jeden Such-Treffer ausgehebelt. `pickFileMarker` mappt sieben Git-Status-Werte auf vier Farb-Buckets (`dirty`/`added`/`deleted`/`info`) — Renames/Copies/Unmerged landen alle im neutralen `info`-Bucket, weil sie im Daily-Use selten sind und keine eigene Farbtonung rechtfertigen. `fs:changed`-Subscription bumpt einen `gitRefreshKey`-State (Counter), der den `useEffect`-Re-Fetch-Block triggert — gleiches Pattern wie der Diff-Viewer-Auto-Refresh in `EditorPane.tsx` aus Season 29. `sensitiveConfirmed`-State ist `useState` ohne Persistenz — beim Modal-Schliessen + Neu-Oeffnen ist die Quittung automatisch wieder weg, was die Sicherheits-Friktion bewahrt (kein „ich hab das letzte Mal schon abgenickt, das gilt jetzt fuer immer").

---

## App-Icon und Brand-Logo: Logo ersetzt Kanji, Build-Skript in zentralem Scripts-Ordner

**Entscheidung:** Zwei zusammenhaengende Entscheidungen in einem Eintrag. (1) Das Brand-Element oben links in der Titlebar wechselt vom Kanji `匠` auf ein eigenes Logo-Asset (`src/renderer/assets/logo.png`, 128 px). Die Wortmarke `**Takumi**Deck` und die Versions-Pille bleiben unveraendert daneben. (2) Der ICO-Generator (`build-icon.py`) lebt nicht projekt-lokal unter `scripts/` im TakumiDeck-Repo, sondern in einem neuen projekt-uebergreifenden Ordner `D:\Projekte\Scripts\` parallel zu den eigentlichen Projekt-Repos.

**Varianten (Brand-Element):**

- **A** Logo ersetzt Kanji — ein Brand-Element links, konsistent mit Taskleiste/Setup.exe/Exe. (Gewaehlt)
- **B** Logo zusaetzlich vor dem Kanji — `[Logo] 匠 TakumiDeck`. Doppel-Branding, mehr visuelles Gewicht.
- **C** Logo ersetzt Kanji UND Wortmarke — nur das Logo links, kein „TakumiDeck"-Text mehr. Radikalster Cut, gewinnt am meisten Platz fuer die Meta-Sektion.

**Varianten (Build-Skript-Ablage):**

- **D** Zentraler Scripts-Ordner `D:\Projekte\Scripts\` mit projekt-agnostischem Skript (CLI-Args fuer Source + Target). (Gewaehlt)
- **E** Projekt-lokal unter `D:\Projekte\TakumiDeck\scripts\build-icon.py`, Pfad zur Quelle hardcoded analog zur TanaLib-Vorlage.
- **F** Projekt-lokal, aber zusaetzlich Quell-PNGs ins Repo (`build/icon-src/*.png`) und `.ico` generiert per CI-Hook beim Build.

**Grund (Brand-Element):** A folgt dem etablierten Brand-Konzept aus Taskleiste und Setup.exe — dort sieht der User das Logo, in der Titlebar bisher nur den Kanji-Surrogat. Konsistenz ueber die Surfaces hinweg ist wichtiger als die Beibehaltung des Sprint-8-Kanji-Anchors. B haette einen redundanten Doppel-Brand-Spot erzeugt, ohne Information dazuzuholen — und der Kanji wuerde optisch mit dem Logo um Aufmerksamkeit konkurrieren. C verliert den Wortmarken-Text, der bei einer Multi-Tool-Taskbar fuer schnelle Identifikation hilft („TakumiDeck" lesen geht schneller als „Logo erkennen" beim ersten Mal).

**Grund (Build-Skript-Ablage):** D nutzt den Fakt, dass `build-icon.py` ein wiederverwendbarer Util ist (Multi-Size-ICO-Erzeugung ist nicht TakumiDeck-spezifisch — TanaLib hatte das Skript schon einmal projekt-lokal, kuenftige Projekte koennten das auch brauchen). Der CLI-Args-Ansatz macht das Skript projekt-agnostisch, statt einen Quell-Pfad zu hardcoden. E haette die Dopplung aus TanaLib direkt nach TakumiDeck portiert und beim naechsten Projekt nochmal — ein typischer Drift-Pfad. F waere die maximal-reproduzierbare Variante (kein externer Quell-Pfad), aber kostet ~10 KB PNG-Quellen pro Projekt im Git und einen CI-Build-Step (Python im Forge-Pipeline) — Overkill, weil das Icon quasi nie regeneriert wird.

**Konsequenz:** Drei TakumiDeck-Integration-Punkte griffen einheitlich auf `build/icon.ico` zu: `packagerConfig.icon` (ohne Extension, electron-packager-Konvention), `MakerSquirrel.setupIcon` (mit Extension), `BrowserWindow({ icon })` (Dev/Prod-Switch ueber `app.isPackaged`). `build/icon.ico` ist zusaetzlich in `extraResource` enthalten, damit der Main-Prozess es im gepackten Build ueber `process.resourcesPath/icon.ico` findet — dasselbe Pattern wie fuer `app-update.yml` aus v0.3.1, kein neuer Konvention-Anker. Renderer-seitig ist `src/renderer/assets/logo.png` (die 128er-Quell-PNG) das Asset — Vite bundled das mit Hash. CSS-Klasse `.td-brand-logo` (24×24 px, `object-fit: contain`) ersetzt den `.td-kanji`-Block (Font-Glyph) — Layout-Drift Null, weil das Logo-Element optisch dieselbe Slot-Position einnimmt. Der zentrale Scripts-Ordner hat eine kleine README, die ihn als „projekt-agnostisch, Pfade nur per CLI-Arg" kennzeichnet — wenn TanaLib seinen lokalen `scripts/build_icon.py` irgendwann loswerden will, kann er ueber das zentrale Skript ersetzt werden (Naming-Pattern-Kompatibilitaet ist eingebaut: sowohl `16.png` als auch `16x16.png` werden akzeptiert). Pillow-Dependency lebt vorerst nur im TanaLib-venv (`D:\Projekte\TanaLib\venv\Scripts\python.exe`); kein dedizierter Scripts-venv noetig, solange das Re-Run-Volumen niedrig bleibt.

**Implementierungsdetail:** Logo-Asset ist die 128er-PNG (nicht die 64er) — entspricht ~2× der CSS-Display-Groesse, sieht auf HiDPI-Displays sauber aus. Die Quell-PNG-Datei `logo.png` ist physisch im Renderer-Asset-Ordner abgelegt und wird per Import gezogen, statt ueber einen Vite-Public-Pfad oder gleich aus `build/icon.ico` — der Renderer kann `.ico` nicht direkt zeigen, und `assets/logo.png` ist das Repo-Konvention-Pattern, das Vite hash-bundled. `<img alt="" aria-hidden>` weil die Wortmarke „TakumiDeck" daneben den Screenreader-Inhalt schon traegt. `forge.config.ts` `packagerConfig.icon` braucht **keine** Extension (`'./build/icon'` statt `'./build/icon.ico'`) — electron-packager waehlt die plattform-passende Endung selbst. `MakerSquirrel.setupIcon` braucht dagegen die Extension. `BrowserWindow({ icon })`-Pfad-Berechnung mit `app.isPackaged`-Switch, weil im Dev `__dirname` auf `.vite/build/` zeigt (Repo-Root via `../../build/`) und im Build auf den extraResource-Ordner (`process.resourcesPath/icon.ico`). Quell-PNGs leben nicht im Repo (Drift-Risiko dokumentiert in TECH_SCHULDEN als „Quell-PNGs extern auf dem Desktop"-Eintrag).

---

## Spawn-Tracking ins SessionTab-Schema heben (A)

**Entscheidung:** `needsSpawn: boolean` und `initialPrompt: string | null` leben als Pflichtfelder am `SessionTab`-Schema im zentralen Sessions-Store, statt als TabContainer-lokales State-Paar (`spawnedIds: Set<string>` + `initialPrompts: Map<string,string>`). `closeTab` raeumt beide Felder implizit mit, weil die ganze Tab-Row aus dem Store fliegt — kein expliziter Cleanup-Pfad mehr noetig. Damit ist `LeftSidebar.handleCloseTab` (das `×` in der „Aktive Sessions"-Pille links) und `LeftSidebar.handleConfirmRemove` (Projekt-Entfernen mit offenen Tabs) automatisch mitgehoert, ohne dass die Sidebar das TabContainer-State erreichen muesste.

**Varianten:**

- **A** Felder ins `SessionTab`-Schema heben (gewaehlt). Eine Source of Truth pro Tab; jeder Close-Pfad raeumt implizit mit. Die in v0.2.0 explizit als „cleanere Architektur" markierte Aufholpfad-Variante, jetzt eingeloest.
- **B** `closeTab(sessionId)` im Store ruft intern einen Spawn-Tracker-Slice auf — eigene Sub-Store-Sektion `spawnTracking` innerhalb des Sessions-Stores, `closeTab` cleart sie inline.
- **C** `LeftSidebar.handleCloseTab` feuert ein `CustomEvent` `td-tab-closed`, TabContainer hoert zu und ruft die beiden remove-Helper. Implizite Kopplung ueber Event-Bus.

**Grund:** A nutzt das schon existierende Tab-als-Wahrheits-Anker-Pattern; `setStatus`, `setNotesDraft`, `hasBell` etc. liegen alle als Felder am Tab. Spawn-Bedarf und Docs-Sync-Prompt gehoeren konzeptuell genauso zum Tab — sie sind Per-Tab-State, kein TabContainer-globaler State. Der Refactor folgt der Konvention, statt eine zweite. B haette eine kuenstliche Trennung zwischen „Tab-Daten" und „Spawn-Tracking" eingefuehrt, obwohl beide synchron sterben muessen (Tab geschlossen = Spawn-Bedarf weg). C nutzt ein Pattern, das im Repo noch nirgends etabliert ist — Event-Bus-Kopplung ist schwer zu testen, schwer im DevTools-Inspector nachvollziehbar, und der naechste neue Close-Pfad muss sich an die Konvention erinnern, das Event zu feuern. Dasselbe Pattern-Risiko wie der v0.2.1-Variante-A-Workaround, nur mit zusaetzlichem Indirection-Layer.

**Konsequenz:** Der v0.2.1-Pure-Helper-Pfad `src/renderer/components/spawnTrackingState.ts` und der zugehoerige Test fallen ersatzlos weg — Variante A braucht weder die Set/Map-Mutation noch die immutability-Helper, weil das Schema-Feld direkt mit dem Tab stirbt. Die im v0.2.1-Bug-Brief offen gehaltenen Edge-Cases (Projekt-Entfernen, kuenftige neue Close-Pfade) sind damit erledigt — jeder Pfad, der `closeTab()` aufruft, raeumt Spawn-Tracking automatisch mit. Aufrufstellen-Migration war minimal, weil HistoryActionModal, HistoryPane und LeftSidebar Resume-Pfade die Felder ohnehin nicht setzen (Default `false`/`null`).

**Implementierungsdetail:** `addTab(input)` initialisiert `needsSpawn: input.needsSpawn ?? false` und `initialPrompt: input.initialPrompt ?? null` — Default-by-Convention statt Pflicht-Parameter, damit der haeufige Resume-Pfad ohne Boilerplate auskommt. Neue Store-Action `consumeInitialPrompt(sessionId)` mit Referenz-Gleichheits-Bailout bei bereits-`null` (idempotent gegen StrictMode-Double-Effects und kuenftige Re-Mount-Pfade). `TerminalTab.onInitialPromptSent` zeigt jetzt direkt auf die Store-Action statt auf einen TabContainer-Callback. 7 neue Tests im `useSessionStore Spawn-Tracking`-Block — Default-Werte, addTab-Uebernahme, `consumeInitialPrompt`-Idempotenz/No-op-fuer-Ghost-IDs, Kern-Regression Close → Resume.

---

## Renderer-Crash-Schutz: ErrorBoundary plus expliziter Renderer-Addon-Pre-Dispose (C)

**Entscheidung:** Zwei Schichten kombiniert — die `@xterm/addon-webgl@0.19.0`-Dispose-Exception wird beim Cleanup mit einem expliziten Pre-Dispose via `safeDisposeAddon` abgefangen (Helper-Variante B aus dem Bug-Brief), zusaetzlich wickelt eine globale `ErrorBoundary` den `<App>`-Tree, damit kuenftige Effect-Cleanup-Exceptions anderer Komponenten den Renderer ebenfalls nicht mehr kollabieren lassen.

**Varianten:**

- **A** Nur `try/catch` um `terminal.dispose()`. Minimalst-Eingriff, fixt den konkreten Crash.
- **B** Renderer-Addon-Ref tracken, vor `terminal.dispose()` separat disposen mit `try/catch`, plus zweites `try/catch` um `terminal.dispose()` selbst. Gezielter auf den Schuldigen — die uebrigen Addons (Fit, Search, Serialize, WebLinks) duerfen ueber xterms `AddonManager`-Schleife sauber durchlaufen, weil der WebGL-Werfer vorher schon dran war.
- **C** B plus globale `ErrorBoundary` ueber `<App>`. Defense-in-Depth fuer kuenftige Effect-Cleanup-Bugs in beliebigen Komponenten — selbst wenn etwas Aehnliches in CodeMirror, chokidar-Push-Handlern oder Auto-Refresh-Pfaden auftritt, sieht der User einen Fallback statt einer schwarzen Wand. (Gewaehlt)

**Grund:** A loest nur das Sofort-Symptom und maskiert beliebige Dispose-Fehler ohne Diagnose-Hilfe (kein Label im Log, keine Trennung zwischen WebGL-Bug und echten Cleanup-Problemen). B macht den Aufrufer-Code im `TerminalTab`-Cleanup ausdrucksstaerker und gibt den anderen Addons eine saubere Dispose-Chance, weil sie in der `AddonManager`-Schleife vor dem WebGL-Addon dran sind — die Schleife bricht nicht mehr ab. C nimmt die Lehre aus genau diesem Bug-Report ernst: das eigentliche Problem war nicht *dass* eine Exception fliegt, sondern *dass sie den gesamten Renderer-Tree mit sich reisst*. Ein Class-Component-Fallback ist 30 Zeilen plus eine `.tsx`-Datei und schuetzt dauerhaft vor „Single-Component-Bug killt komplette App"-Klasse von Crashes — der praktische Schmerz eines Background-only-Wand-Crashes ist hoch genug, dass die Investition sich lohnt. Class-Component bewusst, weil React kein Hook-Equivalent fuer `componentDidCatch` anbietet.

**Konsequenz:** Der `@xterm/addon-webgl`-Bug bleibt third-party und nicht von uns reparierbar (siehe TECH_SCHULDEN). Im Daily-Use sieht der User stattdessen ein `[safeDispose] renderer-addon dispose warf:`-Warn in den DevTools, das die Bug-Praesenz signalisiert, ohne den Workflow zu stoeren — bewusst nicht weggesteckt, weil die Warns nuetzliche Diagnose-Spur bleiben falls @xterm den Upstream-Bug fixt (dann verschwinden sie von selbst und der Library-Bump-Trigger ist klar). Die `ErrorBoundary` ist absichtlich ueber `<StrictMode>` aussen platziert, damit sie selbst bei Setup-Fehlern (z.B. App-Boot-Race) noch greift; sie fangt aber kein Render-Crash *innerhalb* ihres eigenen render-Pfades — das Fallback-Markup ist deshalb auf reines HTML + bestehende `.td-bootstrap`-CSS-Klassen beschraenkt, ohne weitere Komponenten-Importe.

**Implementierungsdetail:** Zwei Pure-Helper `safeDisposeAddon(addon, label)` und `safeDisposeTerminal(terminal, label)` in `src/renderer/components/safeDispose.ts` mit gemeinsamem `DisposableLike`-Interface (`{ dispose(): void }`), damit Mocks in Tests trivial sind. `safeDisposeAddon` ist `null`-tolerant (bequem fuer Refs, die nach Context-Loss-Tausch leer sind); `safeDisposeTerminal` erwartet ein nicht-null Terminal. Logging mit `console.warn` plus Label, damit DevTools-Diagnose bei mehreren parallelen Tabs zuordenbar bleibt. `loadRendererAddonWithFallback` liefert jetzt den geladenen Addon zurueck (`WebglAddon | CanvasAddon | null`) und akzeptiert einen `onAddonReplaced`-Callback fuer Context-Loss-Swaps; der Caller (`TerminalTab`) haelt die Ref synchron. Im Cleanup laufen die Schritte streng in dieser Reihenfolge: TUI-Timer stoppen → Listener abmelden → ResizeObserver disconnecten → Renderer-Addon safe-dispose → Terminal safe-dispose → Refs nullen. Die `ErrorBoundary` reused die bestehende `.td-bootstrap`-CSS-Klasse und ergaenzt drei neue Sub-Klassen (`.td-error-boundary-lead/-detail/-reload`) ueber dieselben Tokens (`--td-panel`, `--td-line`, `--td-accent`) — kein neuer Token, kein Design-Drift. 5 Tests in `tests/renderer/safe-dispose.test.ts` decken die Pure-Helper (Normal-Dispose, null-No-op, Exception-Schluck mit Label-Log) fuer beide Varianten; kein Test fuer die `ErrorBoundary` selbst, weil das Repo keine React-Testing-Library-Infrastruktur hat (gleiche Begruendung wie beim Auto-Open-Sentinel-Ref-Fix aus dem Release-Review v0.3.0).

---

## 5h-Block-Anker: messages.ts statt usage_buckets oder eigene Anker-Tabelle (A)

**Entscheidung:** Der minutenpraezise Anker fuer den session_block-Resolver kommt aus der bestehenden `messages`-Tabelle (`ts INTEGER NOT NULL`, indexed). Eine neue Repo-Methode `MessageRepository.timestampsInRange` liefert sortierte ms-Zeitstempel im Lookback-Fenster; der Resolver iteriert sie mit derselben Crossing-Logik wie vorher die Buckets.

**Varianten:**

- **A** Anker aus `messages.ts` (gewaehlt). Eine Source of Truth, keine Migration, nutzt vorhandenen Index.
- **B** Eigene `session_blocks`-Tabelle, vom JSONL-Watcher gepflegt. Block-Start-Event triggert Insert eines Anker-Rows, Resolver liest O(1) den juengsten aktiven Anker.
- **C** Pro Session `first_token_ts`-Spalte. Verworfen.

**Grund:** A nutzt Daten, die bereits in jeder Token-Zeile minutenpraezise persistiert sind. Token-Summe bleibt weiterhin bucket-basiert (Stunden-Granularitaet ist fuer den `sumTokens`-Pfad korrekt und schnell) — nur die Anker-Erkennung wechselt auf ms-Praezision. B haette eine zweite Source of Truth zur `messages`-Tabelle eingefuehrt: der Watcher muesste die Block-Erkennungs-Logik tragen, und bei Watcher-Repair/Reconciliation droht Drift zwischen den beiden Tabellen. C scheitert am Fakt, dass ein 5h-Block typischerweise mehrere parallele Sessions abdeckt — session-lokaler Anker ist konzeptuell falsch fuer ein globales Limit.

**Konsequenz:** Die Token-Summe behaelt eine kleine, nicht-eliminierbare Stunden-Drift im Anker-Bucket (ein Token-Event 13:50 + Anker 14:00 zaehlt zur 13:00-Stunden-Summe mit, obwohl es vor dem Anker liegt). Akzeptabel — typisch <1 % Drift, fuer den Display-Zweck der Bar irrelevant. `ResolveWindowDeps.messages` ist `optional`, damit Alt-Tests ohne Messages-Dep weiterhin den (alten) Bucket-Anker-Fallback nutzen. Production hat immer Minuten-Praezision, weil der IPC-Handler `messages` durchreicht. Erweiterungspfad fuer spaeter, falls die Stunden-Drift in Edge-Cases doch stoert: `MessageRepository.sumTokensInRange(fromMs, toMs, modelLike)` als neue Methode auf `messages` direkt — kostet einen zweiten Datenpfad, lohnt sich aber erst, wenn das Drift-Verhalten tatsaechlich gemeldet wird.

---

## Multi-Tab-Diff: Pillen-Toggle in der bestehenden Pane (A)

**Entscheidung:** Die drei Diff-Modi „Working Tree / Staged / Session" leben als Pillen-Toggle oben in der `td-diff-head`-Zeile derselben Diff-Pane. Ein State-Wechsel pickt die passende File-Liste und die passenden original/doc-Quellen fuer `unifiedMergeView` — kein zusaetzlicher Tab in der Datei-Tab-Reihe, kein Stacked-Layout, kein Mode-Drop-Down.

**Varianten:**

- **A** Pillen-Toggle (gewaehlt). Eine Diff-Pane, drei umschaltbare Modi.
- **B** Drei separate Tabs in der Datei-Tab-Reihe (Working / Staged / Session als drei eigene `td-code-tab`-Eintraege neben den File-Tabs).
- **C** Stacked-View — alle drei Modi untereinander in einem Scroll-Container.

**Grund:** A ist konventionell — die App hat bereits `td-dash-tab`-Pillen fuer „Übersicht / Modelle" (Stats-Pane Season 12) und Range-Toggles „Alle / 30d / 7d" (Season 12 + 13). Damit kennt der Daily-Driver-User das Pillen-Muster und versteht den Modus-Wechsel ohne Erklaerung. B haette einen toten dritten Tab fuer den haeufigen Daily-Use-Fall „aktive Session ohne Datei-Touches" produziert — Session-Diff ist oft leer (Resume-Sessions ohne Working-Tree-Edits, Terminal-Sessions, Bug-Sessions die nur in einem Modul lesen). C verschenkt die ohnehin engen Vertikal-Pixel der Diff-Pane (File-Liste 180 px + Merge-View) und triplet die Datenpfade pro Render-Cycle.

**Konsequenz:** Mode-State lebt im DiffViewer-Component (`useState<DiffMode>`), nicht im Zustand-Store — pro Pane-Mount startet er auf 'working'. File-Auswahl wird ueber Modus-Wechsel hinweg gehalten, sofern die Datei im Ziel-Modus existiert; sonst springt sie auf die erste Datei der neuen Liste. Empty-States pro Modus mit konkretem Hinweis (Working: „sauber", Staged: „Index ist leer — keine `git add`", Session: bei fehlender Baseline „Legacy-Session / kein Git-Repo / detached HEAD ohne Commit"). UI-Polish: erste Pillen-Iteration war im Default-Browser-Button-Stil grell-weiss; CSS-Block `.td-diff-modes`/`.td-diff-mode-pill` zieht sie ueber dieselben Tokens wie `td-dash-tab` auf den App-Look.

**Implementierungsdetail:** Working/Staged ziehen ihre File-Liste aus dem schon geladenen `git:status`-Result (gefiltert auf `worktreeStatus !== 'unchanged'` bzw. `indexStatus !== 'unchanged'`). Session braucht einen eigenen Fetch (`git:session-diff`) mit Race-Schutz via Sequence-Counter. Pro Datei nutzt der Per-File-Pane drei verschiedene Quellen-Paerchen: Working = `git.show(HEAD)` + `fs.read`; Staged = `git.show(HEAD)` + `git.showStaged`; Session = `git.show(baselineSha)` + `fs.read`. Untracked-Files im Session-Modus kommen aus `git status not_added` (im Driver in `changedFilesAgainst` reingemerged) — damit erscheinen Dateien, die nach Session-Start angelegt aber nie committed wurden, sauber als „neu seit Session-Start".

---

## Always-visible Diff: Auto-Open-Pairing statt Inline-Diff-Marker (A)

**Entscheidung:** Der Diff-Tab oeffnet sich automatisch beim Projekt-Wechsel (sofern `has_git=1`), und ein Klick auf eine Datei in der Diff-File-Liste oeffnet diese zusaetzlich als Editor-Tab im Hintergrund — der Diff bleibt aktiv. Damit ist „Diff immer sichtbar" mit minimalem Eingriff in das bestehende Tab-Stack-Modell erreicht.

**Varianten:**

- **A** Auto-Open-Pairing (gewaehlt). Diff und Editor bleiben getrennte Tab-Slots im selben Stack; gezielte Coordination zwischen beiden.
- **B** Inline-Diff-Marker im Editor selbst — der Editor zeigt Gutter-Bars + Hunk-Outline statt einer separaten Diff-Pane. Bricht den Read-Only-Charakter des Diff-Viewers aus Sprint 7 auf und ist eine eigene Phase-3-Architektur-Diskussion.

**Grund:** A behaelt die strikte Trennung „Diff = Read-only, Editor = Read-Write" aus Sprint 7 bei und kostet nichts in der bestehenden Tab-Layout-Mechanik — `openDiffTab` ist idempotent (bei vorhandenem Tab nur fokussieren), `openFile` aktiviert intern den neuen Tab synchron und der Caller setzt direkt danach `setActive('diff')` zurueck. Beide Mutationen landen im selben React-Render-Cycle, also kein Flicker. B haette eine voll neue Edit-aware-Diff-Pipeline gebraucht (Conflict-UX bei Edit-While-Diffing, Save-vs-Hunk-Accept-Reihenfolge, Dirty-State-Coordination zwischen Diff-Markers und Editor-Buffer) — Wochen-Aufwand, kein Phase-2-Scope.

**Konsequenz:** Der Auto-Open des Diff-Tabs greift einmalig beim Projekt-Wechsel; wenn der User den Diff-Tab explizit schliesst und im selben Projekt bleibt, bleibt er zu. Beim naechsten Projekt-Wechsel oeffnet er sich wieder (Idempotenz greift erst wenn der Tab schon im Stack ist) — bewusster Default „neuer Projekt-Kontext → Diff sichtbar". Auto-Open-Pairing geht aktuell nur in eine Richtung (Diff → Editor); der umgekehrte Pfad (Klick im FilesPanel → File-Selection im Diff-Tab synchronisieren) ist als naheliegende Folge-Erweiterung dokumentiert, im V1 aber nicht gebaut — der FilesPanel-Klick aktiviert den Editor-Tab direkt, was den haeufigsten Use-Case bereits abdeckt.

**Implementierungsdetail:** Auto-Open via `useEffect` in `EditorPane` mit deps `[projectId, hasGit, diffTabOpen, openDiffTab]`. Auto-Open-Pairing-Handler in `EditorPane.handleOpenInEditorFromDiff` als `useCallback` (`projectId, openFile, setActive`), reicht ueber den `onOpenInEditor`-Prop in den DiffViewer rein. Die `activeSessionId` fuer den Session-Modus wird im Selector gegen das aktive Projekt gefiltert — eine Session aus einem anderen Projekt blockt den Session-Modus nicht auf die falsche Repo-Wahrheit, sondern faellt zurueck auf den „Keine aktive Session"-Empty-State.

---

## Diff/Editor-Auto-Refresh: Chokidar-Watch im Main mit IPC-Push (A)

**Entscheidung:** Pro aktivem Projekt-Root laeuft genau ein chokidar-Watcher im Main-Prozess (`ProjectFilesWatcher` in `src/main/fs/project-watcher.ts`). Aenderungen werden 200 ms debounced gesammelt und via `fs:changed`-IPC an den Renderer gepusht; dieser refetcht den Diff (alle drei Modi) und laedt fuer alle CLEAN File-Tabs den neuen Inhalt nach. Dirty Tabs bleiben unangetastet — lokale Edits gewinnen.

**Varianten:**

- **A** Chokidar-Watch im Main (gewaehlt). Push-Architektur, gleiche Library wie der JSONL-Watcher aus Sprint 5.
- **B** Renderer-seitiges Poll-Loop (mtime/size-Check alle ~1 s auf die gerade sichtbaren Dateien). Kein Main-State noetig, dafuer dauerhaft CPU-Hintergrund-Cost.
- **C** Manueller Refresh-Button + automatischer Trigger nach jeder PTY-`exit`/Idle-Transition. Kein File-Watching, deckt externe Edits (zweiter Editor-Fenster) nicht ab.

**Grund:** A nutzt eingespielte Technik aus dem Stack — chokidar war bereits als JSONL-Watcher-Dependency vorhanden, kein neuer Architektur-Baustein. Push-Modell verbraucht CPU nur bei tatsaechlichen Aenderungen, nicht im Leerlauf. Sub-50ms-Latenz vom Editor-Save bis zur Diff-Aktualisierung — fuehlt sich „live" an. B haette ein Hintergrund-Poll-Loop in den Renderer eingezogen, der auch bei minimiertem Fenster Festplatten-Zugriffe gemacht haette (Akku-Drain im Daily-Use mit mehreren parallelen Projekten). C deckt den haeufigsten User-Case („Claude hat eine Datei veraendert, ich will den Diff sehen") zwar ab, aber bricht beim zweiten alltaeglichen Pfad „ich editiere die Datei parallel in VS Code".

**Konsequenz:** Renderer ruft `fs:set-watched-project({projectId})` bei jedem Projekt-Wechsel; der Main resolved gegen `ProjectRepository.getById` und ruft `setProject(projectId, projectPath)` (idempotent — gleicher Wert ist no-op). `projectId=null` stoppt den Watcher. Skip-Liste ist hartcodiert (`node_modules`/`.git`/`dist`/`build`/`.vite`/`.next`/`.idea`/`.vscode`/`out`/`coverage`); kein Settings-Slot, weil die Liste deckungsgleich mit dem `fs:list-tree`-Scanner ist und Drift zwischen den beiden Listen ein eigener Bug-Vektor waere. Watcher-Stop awaited vor `before-quit`, parallel zum JSONL-Watcher. Tiefen-Limit `depth: 8` analog zum Workspace-Scanner.

**Implementierungsdetail:** `setProject(projectId, projectPath)` schliesst einen ggf. laufenden Watcher zuerst — damit kann kein Event aus dem alten Projekt mehr durchrutschen und faelschlicherweise als neue Aenderung gepusht werden. `awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 30 }` ist aggressiver als beim JSONL-Watcher (100/50), weil Editor-Saves typischerweise <50 ms dauern und der 200-ms-Debounce darunter ohnehin buendelt. Events `add`/`change`/`unlink` sind alle relevant — neue Files, Edits, Deletes erscheinen alle im Diff. Pfad-Normalisierung auf Forward-Slash + projektrelativ (gleiche Konvention wie `FsTreeNode`). Renderer-Effect in `EditorPane`: pro Push wird ein `refreshKey`-Counter inkrementiert (Diff-Pane + `useGitStatus` haben ihn als Dep-Listen-Element) und pro Pfad gepruft, ob ein clean File-Tab existiert — dann ein `fs.read` + `setSaved`. Pre-Save-Race-Check (User druckt zwischen Push und `fs.read` eine Taste) ist ueber den `dirty`-Check auf den juengsten Tab-State abgesichert.

---

## Terminal-Renderer: WebGL primaer mit Canvas-Fallback (A)

**Entscheidung:** xterm-Renderer auf `@xterm/addon-webgl@0.19.0` mit `loadRendererAddonWithFallback`-Helper umgestellt, der zwei Fallback-Pfade kennt: (1) try/catch um den WebglAddon-Konstruktor (Treiber-Failure oder WebGL2 nicht verfuegbar), (2) `onContextLoss`-Handler (GPU-Reset zur Laufzeit, z.B. nach Treiber-Update). Beide Pfade laden `CanvasAddon` nach. Console-Erfolgs-Log `[TerminalTab] Renderer: WebGL` plus Fallback-Logs fuer DevTools-Diagnostic.

**Varianten:**

- **A** WebGL als primaerer Renderer mit Canvas-Fallback (gewaehlt). xterm-empfohlener Pfad fuer 2024+, nutzt GPU-Glyph-Atlas.
- **B** Bei Canvas-Renderer bleiben und TUI-Poll + Smooth-Scroll als alleinige Optimierungen. Keine neue Dependency, aber GPU-Bottleneck bleibt.
- **C** Komplett-Wechsel auf eine alternative Terminal-Library (z.B. Hyper-Terminal-React-Komponenten). Architektur-Bruch.

**Grund:** Der User-Report „Scrollen stockt mit mehreren Seasons parallel" zeigt klassische Canvas-2D-Limitierung: bei N Tabs mit aktiven Bell-Animationen + Cursor-Blink + Buffer-Updates wird die CPU-Composite-Pipeline zum Bottleneck. WebGL nutzt den GPU-Glyph-Cache und skaliert linear mit Tab-Anzahl. B als alleiniger Pfad waere ein Half-Fix gewesen — die User-Diagnose war eindeutig Wheel-Stocken, nicht Permission-Latency. C ist Over-Reach: keine Library-Schmerzen mit xterm in Phase 1/2 dokumentiert, der Aufwand waere mehrere Seasons. Der Fallback-Pfad in A faengt Treiber-Edge-Cases ab, ohne die Default-Erfahrung zu kompromittieren — Console-Log gibt im Daily-Use ein Diagnostic-Signal, falls WebGL stumm faellt.

**Konsequenz:** Neue Runtime-Dependency `@xterm/addon-webgl@^0.19.0`. Renderer-Wahl ist ab jetzt zur Laufzeit beobachtbar (Console-Log), sollte beim ersten Daily-Use-Tab in DevTools verifiziert werden — falls der Fallback unbemerkt greift, sind Rest-Stocken-Reports kein xterm-Tuning-Problem, sondern eine Treiber-Geschichte. CanvasAddon bleibt als Runtime-Dependency erhalten (auch wenn im Erfolgs-Pfad nicht aktiv), damit der Fallback ohne weitere Installation greift.

**Implementierungsdetail:** Helper `loadRendererAddonWithFallback(terminal)` als Modul-level-Funktion (nicht inline pro Tab-Mount), damit sie nicht pro Mount neu allokiert wird. `try { new WebglAddon() ... } catch` faengt sowohl Konstruktor-Wuerfe als auch syncrone Init-Failures. `webgl.onContextLoss(() => { webgl.dispose(); terminal.loadAddon(new CanvasAddon()); })` registriert den Laufzeit-Fallback; Canvas-Addon-Load wird in zweiter try/catch geschuetzt, falls auch der Fallback schief geht (logt aber Warning weiter, nicht throw — der Tab bliebe sonst leer ohne Renderer). Erfolgs-Log `console.info('[TerminalTab] Renderer: WebGL')` einmal pro Tab-Mount; bei mehreren parallelen Tabs gibt's also N Log-Eintraege, was die Tab-Anzahl in DevTools sichtbar macht.

---

## Smooth-Scroll im Terminal: 0 (Instant) statt animierter Wheel-Easing

**Entscheidung:** `smoothScrollDuration: 0` im xterm-Konstruktor — Wheel-Events triggern Instant-Jumps, keine Easing-Animation. Klassisches Terminal-Verhalten analog Windows Terminal, iTerm und alacritty.

**Varianten:**

- **A** 0 ms / aus (gewaehlt). Wheel = Instant-Jump.
- **B** 125 ms Easing (initial gewaehlt, dann zurueckgenommen). Easing-Animation pro Wheel-Tick — addiert subjektive Latenz statt sie zu reduzieren.
- **C** Konfigurierbar in Settings (`terminal_smooth_scroll_ms`). User waehlt sich seinen Wert.

**Grund:** B war ein Anfangsfehler unter der Annahme „Smooth-Scroll mildert Stocken durch sanftere Animation". Tatsaechlich macht jede Wheel-Tick-Easing-Animation das Scrollen SUBJEKTIV langsamer, weil der Output sich nicht synchron mit dem Mausrad bewegt. User-Feedback nach erstem Smoke-Test war eindeutig: „ist jetzt smooth aber ruckelt noch ein wenig". Wechsel auf A loeste den verbleibenden Stocken-Eindruck. C wurde nicht gebraucht — die klassische Terminal-Konvention (Windows Terminal, iTerm) ist Instant; wenn jemand spaeter explizit Smooth-Scroll will, ist das ein additives Settings-Feld in einer eigenen Folge-Season.

**Konsequenz:** xterm-Wheel-Events verhalten sich identisch zu Bash/Zsh/PowerShell in Windows Terminal. Keine User-Konfiguration noetig. Bei spaeterem expliziten User-Wunsch („ich haette gerne Smooth-Scroll wieder") ist das ein Schalter im Settings-Modal „Terminal"-Tab, der den Wert ueber `terminal.options.smoothScrollDuration` live setzen kann.

---

## GitHub-Actions-Release-Pipeline: Full-Pipeline mit Release-Objekt-Create + Build + Upload in einem Lauf (B)

**Entscheidung:** Release-CI laeuft als ein GitHub-Actions-Workflow auf `push.tags: ['v*']`, der das Release-Objekt mit anlegt (idempotent), den Windows-Build erzeugt und alle Assets (Setup.exe + win32-zip + latest.yml) ans Release haengt. Damit ersetzt der Workflow komplett die Schritte 9 + 10 aus `docs/release/VERSIONIERUNG.md`; vor dem Tag-Push bleiben nur noch Version-Bump, Release-Notes-Datei committen und der Tag selbst. Single-Job `build-and-release` auf `windows-latest`, kein Matrix-Build, kein `workflow_dispatch`-Backup-Trigger.

**Varianten:**

- **A** Minimal: Build-und-Upload-Only. Workflow erwartet, dass das Release-Objekt bereits per lokalem `gh release create --notes-file ...` angelegt wurde. Schritt 9 aus VERSIONIERUNG.md bleibt manuell, nur Schritt 10 (Build + 3× Upload) wandert ins CI.
- **B** Full: Release-Objekt-Create + Build + Upload in einem Lauf (gewaehlt). Workflow legt das Release-Objekt selbst an (idempotent: existiert es schon, wird der Step uebersprungen). Pre-Release-Flag wird automatisch aus Tag-Suffix abgeleitet (`-alpha`/`-beta`/`-rc`).
- **C** Full plus Matrix-Vorbereitung fuer macOS/Linux. Wie B, aber als `strategy.matrix.os: [windows-latest]` mit vorbereiteten, auskommentierten Eintraegen fuer `macos-latest` und `ubuntu-latest` plus Asset-Naming-Convention fuer plattform-spezifische `latest-*.yml`-Files.

**Grund:** A loescht nur die haelfte des dokumentierten Reibungspunkts — die Memory-Note „Release-Pipeline: gh release + Asset-Upload manuell" wuerde mit A nur zu „gh release manuell" schrumpfen, und das Tail-Risiko „User pusht Tag, vergisst Release-Objekt, Workflow scheitert beim Upload" bliebe stehen. B macht das Pre-Tag-Push-Wissen, das ein User vor dem Release haben muss, minimal: Version-Bump in `package.json`/`CLAUDE.md`/`RELEASES.md`, Release-Notes-Datei `docs/release/v<version>.md` committen, Tag pushen. Beides ist sowieso schon Workflow-Pflicht (Schritte 6 + 7 aus VERSIONIERUNG.md). C ist zukunftssicher fuer macOS/Linux, aber die Roadmap nennt aktuell explizit nur Win11-Target — der „Optional: macOS/Linux-Builds wenn Zielplattform erweitert"-Bullet ist ein „spaeter"-Trigger ohne aktuellen Auslassbarkeit. macOS-Matrix-Eintrag wuerde zusaetzlich sofort die Code-Signing-Frage in den Workflow ziehen (auch wenn man sie via `CSC_IDENTITY_AUTO_DISCOVERY=false` deaktiviert — das ist noch ein Stueck Konfig pro Plattform). C waere ohne konkreten macOS-Roadmap-Trigger Over-Engineering; ein spaeterer Wechsel von B auf eine Matrix-Form ist ein YAML-Umbau ohne Architektur-Bruch.

**Konsequenz:** Schritte 9 + 10 aus `docs/release/VERSIONIERUNG.md` fallen ab dem ersten erfolgreichen Tag-Push weg — der Doku-Step wartet auf den realen Validation-Lauf, damit nicht eine fehlerhafte Pipeline nach falscher Doku gefahren wird. Die TECH_SCHULDEN-Note „latest.yml-Generierung als manuelles Post-Make-Script" ist mit dem Workflow effektiv aufgeloest (der Workflow ruft `node scripts/generate-latest-yml.mjs` automatisch zwischen Make und Upload auf — Vergessen ist nicht mehr moeglich). Die Memory-Note „Release-Pipeline: gh release + Asset-Upload manuell" wird obsolet, sobald der erste Tag-Push gruen ist; bis dahin bleibt sie als Wahrheit-zum-Zeitpunkt-X stehen. Workflow-aenderungen sind in Zukunft selbst Doku-Werte: jede Aenderung an den Verify-Gates oder der Asset-Liste muss in einem eigenen Commit mit Notiz in VERSIONIERUNG.md sichtbar werden.

**Implementierungsdetail:** Trigger ist `push.tags: ['v*']` mit `permissions: contents: write` damit der Default-`GITHUB_TOKEN` Release-Objekte schreiben darf (Default ist `contents: read`). Concurrency-Gate `group: release-${{ github.ref_name }}` mit `cancel-in-progress: false` gegen Race bei doppeltem Push — der zweite Run wartet, statt den ersten mitten im Asset-Upload abzuwuergen. Verify-Gates laufen *vor* `npm ci` und Pre-Check, damit ein vergessener Version-Bump oder eine fehlende Notes-Datei keine 10-min-Pipeline-Roundtrip kostet: `package.json | ConvertFrom-Json` Vergleich gegen `${{ github.ref_name }} -replace '^v', ''`, plus `Test-Path "docs/release/$tag.md"`. Pre-Check identisch zum Husky-Pre-Commit-Hook (`npm run lint && npm run typecheck && npm test`) — CI ist die Sicherheitsschicht, wenn lokal vergessen. `actions/cache@v4` fuer `~/AppData/Local/electron/Cache` mit Key am `package-lock.json` (Electron-Major-Bump triggert automatisch Cache-Miss, manueller Cache-Invalidate nicht noetig). `actions/upload-artifact@v4` mit `if: always()` und 7-Tage-Retention — der Windows-Build bleibt auch bei spaeterem `gh release upload`-Fail ueber die Action-Run-Seite herunterladbar, sodass ein Pfad-Mismatch nicht den ganzen Pipeline-Run wegwirft. Release-Create-Idempotenz ueber `gh release view $tag --json url 2>$null | Out-Null` + `$LASTEXITCODE`-Check: existiert das Release, Skip; existiert nicht, `gh release create` mit `--notes-file` + auto-detected `--prerelease`. Asset-Upload mit `--clobber` damit ein Re-Run nach halbem Upload nicht aufraeumen verlangt. PowerShell als Default-Shell fuer alle conditional-Steps (`shell: pwsh`), weil `windows-latest` native PowerShell hat und `gh` CLI direkt damit spricht — keine extra Node-Skript-Eskorte fuer die Verify-/Release-Logik.

---

## Auto-Update: electron-updater auf bestehender Forge/Squirrel-Pipeline plus manuelles latest.yml-Post-Make-Script (A)

**Entscheidung:** Auto-Update laeuft ueber `electron-updater@^6.8.3` mit dem GitHub-Provider gegen `Makney/TakumiDeck`-Releases. Forge bleibt als Build-Toolchain (`MakerSquirrel` + `MakerZIP`), Code-Signing bleibt aus. Das fuer den GitHub-Provider noetige Feed-File `latest.yml` wird nicht von Forge geschrieben — stattdessen erzeugt `scripts/generate-latest-yml.mjs` es post-`npm run make` und der manuelle `gh release upload`-Schritt nimmt es als drittes Asset mit. UX: App-Start-Check ~5 s nach Window-Show, Banner in der Header-Bar, Download erst nach User-Klick, Install erst nach zweitem Klick.

**Varianten:**

- **A** `electron-updater` + bestehende Forge/Squirrel-Pipeline, `latest.yml` per Post-Make-Script (gewaehlt). Roadmap-Wortlaut woertlich erfuellt; minimaler Eingriff in Build-Stack; das Feed-File wandert in den schon dokumentierten manuellen `gh release upload`-Workflow.
- **B** Komplett-Wechsel auf `electron-builder`. Build-Tool schreibt `latest.yml` automatisch, electron-updater ist nativ verheiratet; aber Forge-Konfig (`forge.config.ts`, `plugin-vite`, Externals-Ignore fuer Native-Deps, AutoUnpackNatives) muss komplett umgezogen werden — Sprint-8-Build-Entscheidungen waeren neu zu treffen, die memory-dokumentierte „Forge-Vite + Externals = leeres ASAR"-Falle in der anderen Richtung neu zu loesen.
- **C** `update.electronjs.org`-Service der Electron-Foundation. Eine URL pro Plattform, kein Feed-File, keine extra Dependency; aber die Roadmap-Zeile „electron-updater integrieren" wird nicht erfuellt, und Notification-Timing + Download-Steuerung sind weniger flexibel — der Service ist ausserdem Single-Point-of-Failure und cached auf eigenem Plan.

**Grund:** A erfuellt die Roadmap-Zeile woertlich (`electron-updater integrieren · GitHub-Releases als Update-Quelle · manueller Install-Trigger`) ohne Build-Stack-Risiko. Die memory-dokumentierte Forge/Externals-Falle hat in Phase 1 bereits einen vollen Sprint-Tag gekostet — ein Wechsel auf electron-builder wuerde dasselbe Tail-Risiko in der anderen Richtung wieder freilegen. Variante B ist Code-strukturell sauberer, aber das ist ein eigenes Season-Vorhaben und wuerde das Auto-Update-Feature selbst hinter einem Build-Migrations-Vorhaben verstecken. C verschenkt Roadmap-Treue und Update-UX-Kontrolle fuer 50 Zeilen weniger Code — der Tradeoff lohnt sich bei einem privat verteilten Tool nicht, das ohnehin durch den manuellen `gh release upload`-Workflow geht. Das manuelle `latest.yml`-Script ist der Preis fuer A; per Doku-Step in `VERSIONIERUNG.md` Schritt 10 abgesichert und als Tech-Schuld dokumentiert (kann jederzeit per Forge-Publish-Hook automatisiert werden, falls die Manual-Step einmal vergessen wird).

**Konsequenz:** Jedes kuenftige Release muss `scripts/generate-latest-yml.mjs` ausfuehren und `out/make/latest.yml` mit ins `gh release upload` packen — sonst meldet `electron-updater` beim Check stumm „kein Update", obwohl ein Release ge-pushed wurde. Der Wrapper (`src/main/updater/auto-updater.ts`) ist bewusst duenn und State-Machine-zentriert; eine spaetere Erweiterung um Tray-Icon-Indikator, Hintergrund-Polling oder Diff-Update-Stats kann ohne Renderer-IPC-Change daran andocken. Der `package.json`-Version-Bump bleibt Release-Trigger-Sache — Auto-Update selbst aendert keine User-sichtbaren Defaults und braucht keine eigene Versionserhoehung.

**Implementierungsdetail:** State-Machine ist Discriminated-Union mit acht `kind`s in `shared/types.ts` (idle/checking/no-update/available/downloading/downloaded/error/disabled-dev) — Renderer-Banner matcht auf `kind` statt selbst auf raw electron-updater-Events zu hoeren. `disabled-dev`-State im Dev-Modus verhindert sowohl unnoetige Network-Calls als auch DevTools-Error-Spam (electron-updater wuerde gegen GitHub queryen und beim ersten `error`-Event den Banner triggern). Optimistischer Sprung auf `'downloading'` mit `percent: 0` direkt nach `startDownload()`-Klick — sonst sieht der Banner einen Dead-Click, weil das erste `download-progress`-Event erst nach dem ersten Chunk kommt (bei kleinen Updates spuerbar verzoegert). `downloadingVersion`-Feld merkt sich die Version aus dem `'available'`-Snapshot, weil `download-progress`-Events selbst keine Version liefern. Boot-Check als `setTimeout(check, 5000)` nach `createMainWindow()`, bewusst nicht synchron im `ready-to-show`-Handler — sonst muesste der First-Paint auf den GitHub-Roundtrip warten und die App fuehlt sich beim Start zaeh an. CSS-Klasse `.td-titlebar-updater-banner` als Akzent-Variante des `.td-titlebar-claude-banner` (positiv-neutrale Aktion statt Warnung) ueber `color-mix(in srgb, var(--td-accent) X%, transparent)` — keine neue Token-Farbe noetig.

---

## Settings-Schema-Versionierung: Pipeline analog SQLite-Runner mit defensiver Drift-Detection pro Feld (B)

**Entscheidung:** `settings.json` traegt ein `schema_version`-Pflichtfeld. Eine versionierte TypeScript-Migrations-Pipeline in `src/main/settings/migrations.ts` laeuft in `SettingsStore.read()` zwischen `JSON.parse` und `AppSettingsSchema.parse`, persistiert das Ergebnis nur, wenn tatsaechlich Migrations gelaufen sind. Jede Migration ist defensiv geschrieben — sie ersetzt einen Wert nur, wenn der exakte alte Default noch unveraendert im Dokument steht; User-Anpassungen bleiben unangetastet.

**Varianten:**

- **A** Strikte versionierte Pipeline, Migration ueberschreibt ohne Drift-Detection. Migration 1→2 setzt einfach den neuen Default ueberall. Simpel, aber buegelt User-Anpassungen (eigene `limit_bars`-Labels, eigene `model_limits`-Werte) weg.
- **B** Versionierte Pipeline mit defensiver Drift-Detection pro Feld (gewaehlt). Pipeline-Infrastruktur strikt nach Version, Defensivitaet ist Konvention im Schreiben der Migrations. Sicher fuer aktiv gepflegte Settings, etwas mehr Code pro Migration.
- **C** Kein Versionsfeld — bestehender Default-Merge wird zu Deep-Merge + heuristische Per-Feld-Cleanups im Read-Pfad. Pragmatisch ohne neue Infrastruktur, skaliert aber nicht ueber Trivial-Drifts hinaus (Feldnamen-Umbennenung oder Schachtelung gehen so nicht sauber).

**Grund:** Die Roadmap-Vorgabe „analog zum SQLite-Migrations-Runner" hat C disqualifiziert — ohne Versions-Anker keine Idempotenz-Garantie ueber strukturelle Aenderungen hinweg. A waere bei einem reinen Erst-User-Setup tragbar gewesen, aber TakumiDeck wird als Daily-Driver mit aktiv gepflegten Settings betrieben (eigener Wochen-Reset, eigene `model_limits`, eigene Bar-Anpassungen) — in dem Kontext darf eine Migration keinen User-Wert ungefragt ueberschreiben. B ist die einzige Variante, die beide Eigenschaften zusammen liefert: versionierte Infrastruktur fuer strukturelle Migrations + Bestand-schonende Defensivitaet pro Feld. Memory-Regel „UX-Defaults: konvenient vor traditionell" hat hier konsistent gewirkt — der konveniente Daily-Driver-Pfad ist „User-Wert ueberlebt jeden Migration-Tick", nicht „Migration biegt alles auf Anthropic-Default zurueck".

**Konsequenz:** Jede kuenftige Default-Drift bekommt eine eigene Migration mit naechster `id`, und `CURRENT_SETTINGS_SCHEMA_VERSION` wird hochgezogen. Ein Guard-Test (`tests/main/settings-migrations.test.ts`) prueft die Synchronisation. Migrations sehen das raw geparste JSON *vor* dem Default-Merge — sonst wuerde der Merge fehlende Felder bereits mit dem neuen Default vorbefuellen, und die Drift-Detection koennte „alter Default" nicht von „neuer Default" unterscheiden. Persist-Check ueber `ranIds.length > 0` haelt den Boot leichtgewichtig: wer schon migriert ist, hat keinen `rename`-Roundtrip mehr im Read-Pfad.

**Implementierungsdetail:** Die erste ausgelieferte Migration `defaults_v0_2_x_drift` (id=2) bundelt vier Drifts in einen Schritt — drei aus der Roadmap-Notiz (`limit_bars` Claude-Design-Bar entfernt, `weekly_sonnet`-Label angehoben, `default_limit` 1 M → 200 k) plus `model_limits` pro Modell-Key gleicher Pfad. Die Roadmap-Notiz nennt als dritten Drift „Sensitive-Pattern-Defaults" — in der Praxis war der Settings-Default (`sensitive_file_patterns: string[]`) seit Sprint 8 stets das leere Array; die schuetzenden Patterns (`.env(.*)`, `secrets.*`, `*.key`, `*.pem`) leben hartcodiert in `src/renderer/components/sensitiveFiles.ts` und sind additiv. Kein Drift im persistierten Dokument → bewusst nicht migriert. Defensive Helper (`isPreSprint9ClaudeDesignBar`, `isPreSprint9SonnetBar`) pruefen pro Eintrag alle Default-Keys, sodass ein User-customized-Bar mit gleicher `id` (z.B. abweichender Filter) nicht versehentlich entfernt wird. Migration ist idempotent: doppelter Lauf liefert dasselbe Ergebnis — getestet als eigener Spec.

---

## Markdown-Editor-Layout: Side-by-Side als Default + prozentuales Sync-Scrolling (B + S1)

**Entscheidung:** Der Markdown-Editor rendert Editor und Preview parallel mit synchronem Scrolling als neuen Daily-Driver-Default. Die alten Phase-1-Modi „Nur Editor" und „Nur Preview" bleiben als Per-Datei-Switch in der Toolbar erreichbar und als Default in den Settings wählbar. Sync-Scroll läuft prozentual und einseitig getrieben — das Pane, in dem der User scrollt, schiebt das andere; keine Heading-Map.

**Varianten (Layout):**

- **A** Dritter Modus „Split" additiv zur Phase-1-Toggle-Reihe (Editor · Preview · Split). Konservativ, ändert keinen bestehenden Workflow; Side-by-Side ist Opt-in.
- **B** Side-by-Side als Default, Toolbar schaltet Panels ein/aus (gewählt). „Beide" zuerst, dann „Nur Editor" / „Nur Preview" als Reduktionsmodi. Bestandsuser sehen einmalig ein ungewohntes Layout.
- **C** Layout-Wechsel nur in Settings, keine Modus-Buttons in der Toolbar. Settings als Single-Source-of-Truth.

**Varianten (Sync-Scroll):**

- **S1** Prozentual, einseitig getrieben (gewählt) — `scrollTop / (scrollHeight - clientHeight)` auf beide Panes spiegeln, Last-Scrolled-Wins via `active`-Source-Flag mit `requestAnimationFrame`-Reset.
- **S2** Heading-Anchor-Mapping — Heading-Bucket-Map zwischen Editor-Zeilen und Preview-DOM-Positionen, Scroll-Position über Buckets mappen. Präziser bei sauber strukturierten Dokumenten.

**Grund:** B folgt der Memory-Regel „konvenient vor traditionell" — die Daily-Driver-Erwartung beim Schreiben in CLAUDE.md/CHANGELOG ist „beides parallel sehen", und genau dafür steht das Feature seit Phase 2 in der Roadmap. A wäre additiv-konservativ, aber wenn das neue Verhalten das richtige ist, ist eine versteckte Drittwahl die schlechtere Lösung — Phase-1-User bekommen den modernen Modus, der zurück-Klick auf „Nur Editor" ist genau einen Toolbar-Button entfernt, und der Default ist in Settings persistent änderbar. C verschenkt den Per-Datei-Switch und macht „kurz mal nur Preview gucken" zu einer Settings-Reise. S1 schlägt S2, weil S2 bei Code-Blöcken und Tabellen brüchig wird (DOM-Höhe pro Heading-Bucket schwankt extrem) — die Präzision würde nur in einem schmalen Best-Case-Dokument-Typ helfen, dafür sind die Mapping-Datenstrukturen und ihr Re-Build bei jedem Edit teuer. S1 ist O(1) bei jedem Scroll-Event und robust gegen jede Markdown-Struktur.

**Konsequenz:** Per-Datei-Layout wird im React-State (`useState<'split' | 'editor' | 'preview'>`) gehalten, nicht persistiert — der Setting-Default greift beim Tab-Open, danach ist die Wahl Datei-lokal und überlebt nur den aktuellen Tab. Wer einen Datei-individuellen Wunsch (etwa „CLAUDE.md immer im Split, README.md immer im Preview") behalten möchte, müsste per-Datei-Memory ins `useFileTabsStore`-Schema bauen — das ist nicht passiert, weil das Setting-Default plus 1-Klick-Switch in der Toolbar im Daily-Use genügt.

**Implementierungsdetail:** CodeMirror bleibt im DOM verankert über alle Layout-Wechsel — der Container wird im Preview-Only-Modus mit `display:none` ausgeblendet statt React-unmount/re-mount. Sonst würde jeder Toolbar-Klick `EditorView` zerstören und neu bauen, was Cursor-Position, Selection und Undo-History abräumt. Der Sync-Scroll-Listener attached/detached an die `view.scrollDOM` bei jedem Layout-Wechsel auf/von `'split'` — im Editor- oder Preview-Only-Modus laufen die Listener nicht und halten keine fremden DOM-Knoten. Das `active`-Source-Flag ist nötig, weil ein programmatisches `scrollTop = ...` im anderen Pane wieder ein `scroll`-Event feuert, das ohne Guard zurückspiegeln und einen Drift-Loop auslösen würde; der Reset im nächsten `requestAnimationFrame`-Tick gibt einen echten User-Scroll im Ziel-Pane danach wieder frei.

---

## Markdown-Preview-GFM-Tabellen: `remark-gfm` als Plugin statt eigenem Tabellen-Parser

**Entscheidung:** Die GFM-Erweiterungen (Tabellen, Strikethrough, Task-Lists, Autolinks) kommen über `remark-gfm` als `remarkPlugins`-Eintrag in den `<ReactMarkdown>`-Aufruf. Eine Modul-Konstante `MARKDOWN_REMARK_PLUGINS = [remarkGfm]` reicht das Plugin durch, damit `react-markdown` bei jedem Render dieselbe Plugin-Liste sieht.

**Varianten:**

- **A** `remark-gfm` als offizielles Plugin (gewählt) — Maintainer ist dieselbe Org wie `react-markdown` (unified/remark), Versionierung läuft mit, MIT-lizenziert.
- **B** Eigener Markdown-Tabellen-Parser im Renderer — kontrolliert die Edge-Cases selbst.
- **C** Beim Save Markdown vorab in HTML transformieren (Server-seitig, mit `marked`/`markdown-it`), Preview rendert nur das HTML — wäre konsistenter, aber großer Architektur-Eingriff.

**Grund:** A ist die Standard-Lösung der `react-markdown`-Doku. B ist Bring-Your-Own-Parser für ein gelöstes Problem — die GFM-Spec hat Edge-Cases (Pipe-Escaping, Alignment-Markers, multi-line cells), die eine eigene Implementierung über Wochen pflegen müsste. C löst nicht das Preview-Problem, sondern ändert den Save-Pfad — überschießt das Scope.

**Konsequenz:** Strikethrough (`~~text~~`), Task-Lists (`- [ ]`), Autolinks und Tabellen funktionieren überall in der Preview, nicht nur in Säulen. Tabellen-Layout ist eigen-gestyled (Block-Display + Horizontal-Scroll als Sicherheitsnetz, Header in der Akzent-Display-Schrift), weil die Default-Browser-Tabellen unleserlich gegen den dunklen Panel-Hintergrund wären.

---

## Template-Tokens: YAML-Frontmatter-Schema pro Template (Variante B)

**Entscheidung:** Jedes Template deklariert seine `{{TOKEN}}`s im YAML-Frontmatter (`variables:`-Map mit `auto: <pfad>` oder `input: text|textarea` plus optional `label`/`required`). Die Engine resolved Tokens schema-getrieben; Tokens ohne Schema-Eintrag bleiben als Literal `{{TOKEN}}` im Output stehen, der frühere „Unbekannte Tokens"-Warnblock entfällt.

**Varianten:**

- **A** Hartcodierte Listen erweitern — die alte `AUTO_VARIABLES`/`REQUIRED_USER_VARIABLES`/`OPTIONAL_USER_VARIABLES`-Konstanten ergänzen, neue Auto-Resolver pro Pfad im Renderer codieren.
- **B** YAML-Frontmatter pro Template als Schema (gewählt) — jedes Template trägt seine Vertrags-Deklaration selbst, die Engine ist generisch.
- **C** Auto-Discovery — alle unbekannten Tokens werden automatisch als generische Textfelder im Modal angeboten; die Engine kennt nur eine kleine Auto-Var-Whitelist.

**Grund:** A skaliert nicht — jedes neue Template (Bug-Report, Kickoff, Release, Code-Review) verlangt einen Code-Touch + Build. Außerdem kann A nicht zwischen „User soll das eintippen" und „Agent füllt das zur Laufzeit selbst aus" unterscheiden (= das eigentliche Problem mit `PROJEKT_KICKOFF.md`, dessen Tokens wie `{{KURZBESCHREIBUNG}}`/`{{STACK}}` Lauf-Anweisungen sind, keine Renderer-Inputs). C löst das Skalierungsproblem, verschenkt aber die Semantik, die wir in den Templates ohnehin kennen (Pflicht vs. optional, einzeilig vs. mehrzeilig, automatisch ableitbar) — alles würde generisch zum Textfeld. B kombiniert beide Vorteile: Template trägt selbst die Information, Engine bleibt simpel.

**Konsequenz:** Neue Templates funktionieren ohne Engine-Touch, sobald das Frontmatter passt. Der Schema-Discriminator über Schlüssel-Präsenz (`auto` vs. `input`) statt eines `type`-Feldes hält die YAML-Notation kompakt; `zod.strict()` lehnt vermischte Specs ab und der Reader fällt dann auf `schema=null` zurück (Legacy-Fallback greift), damit ein einzelnes kaputtes Template nicht das Modal blockiert. `LEGACY_TEMPLATE_SCHEMA` im Renderer bildet die alten Hardcoded-Listen 1:1 ab, sodass Bestands-Templates ohne Frontmatter weiterlaufen — `null`-Schema wird also nicht als Fehler behandelt, sondern als „nutze den Legacy-Vertrag".

**Implementierungsdetail:** Auto-Pfade in Punkt-Notation (`claude_md.workbench.trigger_phrases.fix`, `db.last_completed_feature_session`, `today`) als Strings im YAML — Resolver macht einen defensiven Object-Walk auf dem geparsten Frontmatter bzw. mappt auf eine IPC-Map. Ein nicht aufgelöster Auto-Pfad gibt bewusst `undefined` zurück (Token bleibt literal stehen), nicht den leeren String, damit der User die fehlende Quelle im Preview sieht. Server-Pfade fragt der Renderer nur an, wenn das aktive Template sie wirklich verwendet (`collectServerAutoPaths`-Filter auf `db.*`/`docs.*`) — Templates ohne TECH_SCHULDEN/ENTSCHEIDUNGEN-Tokens triggern keinen entsprechenden Datei-Read mehr.

---

## Kontext-Checkbox: NewSessionModal-Block, Status-sortiert, Markdown-Sections, Pure-Logik im Docs-Sync-Modul (A1+B1+C1+D1)

**Entscheidung:** Die Kontext-Checkbox-Erweiterung lebt als zweiter Block im NewSessionModal fuer alle Session-Arten ausser Docs-Sync (A1), zeigt alle On-Demand-Files aus dem CLAUDE.md-Frontmatter sortiert nach Status (B1), baut beim Submit eine Markdown-Praeambel mit einer Section pro Datei (C1), und packt die drei neuen Pure-Helper (`deriveOnDemandDescriptor`/`stripFrontmatter`/`buildContextPreamble`) in das bestehende `src/shared/docs-sync.ts` statt in ein eigenes Modul (D1).

**Varianten:**

- **A1** Neuer Checkbox-Block im NewSessionModal parallel zum Docs-Sync-Block (gewaehlt) — konsistent mit Season 21, greift im Moment des Session-Starts, minimale UI-Surface-Erweiterung.
- **A2** Erweiterung des bestehenden Docs-Sync-Blocks zu einem generischen „Kontext laden"-Block — vermischt zwei Anwendungsfaelle (Summary *schreiben* vs. Summary *konsumieren*) in einer UI.
- **A3** Action-Bar-Pille „Kontext nachladen" fuer laufende Sessions — hat eigenen UX-Wert (Mid-Session-Reload), aber der Hauptpfad „beim Start der Session" fehlt; verlangt zusaetzliche Send-Logik in einer schon dichten Action-Bar.
- **B1** Alle On-Demand-Files mit Status-Sort (gewaehlt) — fresh zuerst, dann stale, dann missing-summary, dann missing-source ganz hinten. Erfuellt die Roadmap-Vorgabe „Hinweis im UI, wenn Summary fehlt oder veraltet ist" am direktesten.
- **B2** Nur Files mit existierender Summary anzeigen — saubere Liste, blendet aber den „kann ich noch nutzen"-Hinweis aus und versteckt den naechsten Docs-Sync-Anlass.
- **B3** Alle On-Demand-Files + die vier Docs-Sync-Files in einer Liste — bricht das mentale Modell (die vier Docs-Sync-Files sind keine On-Demand-Files in CLAUDE.md).
- **C1** Markdown-Section pro Datei mit `## Kontext: <relPath>`-Heading + Trennstrich (gewaehlt) — erhaelt die Struktur, ist menschen- und Claude-lesbar, der Pfad bleibt im Text.
- **C2** Roh-Bytes der Summaries hintereinander, ohne Header — knapp, aber Claude verliert die Datei-Grenzen.
- **C3** JSON-Block mit `{path, summary}`-Array — sauber strukturiert, aber fuer Claude-TUI als erstes Input-Block ungewoehnlich (Markdown ist Claudes Heimspiel).
- **D1** Erweiterung von `src/shared/docs-sync.ts` (gewaehlt) — eine Datei fuer „alles, was Summaries angeht".
- **D2** Eigenes Modul `src/shared/context-preamble.ts` parallel — sauberer Scope-Cut, aber Status-Berechnung und Frontmatter-Parser muessten dupliziert/extrahiert werden.

**Grund:** A1 fuegt sich nahtlos in den Season-21-Pfad ein: derselbe `initialPrompt`-Mechanismus, dieselbe Paste-Logik im TabContainer, dieselbe Modal-Architektur. Eine eigene Action-Bar-Pille (A3) waere konzeptionell sauberer fuer „lade Kontext nach", aber der Hauptpfad ist „beim Session-Start" — und dort ist das Modal eh schon offen. A2 wuerde die Bedeutung des Docs-Sync-Blocks verwaessern: dort wird *geschrieben*, hier wird *gelesen*. B1 trifft den Roadmap-Wortlaut praezise; B2 wuerde dem User die Information vorenthalten, dass eine Datei eine Summary verdient (= naechste Docs-Sync-Session). B3 wuerde den User zwingen, die vier Docs-Sync-Files (CHANGELOG/FEATURES/TECH_SCHULDEN/ENTSCHEIDUNGEN) auch fuer Feature/Bug-Sessions zu sehen, obwohl sie dort selten sinnvoll als Praeambel sind — die On-Demand-Files (CODING_RULES/MARKDOWN_RULES/PHASE-Files/GLOSSAR/TECH_SCHULDEN/SEASON_LOG/TAKUMIDECK_ARCHITEKTUR/DEV_SETUP) sind dafuer die natuerliche Quelle. C1 nutzt die Markdown-Faehigkeit, die Claude-TUIs ohnehin verstehen, und gibt eine klare Section-Hierarchie, die spaetere `## Kontext:`-Greps trivial macht. D1 vermeidet einen kuenstlichen Modul-Schnitt: die Pure-Logik ist um zwei Helper (`deriveOnDemandDescriptor`, `stripFrontmatter`) und einen Prompt-Builder (`buildContextPreamble`) gewachsen — alles entlang derselben Frontmatter-Parsing-Pipeline, die seit Season 21 in `docs-sync.ts` lebt. D2 wuerde eine zweite Frontmatter-Parse-Quelle aufmachen, ohne Mehrwert.

**Konsequenz:** Neue On-Demand-Files in CLAUDE.md (z.B. ein User erweitert sein Frontmatter um `docs/STYLE_GUIDE.md`) erscheinen automatisch im Modal-Block, sobald eine Summary unter `docs/SUMMARIES/<basename>` existiert — kein Code-Touch. Wenn der User eine neue Doku-Datei zur Docs-Sync-Whitelist hinzufuegen will (also nicht ueber On-Demand, sondern als feste vierte/fuenfte/n-te Docs-Sync-Datei), bleibt der Pfad ueber `DOCS_SYNC_FILES`-Konstante im selben Modul. Wenn der Praeambel-Wortlaut sich aendern muss (z.B. neue Claude-Version reagiert sensibel auf Section-Header), wandert die Aenderung in `buildContextPreamble`. Wenn das Format „Markdown-Section pro Datei" nicht mehr passt (z.B. weil Claude einen XML-aehnlichen `<context>`-Tag besser parst), reicht eine Umschreibung der Pure-Funktion, ohne Modal- oder IPC-Pfad zu beruehren. Wenn die A3-Variante (Action-Bar-Pille fuer laufende Sessions) doch noch kommt: derselbe `buildContextPreamble` plus eine neue Pille — die Pure-Logik ist agnostisch dazu, ob die Praeambel beim Spawn oder Mid-Session gepastet wird.

**Implementierungsdetail:** Default-Auswahl im Modal sind ausschliesslich Files mit `state === 'fresh'`. Veraltete (`stale`) Summaries sind anklickbar, aber NICHT pre-checked — der User soll bewusst entscheiden, einen Stale-Body in den Kontext zu uebernehmen (Markdown-Section mit potentiell veraltetem Inhalt). Files mit `missing-summary`/`missing-source` haben eine `disabled`-Checkbox, weil es keinen Body zum Pasten gibt — der Status-Marker zeigt sie als Hinweis, dass sich eine Docs-Sync-Session lohnen wuerde. Der On-Demand-Status wird beim ersten Wechsel auf einen non-docs-sync-Typ einmal gefetcht und modal-lokal gecached (useState-Init-Pfad `null` → einmal Fetch, dann nie wieder) — ein User-Wechsel zwischen Feature/Bug/Review/Custom triggert keinen Re-Fetch, weil die On-Demand-Files-Liste sich waehrend der Modal-Lebensdauer nicht aendert. CSS-Klassen aus dem Docs-Sync-Block (`td-docs-sync-list`/`-row`/`-state-*`) werden weiterverwendet — visuelle Identitaet ist hier ein Feature, nicht ein Versehen (beide Bloecke sind „Checkbox-Reihe mit Status-Marker pro Datei"). Sub-Frage zur Body-Lieferung: der `docs:on-demand-status`-IPC liefert den Body direkt mit (statt eines separaten `docs:on-demand-body`-Calls bei Submit), weil die Summaries klein sind (~1 KB pro Datei, < 10 KB Gesamt-Payload bei 10 On-Demand-Files), zweiter IPC-Roundtrip lohnt nicht und der Modal-Submit muss synchron sein.

---

## Docs-Sync-Session: Sechste Session-Art, hartcodierter Prompt, Inline-Status, Hash-im-Frontmatter (E1+P1+S1+H1)

**Entscheidung:** Die Docs-Sync-Session lebt als sechster Button im NewSessionModal (E1), pastet einen hartcodierten Prompt aus einem neuen `shared/docs-sync.ts`-Modul nach erfolgreichem Spawn (P1), zeigt den Sync-Status der vier Doku-Files inline im Modal-Body (S1), und erkennt „Original geaendert?" via SHA-256-Hash im YAML-Frontmatter der Summary-Datei (H1).

**Varianten:**

- **E1** Sechste Session-Art im NewSessionModal (gewaehlt) — folgt Phase-2-Season-5-Pattern (Custom-Type), minimaler UI-Surface-Touch, Status-Block wohnt direkt im Modal-Body.
- **E2** Eigene „Docs-Sync"-Pille in der Action-Bar mit Badge bei veralteten Summaries — mehr Sichtbarkeit, aber Action-Bar wird voller fuer ein Sekundaer-Feature.
- **E3** Erweiterung des Templates-Modals (Footer-Bereich) — recycelt Auto-Variable-System, aber Templates pasten *in* Sessions und Docs-Sync *startet* eine neue. Konzeptionelle Vermischung.
- **P1** Hartcodierter Prompt in neuem Modul (gewaehlt) — Prompt ist implementation detail, kein User-Customization-Punkt. Analog zur K1-Entscheidung aus Season 19 (Easter-Egg-Werk-Set hartcoded).
- **P2** Template-Datei `_DOCS_SYNC.md` im Workspace, User-editierbar — maximal flexibel, aber Default-Magie schwer zu pflegen (User editiert nach Update → driftet).
- **P3** Hartcoded-Default + Settings-Override-Feld — beide Welten, aber Configuration-Surface fuer ein selten genutztes Feature.
- **S1** Status-Block direkt unter dem Docs-Sync-Trigger im Modal (gewaehlt) — Status da, wo die Aktion ist; kein zweites Panel.
- **S2** Eigenes Panel in der Right-Pane oder Stats-Pane-Tab — mehr Sichtbarkeit, grosser UI-Touch fuer Sekundaer-Feature.
- **S3** Kein UI-Status, nur `docs/SUMMARIES/`-Ordner — verletzt die Roadmap-Vorgabe „UI fuer Summary-Status pro Datei".
- **H1** SHA-256-Hash im Summary-Frontmatter (gewaehlt) — robust, idempotent, immun gegen mtime-Touch durch unrelated Tools.
- **H2** mtime-Vergleich Original vs. Summary-File — einfacher, aber unzuverlaessig (jeder Editor-Open-Save touch´t mtime).

**Grund:** E1 hat das niedrigste Friction-Level: die Session-Type-Buttons sind im Modal schon vorhanden, das `docs-sync`-Enum existiert seit Migration 0005 (Phase-2-Season-5), nur die Funktion fehlte. E2 produziert ein Sichtbarkeits-Problem („Badge mahnt staendig") fuer ein Feature, das eher woechentlich/monatlich genutzt wird als taeglich. E3 vermischt zwei Konzepte (Send-in-Session vs. Start-Session) und macht das Templates-Modal zur Hybrid-UI. P1 vermeidet die User-Last, den Prompt-Wortlaut zu pflegen — falls eine kuenftige Claude-Version das verlangte Frontmatter-Format anders bekommt, wandert die Anpassung in eine TakumiDeck-Code-Aenderung, nicht in eine vergessene Template-Datei in jedem Projekt. P2 wuerde zwei Versions-Quellen schaffen (in-app vs. in-project) und Drift-Bugs nach App-Update wahrscheinlich machen. S1 haelt das Modal kohaerent — der User sieht Auswahl + Status in einer Spalte, ohne den Blick zu zerteilen. Beim mtime-Pfad (H2) reicht es, dass eine Editor-Session die Original-Datei einmal speichert, ohne Inhalt zu aendern, um die Summary unguenstig als „veraltet" zu markieren — das Frontmatter-Hash-Pattern verhindert das deterministisch. SHA-256 ist hier overkill fuers Sicherheits-Argument, aber als Stable-Content-Fingerprint genau richtig.

**Konsequenz:** Bei kuenftigen Doku-Files (z.B. eine fuenfte zu komprimierende Datei) wird `DOCS_SYNC_FILES` in `src/shared/docs-sync.ts` um einen Eintrag erweitert — kein UI-Refactor noetig, der Status-Block iteriert ueber das Array. Falls der Prompt-Wortlaut sich aendern muss (neue Claude-Version oder neues Frontmatter-Format), passiert die Aenderung in `buildDocsSyncPrompt`. Falls der User irgendwann doch eine editierbare Prompt-Vorlage will (= P2-Migration), ist `buildDocsSyncPrompt(selectedFiles)` schon das passende Schnitt-Interface — eine Settings-Property `docs_sync_prompt_override?: string` koennte den Default ueberschreiben, ohne den Modal-/IPC-Pfad zu beruehren. Der Auto-Send mit 2,5 s Warmup ist ein Schaetzwert; falls Claude in einer kuenftigen Version laenger zum TUI-Init braucht oder einen reproducible Ready-Marker liefert, sollte der setTimeout durch ein State-Detection-Event ersetzt werden.

**Implementierungsdetail:** Der Frontmatter-Parser ist bewusst einfach gehalten (Zeile-fuer-Zeile `key: value`-Lookup mit Anfuehrungszeichen-Stripping), kein gray-matter — die Summary-Files haben nur drei flache String-Felder. Bei BOM am Datei-Anfang wird `charCodeAt(0) === 0xfeff` vor dem `startsWith('---')`-Check defensiv abgestreift, damit Summary-Dateien mit Encoding-Header (selten, aber moeglich) nicht faelschlich als „kein Frontmatter" klassifiziert werden. `parseSummaryFrontmatter` returnt `null` bei fehlendem oder unvollstaendigem Block, `computeFileSyncStatus` faengt das ab und klassifiziert als `stale` — die Sync-Session korrigiert das beim naechsten Lauf.

---

## Top-N für Template-Auto-Variablen: Sub-Objekt im neuen Templates-Tab, IPC liest Settings frisch (F2+T2+I2)

**Entscheidung:** Die zwei Top-N-Werte fuer `{{TECH_SCHULDEN_RELEVANT}}` und `{{LETZTE_ENTSCHEIDUNGEN}}` leben als Sub-Objekt `template_top_n: { schulden, entscheidungen }` im `AppSettings`-Schema (F2), die UI bekommt einen eigenen „Templates"-Tab im Settings-Modal (T2), und der `templates:resolve-auto-vars`-IPC liest die Werte pro Call frisch via `settings.read()` (I2) statt sie als Payload-Argument oder DI-Cache zu beziehen.

**Varianten:**

- **F1** Zwei flache Felder `template_schulden_top_n` + `template_entscheidungen_top_n` — Roadmap-Wortlaut, klarste Benennung, groesste Schreibarbeit.
- **F2** Sub-Objekt `template_top_n: { schulden, entscheidungen }` (gewaehlt) — folgt etabliertem Muster aus Season 17 (`screenshot_retention`) und Season 8 (`context_soft_warning`), erweiterbar fuer kuenftige Top-N-Variablen.
- **F3** Ein gemeinsamer Wert fuer beide — minimal, verliert die Trennbarkeit.
- **T1** Workspace-Tab (Roadmap-Vorschlag) — kein neuer Tab, aber thematisch unsauber (Workspace ≠ Template-Verhalten).
- **T2** Neuer „Templates"-Tab (gewaehlt) — saubere Heimat, Platz fuer kuenftige Template-Settings.
- **T3** Allgemein-Tab — niedrigster Aufwand, verstaerkt aber den „Allgemein wird zum Sammelbecken"-Drift.
- **I1** Renderer schickt die zwei Werte im IPC-Payload mit — Schema-Touch am Payload, IPC stateless.
- **I2** Main liest `settings.read()` pro Call frisch (gewaehlt) — kein Payload-Schema-Touch, eine zusaetzliche JSON-Read pro Call (wenige ms, kein Hot-Path).
- **I3** Settings-Cache an `registerTemplatesIpc(deps)` injecten — explizite DI, am wenigsten flexibel bei Live-Updates.

**Grund:** F1 wuerde zwei Top-Level-Felder mit demselben Praefix produzieren (`template_*`), die ohnehin nach einem Sub-Objekt schreien — und die Roadmap-Wortlaut-Treue ist hier Vorschlag, nicht Vertrag (analog zur Season-19-K1-Entscheidung gegen den Roadmap-Wortlaut „konfigurierbare Werk-Liste"). F3 macht den Punkt kaputt, dass User typischerweise *unterschiedlich viel* Schulden- vs. Entscheidungs-Kontext im Prompt haben wollen (Schulden sind oft punktuell relevant, Entscheidungen baseline-Kontext). T1 packt Template-Verhalten in einen Workspace-Tab, der eigentlich Workspace-Pfad und Sensitive-Patterns abdeckt — thematische Vermischung. T3 wuerde den Allgemein-Tab zum vierten Sammelbecken-Eintrag machen (Theme/Akzent/Easter-Egg/Screenshot-Retention sind dort schon, plus jetzt Templates waere zu viel). T2 ist der „konvenient vor traditionell"-Default — eigener Tab, der mit den zwei Feldern startet und kuenftige Template-Settings ohne Refactor aufnimmt. I1 wuerde den `TemplatesResolveAutoVarsInput`-Schema unnoetig erweitern und der Renderer muesste die zwei Werte aus seinem `settings`-Prop bei jedem Send-Klick mitgeben — Code-Duplikation. I2 nutzt das etablierte „Boot/IPC liest Settings frisch"-Pattern aus Season 17 (Boot-Pass fuer Screenshot-Retention) — sauber und sofort live.

**Konsequenz:** Bei kuenftigen Template-Settings (z.B. „Auto-Submit nach Paste ein/aus", „Default-Modell pro Template-Kategorie") landet alles im selben Tab ohne Tab-Refactor. Bei kuenftigen Doku-Top-N-Variablen (z.B. `{{LETZTE_CHANGELOG_EINTRAEGE}}`) waechst das `template_top_n`-Sub-Objekt um ein weiteres Feld — Schema- und UI-Aenderung an drei Stellen (Schema, Default, UI), aber kein Tab-Split. Der I2-Pattern „IPC liest Settings frisch" sollte beibehalten werden, solange der Settings-Read keine spuerbare Latenz erzeugt — falls Templates-Send mal zum Hot-Path wird (was aktuell nicht der Fall ist, weil User-getriggert), waere ein In-Memory-Settings-Cache ueberlegenswert.

**Implementierungsdetail:** Der IPC short-circuited bei `topN.schulden === 0` (bzw. `topN.entscheidungen === 0`) auf `''` *vor* dem Datei-Read. Begruendung: wer die Variable abschaltet, will keinen Disk-I/O fuer das Doku-File auslosen — bei einer 50-KB-`TECH_SCHULDEN.md` ist das kein Performance-Problem, aber semantisch klarer als „lies die Datei, slice auf 0 Eintraege, formatiere zu leerem String". Pure Helper `formatTechSchuldenRelevant`/`formatLetzteEntscheidungen` haben das `limit <= 0`-Guard ohnehin schon — der Short-Circuit ist redundante Defense-in-Depth, aber kostet nichts und macht den IPC-Code lesbarer.

---

## Easter-Egg-Vergleiche: Minimal-Slot statt Custom-Werk-Liste (U1+K1+D1)

**Entscheidung:** Easter-Egg-Vergleiche leben als dezenter Streifen unter der Aktivitaets-Heatmap (U1), die Werk-Liste ist hartcodiert mit Toggle-only-Konfiguration (K1), und der Token-Counter zieht den bestehenden `tokens_total` aus `stats:project-overview` (D1) — keine eigene Backend-Query.

**Varianten:**

- **U1** Streifen unter der Heatmap (gewaehlt) — eine Zeile, factor-desc-sortiert, Top-3-Werke.
- **U2** Neunte Mini-Card im 2×4-Grid — rotiert pro Stats-Refresh durch die Werk-Liste.
- **U3** Eigene Pille in der Action-Bar — neben dem Status-Badge mit Tooltip-Detail.
- **K1** Nur Toggle in den Settings, Werk-Liste hartcoded (gewaehlt).
- **K2** Voll editierbare Liste im Settings-Modal — Add/Remove/Name+Token-Count+Aktiv-Toggle pro Eintrag.
- **K3** Toggle plus Raw-JSON-Editor-Override fuer Power-User.
- **D1** Bestehender `tokens_total` aus dem Stats-Overview (gewaehlt) — Scope+Range automatisch dabei.
- **D2** Eigene Lifetime-Query — immer global, ignoriert Scope/Range.

**Grund:** U2 wuerde die 2×4-Symmetrie der Card-Grid sprengen oder eine echte Datums-Card kosten, was den Easter-Egg ueber seinem Wertbeitrag positioniert. U3 reisst die Daten-Hierarchie auseinander — Token-Statistik gehoert in die Stats-Pane, nicht in den Action-Bar-Status-Bereich, der sonst nur PTY-Lifecycle-Signale traegt. U1 sitzt thematisch im Stats-Kontext, nutzt den `usage:update`-Push-Pfad gratis mit und passt zum „dezent, aber sichtbar"-Stil aus dem Reset-Footer von Season 16. K2 + K3 bauen Configuration-Surface fuer ein spielerisches Feature, das per Definition vom Ueberraschungs-Moment lebt — sobald der User eine Werk-Liste pflegen muss, ist es kein Easter-Egg mehr, sondern ein Setting. K1 trifft das Format am genauesten und laesst dem K2-Aufholpfad explizit Raum, falls der erste User-Wunsch nach eigenem Werk auftaucht. D2 waere ein zusaetzlicher IPC-Pfad fuer eine Spielerei — Aufwand-Risiko-Verhaeltnis stimmt nicht, und der Storytelling-Wert ist mit Scope/Range-Toggles („~0.5× LotR in 7 Tagen") sogar groesser als mit einer starren Lifetime-Zahl.

**Konsequenz:** Werk-Liste lebt in `src/shared/easter-egg-works.ts` als `DEFAULT_EASTER_EGG_WORKS`-Konstante; Pure-Logik akzeptiert eine optionale `works`-Liste als Parameter, sodass die K2-Migration spaeter nur Settings-Schema + UI braucht — die Compute-Logik bleibt unveraendert. Stats-Pane bekommt ein neues Boolean-Prop `easterEggEnabled` statt das ganze `settings`-Objekt, weil aktuell genau ein Feature-Flag konsumiert wird; bei mehr Pane-spezifischen Settings koennte das auf `settings={settings}` zurueckschalten.

**Implementierungsdetail:** Filter-Schwelle `factor >= 0.1` (= mindestens ein Zehntel des Werks geschrieben) statt eines absoluten Token-Cutoffs. Begruendung: relative Schwellen skalieren mit der Werk-Liste (ein neues Werk mit 50k Tokens fliegt nicht automatisch in einen anderen Bucket als die existierende 1M-Token-Bibel), und der „0.0…× Hobbit"-Edge-Case ist eher erniedrigend als spielerisch. Sort nach `factor` desc statt nach Werk-Index, damit bei wachsendem Verbrauch nicht permanent Der Hobbit obenhin steht — die Liste wandert organisch von „0.5× Hobbit" am Anfang zu „50× Hobbit, 10× LotR, 8× Krieg-und-Frieden" spaeter. Format-Heuristik (`< 10` → eine Nachkommastelle, `>= 10` → Ganzzahl) statt fester Nachkommastelle, weil „31.4× LotR" eine Messgenauigkeit suggeriert, die der Easter-Egg nicht hat.

---

## First-Start-Workspace-Wizard: Erledigt-Flag in den Settings (Variante A)

**Entscheidung:** Der Wizard wird ueber ein neues Boolean-Feld `workspace_wizard_completed` in den Settings detektiert, nicht ueber das Fehlen der `settings.json`-Datei. `buildDefaultSettings()` setzt den Default auf `true` (Bestandsuser-sicher), und `SettingsStore.initialize()` ueberschreibt das nur bei einer wirklich frisch angelegten Datei explizit mit `false`.

**Varianten:**

- **A** Erledigt-Flag in den Settings (gewaehlt) — Default-`true` im Build, Initialize-Branch schreibt `false` bei frischer Datei.
- **B** Sentinel-`null` im `workspace_path` — Schema-Change auf nullable, `pickDefaultWorkspacePath` raus, Boot skippt bei `null`.
- **C** Settings erst nach Wizard-Submit schreiben — Roadmap-Wortlaut buchstabengetreu („settings.json existiert noch nicht"), Initialize-Flow muss alle Read-Konsumenten lazy machen.

**Grund:** B zieht einen Schema-Refactor durch alle `workspace_path`-Konsumenten nach sich (Scanner, Settings-Tab, IPC-Defaults), plus eine zweite Sentinel-Konvention fuer den Skip-Pfad (leerer String vs. `null`) — sonst kommt der Wizard nach Skip beim naechsten Start zurueck. C ist semantisch am reinsten, aber der Boot-Flow (Default-Project-Ensure, Watcher, Retention-Pass) liest unmittelbar nach `SettingsStore.initialize` aus `settings.read()` — alle diese Pfade brauchten einen „noch nicht persistiert"-Modus oder muessten hinter den Wizard verzoegert werden. Hoechstes Regressions-Risiko bei nur marginalem semantischen Mehrwert. A bekommt das UX-Ziel (kein stiller Scan, expliziter User-Entscheid) bei minimaler Code-Beruehrung und ohne Migrations-Schmerz fuer Bestandsuser.

**Konsequenz:** Der Roadmap-Wortlaut „Erkennung: `settings.json` existiert noch nicht" wird nicht buchstabengetreu umgesetzt — funktional gleichwertig, weil das Flag genau diesen Moment in den Settings festhaelt. Bei kuenftigen „nur beim ersten Start"-Features (z.B. Tour, Tutorial-Overlay) ist das Flag-Pattern jetzt etabliert und wiederverwendbar; eine zweite Variante des Detection-Mechanismus sollte gut begruendet sein.

**Implementierungsdetail:** Asymmetrischer Default (`true` in `buildDefaultSettings`, `false` nur beim Initialize-Frisch-Pfad) statt eines symmetrischen Migrations-Steps. Symmetrisch waere gewesen: Default `false` plus ein expliziter Migrations-Pass in `SettingsStore.initialize`, der bei existierender Datei ohne Feld `true` reinpatcht und die Datei neu schreibt. Asymmetrie ist billiger (kein zweiter Disk-Write bei jedem Start mit alter Datei), unauffaelliger (Bestandsuser sehen ihre `settings.json` nicht angepasst) und faengt einen Edge-Case ab: User loescht das Feld manuell, um den Wizard nochmal zu sehen — bei symmetrischem Migrations-Pass haetten wir das beim Start sofort wieder ueberschrieben, bei der asymmetrischen Loesung greift der Default-Merge in `read()` und der Wizard bleibt zu (= konsistentes Verhalten, weil Edit-Datei-zur-Wizard-Reaktivierung kein erwartetes UX-Flow ist).

Neuer IPC `app:pick-folder` wurde bewusst generisch gehalten (`AppPickFolderInput { title? }` / `AppPickFolderResult { canceled, path }`) statt als wizard-spezifischer Channel — der Settings-Workspace-Tab kann denselben Picker spaeter mitnutzen, ohne einen zweiten Channel zu brauchen.

---

## Screenshot-Retention: Boot-One-Shot + Settings-Slot von Anfang an + Manual-Clear

**Entscheidung:** Auto-Retention laeuft genau einmal beim App-Start hinter try/catch (Variante A1). Schwellen leben in `AppSettings.screenshot_retention` als zwei Number-Felder (`max_age_days`/`max_total_mib`, Defaults 30/500, Variante B2) statt hartcodierter Konstanten. Plus Manual-Clear-Button im Settings-Modal mit Doppel-Confirm und Live-Anzeige der aktuellen Belegung (Variante C2).

**Varianten:**

- **A1** Boot-One-Shot (gewaehlt) — einmal pro App-Start, analog zum Season-15-JSONL-Backfill.
- **A2** Boot + periodischer Tick — zusaetzlich alle paar Stunden waehrend die App laeuft.
- **A3** Lazy nach jedem `fs:save-screenshot` — Cap-Check bei Speicher-Vorgang.
- **B1** Hartcodierte Konstanten im Retention-Modul — Roadmap-Wortlaut, Settings-Slot „sobald empirisch noetig".
- **B2** Settings-Slot von Anfang an (gewaehlt) — zwei Number-Felder im AppSettingsSchema, UI im „Allgemein"-Tab.
- **B3** Hartcodiert plus Hidden-Override via settings.json ohne UI.
- **C1** Kein Manual-Clear-Button — Auto-Retention reicht erstmal.
- **C2** Manual-Clear-Button im „Allgemein"-Tab (gewaehlt) — Anzeige + Doppel-Confirm, neben Open-Data-Folder.
- **C3** Sammel-„Cache leeren"-Button fuer mehrere `<userData>`-Ordner.

**Grund:** **A1** weil Disk-Verbrauch ueber Tage/Wochen akkumuliert, nicht innerhalb einer Session — periodischer Tick lohnt nicht, solange das nicht empirisch wehtut. Die App wird im Daily-Use ohnehin haeufig neugestartet (Dev-Mode-HMR + Production-Beenden). A3 misst nur bei Aktivitaet und reagiert auf das Symptom, nicht auf das Disk-Wachstum als solches. **B2** statt B1 (Roadmap-Empfehlung) auf User-Trigger: weil das Settings-Modal-UI fuer den Manual-Clear-Button (C2) ohnehin aufgemacht wird, koennen die zwei Schwellwert-Felder direkt mitgezogen werden. „Wenn du eh in Settings arbeitest, kann man das direkt mitziehen." Vermeidet die spaetere Settings-Schema-Versionierungs-Falle, weil das Feld jetzt schon im Vollschema steht. **C2** statt C1 (Roadmap-Default) gibt dem User sofort den „jetzt aufraeumen"-Hebel, der die Auto-Retention im Daily-Use ergaenzt — Auto-Retention laeuft nur beim Boot, Live-Cleanup-Wunsch entsteht aber spontan. C3 (Sammel-Button fuer logs/cache/screenshots) wurde abgelehnt, weil der Scope-Bereich („was wird mit-geloescht") nicht im aktuellen Use-Case zwingend ist und das Risiko bringt, versehentlich Log-Dateien zu loeschen.

**Konsequenz:** Pure Logik `computeRetentionPlan` in `src/main/screenshots/retention.ts` ist zweistufig: zuerst Age-Cutoff (strict `mtimeMs < cutoff`, damit Files genau am Schwellwert noch ueberleben), dann Cap-Cut auf den Survivors mit `mtimeMs` ASC + `filePath` ASC als Tie-Break (deterministisch fuer Tests). `runScreenshotRetention` mit `ScreenshotRetentionFsDriver`-Injection fuer Tests. `summarizeScreenshots` und `clearAllScreenshots` als eigene Helpers fuer die zwei IPCs. Boot-Wiring liest `settings.read()` bei jedem App-Start frisch, damit eine geaenderte Schwelle ohne App-Restart fuer den naechsten Boot wirksam ist (Wirksamkeit erst beim *nachfolgenden* Boot ist akzeptabel — sonst muesste der Watcher die Retention triggern, was die Boot-One-Shot-Semantik verlaesst). Beide Schwellen auf `0` ist explizit als „Auto-Retention aus" dokumentiert; der Manual-Clear-Button bleibt unabhaengig nutzbar.

**Implementierungsdetail:** Doppel-Confirm-Pattern bewusst INLINE im Settings-Modal geschrieben (3. Inline-Aufrufer nach `HistoryActionModal` + `RemoveProjectModal`). Der TECH_SCHULDEN-Eintrag #2 hatte „beim dritten Aufrufer" als Refactor-Trigger benannt — die Extraktion wurde trotzdem deferred, weil sie die Season-Scope-Grenze (Retention-Modul + Schema + zwei IPCs + UI-Block + Tests) reisst und der Pflege-Schmerz erst beim *vierten* Aufrufer akut wird (drei Aufrufer mit identischem Pattern-Body sind noch handhabbar). TECH_SCHULDEN-Eintrag wird auf „Trigger erreicht, Extraktion deferred bis 4. Aufrufer" aktualisiert.

## 5h-Bar: Session-Block-Aggregat statt Rolling-Countdown

**Entscheidung:** Das 5h-Limit laeuft als echter Anthropic-Session-Block. Das Window startet beim ersten Token nach dem letzten Block-Ende, summiert genau `window_hours` Stunden lang und faellt am Block-Ende schlagartig auf 0 — keine rolling-Aggregation mehr ueber „letzte 5h ab jetzt". Neues optionales Schema-Feld `LimitBar.aggregation_mode` (`rolling` | `session_block`); Default-by-Convention im Resolver: `window_hours <= 6` → `session_block`, sonst `rolling`.

**Varianten:**

- **A1** Rolling-Window mit Countdown ab aeltestem Token — Window bleibt die letzten 5 h ab jetzt, Countdown zeigt wann der aelteste Bucket rausfaellt.
- **A2** Echtes Session-Window (gewaehlt) — fixer 5h-Block ab erstem Token, schlagartiger Reset am Block-Ende.
- **A3** Statischer Label „rolling 5 h" — kein Countdown, kein Block-Bewusstsein.

**Grund:** A1 reduziert das Risiko „ins Limit laufen ohne es zu merken" nicht. Beispiel: erster Token um 10:00, zweiter um 11:00 (Total 2k). Bei A1 sagt der Countdown um 13:00 „in 2 Std." (Bucket 10:00 faellt um 15:00 raus), und der Bar-Wert schwindet schrittweise pro Stunde — der User glaubt, er habe Luft, weil der Counter sinkt. In Wahrheit summiert Anthropic den Block 10:00–15:00 als Einheit und kassiert ab 2k weiter weg, bis der Block faellt. A2 spiegelt genau diese Realitaet: der Counter zeigt waehrend des gesamten Blocks denselben Wert, sodass der User die echte Verbrauchs-Distanz sieht. A3 waere die billigste Variante, verfehlt aber den User-Wunsch nach Countdown. User-Trigger nach Live-Test: „A1 wuerde dazu fuehren, dass ich eventuell ins 5h-Limit laufe ohne es zu merken und Extra-Kosten verursacht die nicht gewollt sind." → A2 als einzig sichere Variante.

**Konsequenz:** Der Resolver bekommt einen dritten Aggregations-Pfad (`session_block` neben `rolling` und `reset_schedule`). `UsageWindowResult` traegt zwei zusaetzliche Felder `windowStartAt`/`windowEndAt`, die der Renderer fuer den Reset-Footer braucht. Bucket-Iteration laeuft ueber einen Lookback von `2 × window_hours` — bei jetzt aktivem Block ist er hoechstens `window_hours` alt, doppelte Spanne deckt den Grenz-Fall (now liegt am Anfang einer Stunde) ab. Die Sprint-5-Bestandstests (`make5hBar` in `usage-aggregation.test.ts`) wurden auf `aggregation_mode: 'rolling'` fixiert, damit ihre Original-Intention (Rolling-Aggregation) erhalten bleibt — Session-Block-Pfad wird separat in `reset-schedule.test.ts` gegen synthetische Buckets geprueft.

**Implementierungsdetail:** Default-by-Convention statt Settings-Migration. Hintergrund: die bestehende 5h-Bar in jeder User-Settings-Datei hat keinen `aggregation_mode`-Eintrag, weil das Feld neu ist. Wir koennten eine Settings-Migration schreiben, die das Feld bei `window_hours <= 6` nachtraegt — das waere aber eine Side-Effect-Migration auf User-Konfiguration ohne klaren Mehrwert. Stattdessen leitet der Resolver bei fehlendem Feld die Convention aus `window_hours` ab; der User kann via JSON-Editor explizit `'rolling'` setzen, wenn er das alte Verhalten zurueck will.

## Cache-Hit-Statistik: Full-DELETE-Migration statt Lazy-on-Touch oder Kein-Backfill

**Entscheidung:** Migration 0008 fuegt `messages.tokens_cache_creation` + `messages.tokens_cache_read` hinzu und leert anschliessend `messages`, `usage_buckets` und `jsonl_offsets`. Beim naechsten App-Start liest der Watcher (`ignoreInitial:false`) alle existierenden JSONL-Dateien neu von Offset 0 und schreibt die getrennten Cache-Anteile mit. Migration laeuft genau einmal via `PRAGMA user_version`.

**Varianten:**

- **B1** Full-Rescan via Migration-DELETE (gewaehlt) — historische Cache-Hit-Rate ab Tag 1 verfuegbar, einmaliger Boot-Spike beim Erst-Lauf nach Update.
- **B2** Lazy on-touch — Watcher rescannt nur die Files, die nach Migration noch einmal beruehrt werden. Sessions ohne neue Aktivitaet bleiben unaufgeschluesselt.
- **B3** Kein Backfill — Cache-Hit-Rate gilt nur ab Migrationszeitpunkt; UI braucht einen „Daten ab MM-TT"-Hinweis.

**Grund:** B1 ist Roadmap-konformer Pfad und liefert exakte Aggregate ab Tag 1. Boot-Spike ist einmalig (mehrere Sekunden bei realistischen Datenmengen), absorbierbar unterhalb der wahrgenommenen Schwelle. Der Use-Case ist exakt die historische Frage „wie viel Cache hatte ich rueckblickend" — B2 wuerde die Antwort auf „nur fuer die Sessions, die nach Update noch geprompted haben" verkruepeln. B3 waere Null-Risiko, verlangt aber UI-Polish fuer den „Daten ab"-Hinweis und macht die ersten Wochen nach Update unbrauchbar fuer 30d/7d-Range-Filter in der Modelle-View. Die User-Base ist klein (eine Person aktiv), das Risiko des Boot-Spike ist messbar, der Mehrwert „Hit-Rate sofort akkurat" ist klar.

**Konsequenz:** Migration ist destruktiv — alle bestehenden `messages`-Rows werden geloescht. Pre-Hotfix-Sessions OHNE JSONL-Datei (dauerhaft resume-tot seit Sprint 6) verlieren ihre `tokens_in`/`tokens_out`-Aggregate, weil der Re-Scan keine Quelle dafuer hat. Dokumentiert in TECH_SCHULDEN. `tokens_in` bleibt aus Backward-Compat-Gruenden die Summe der drei Anteile — alle Aggregate aus Season 12/13/14 (`stats:project-overview`, `stats:heatmap`, `stats:models`) bleiben ungeschoren. Neue Spalten sind additive Info; das Repository-Layer berechnet `cache_hit_rate = tokens_cache_read / tokens_in` daraus.

**Implementierungsdetail:** Migration 0008 setzt die Spalten `NOT NULL DEFAULT 0`, damit Bestands-Rows (sollten welche durch den DELETE rutschen) saubere Default-Werte haben. Cache-Hit-Rate in der Modelle-View landet als fuenfte Tabellen-Spalte plus Gesamt-Zahl oben — bewusst NICHT als neunte Stats-Card im Uebersichts-Tab (Variante C1 aus den UI-Achsen), weil das den in Season 13 ausgemessenen 4×2-Cards + Heatmap-Layout aufbrechen wuerde fuer eine einzelne Effizienz-Kennzahl, die thematisch ohnehin zur Modelle-View gehoert (Cache-Verhalten ist Modell-abhaengig — Sonnet/Opus cachen anders, lange Prompts cachen anders als kurze).

## Wochen-Reset-UI: Globale Einstellung statt Per-Bar, JSON-Editor als Fallback

**Entscheidung:** Im Token-Tracking-Tab erscheint ein einzelner Block „Wochen-Reset" (Wochentag-Dropdown + Stunden/Minuten-Input). Beim Apply wird `reset_schedule` einheitlich in alle `limit_bars` mit `window_hours >= 168` geschrieben. Per-Bar-Drift bleibt ueber den Raw-JSON-Editor weiter unten moeglich.

**Varianten:**

- **B1** Globale Einstellung (gewaehlt) — eine Reset-Zeit fuer alle Wochen-Bars, schreibt das Schema in jede Wochen-Bar einheitlich.
- **B2** Pro Bar einstellbar in der UI — eigene Reset-Zeile pro Wochen-Bar (`Woechentlich · alle Modelle`, `Woechentlich · Nur Sonnet` etc.), mehr Form-Felder.
- **B3** Kein UI, nur JSON — Status quo, User pflegt `reset_schedule` im JSON-Editor.

**Grund:** B1 spiegelt den Daily-Use-Realfall: Anthropic resettet alle Plan-Limits zur selben Zeit, also haben beide Wochen-Bars (`weekly_all`, `weekly_design` etc.) denselben Reset-Anker. Eine globale Einstellung deckt 100 % des Standard-Use-Cases mit minimaler UI-Komplexitaet. B2 waere die explizite Variante, fuegt aber drei Form-Felder pro Wochen-Bar hinzu — bei drei Bars sind das neun zusaetzliche Inputs fuer einen Fall, der im Daily-Use praktisch nie eintritt. B3 ist die Variante, die der User bisher hatte und die er explizit ablehnt („wäre dafür am besten in den Einstellungen ein Menüpunkt"). Per-Bar-Drift im Daily-Use ist trotzdem moeglich: wer eine Bar mit anderem Reset-Zeitpunkt will, editiert sie im Raw-JSON-Editor weiter unten — der Hinweistext dort dokumentiert beide neuen Felder (`reset_schedule` + `aggregation_mode`).

**Konsequenz:** Die UI-Komponente liest den existierenden `reset_schedule` der ersten Wochen-Bar als Default-Wert (Fallback auf Mo 00:00). Beim Setzen wird das Patch als komplettes `limit_bars`-Array geschrieben (Auto-Save-Pipeline ersetzt das Array atomar). Wer per JSON-Editor pro Bar abweichend einstellt, bekommt beim naechsten globalen UI-Apply die Werte wieder einheitlich gezogen — das ist die UI-Semantik, kein Bug. Wenn das jemals stoert, fuegt eine spaetere Season B2 als zweite Form-Tiefe hinzu (eine Checkbox „Pro Bar einstellen" oeffnet pro Wochen-Bar eigene Felder), oder die globale Einstellung wird durch ein „Werte uebernehmen"-Knopf opt-in gemacht statt automatisch zu schreiben. Aktuell ist kein Trigger dafuer da.

---

## JSONL-Live-Polling: Per-Session-Timer parallel zu chokidar, kein Global-Single-Timer

**Entscheidung:** Live-Token-Updates kommen aus einem zweiten Pipeline-Pfad parallel zu chokidar: pro „aktive" Session laeuft ein eigener 250-ms-Timer mit `fs.stat`-Diff auf `mtimeMs`+`size`. Bei Aenderung pusht der Timer in den public `JsonlWatcher.notifyChanged`-Hook, der die bestehende `scheduleHandle`-Anti-Reentrancy-Pipeline nutzt. chokidar bleibt fuer `add`-Events und externe Sessions zustaendig.

**Varianten:**

- **A** Per-Session-Timer (gewaehlt) — pro `pty:create`/Resume ein `setInterval`, pro terminalem Lifecycle-Wechsel `clearInterval`.
- **B** Global-Single-Timer — ein einziger 250-ms-Tick iteriert alle aktiven Sessions, ein Repo-Query pro Tick.
- **C** Status-getrieben — Timer nur waehrend `running` (TUI-State); idle/waiting/permission-prompt schalten ab.

**Grund:** A hat den saubersten Lebenszyklus pro Session — `attach`/`detach`-Calls sitzen an den IPC-Stellen, an denen ohnehin schon Lifecycle-Transitions passieren (pty:create, pty:exit, session:close, session:archive, session:resume). Das macht den Polling-Ring in den IPC-Handlers sichtbar und leicht zu debuggen. B spart Timer-Verwaltung, koppelt aber alle Sessions an eine pro-Tick-Repo-Query (`listByStatus`) — wenn ein Tick lange braucht (z.B. SQLite-Lock waehrend Backup), driften alle Sessions im selben Tempo. C waere theoretisch billigster Footprint, koppelt aber den Polling-Pfad an die Phase-2-Season-1-TUI-State-Detection — die hat selbst eine ~2-s-Latenz und wuerde im Worst-Case die letzten Token-Pushs einer Session verschlucken. Bei 4–6 aktiven Sessions im Daily-Use kostet A vier bis sechs `fs.stat`-Calls alle 250 ms; vernachlaessigbar gegenueber dem Mehrwert von Live-Token-Bars waehrend laufender Antworten.

**Konsequenz:** Der Ring teilt die `scheduleHandle`-Anti-Reentrancy-Map und den `jsonl_offsets`-Tail mit chokidar — beide Pipelines konvergieren in `JsonlWatcher.handleFile`. Wenn ein chokidar-change und ein Polling-Tick gleichzeitig kommen, serialisiert die `inFlight`-Map sie pro File. Lifecycle-Hooks sind explizit in pty/session-IPC verdrahtet (fuenf Call-Sites) statt ueber ein Event-System in `SessionLifecycle` — die fuenf Stellen sind im Code direkt lesbar, das Event-System haette nur Indirection ergeben.

## JSONL-UUID-Mapping: sessions.jsonl_path-Spalte, keine eigene claude_session_links-Tabelle

**Entscheidung:** Die Bindung TakumiDeck-Session ↔ claude-JSONL-Datei wandert in eine neue Spalte `sessions.jsonl_path` (Migration 0007) plus partiellen Index `idx_sessions_jsonl_path`. Watcher-Resolver bekommt eine neue erste Stufe `findByJsonlPath` vor dem Season-9-UUID-Match. `pty:create` befuellt die Spalte direkt beim Spawn aus dem deterministischen `expectedJsonlPath`-Helper.

**Varianten:**

- **A** Eigene Tabelle `claude_session_links (takumi_session_id, claude_session_id, file_path)` mit Indizes — Roadmap-literal aus PHASE2.md.
- **B** Neue Spalte `sessions.jsonl_path` (gewaehlt) — Migration 0007, schlanker Match-Pfad.
- **C** Status quo + Spawn-Time-First-JSONL-Read fuer externe Sessions ohne `--session-id`.

**Grund:** B haengt den Pfad direkt an die Session-Row — kein zusaetzlicher Join im Watcher-Hot-Path, gleicher Index-Lookup-Aufwand wie A, aber ohne Schema-Topologie-Aufblaehung. A waere die roadmap-literale Variante, baut aber einen Side-Table-Mechanismus fuer Daten, die zur 1:1-Lebenszyklus-Relation der Session gehoeren (`jsonl_path` haengt 1:1 an einer Session, nicht n:m). Wenn jemals eine zweite claude-Session-Datei pro TakumiDeck-Session noetig wuerde (Multi-Pfad-Replay), waere A vorteilhaft — bis dahin ist B die einfachere Form. C waere ein Minimal-Patch, deckt aber den Hauptzweck — die `jsonl_path`-Indirection sparen, statt jedes Tick einen Filename-Parse zu machen — nicht ab.

**Konsequenz:** Resolver hat drei Stufen (Pfad → UUID → cwd) statt Season-9-zwei. Pre-Patch-Sessions bekommen den Pfad ueber den Watcher-Backfill nachgetragen (gleicher Mechanismus wie `setClaudeSessionId` aus Sprint-6-Hotfix). Der partielle Index `WHERE jsonl_path IS NOT NULL` haelt sich klein. Wenn Phase 3 doch eine n:m-Bindung verlangt (z.B. Multi-Replay), kommt eine `claude_session_links`-Tabelle hinzu und `jsonl_path` wird zur 1:1-Quick-Path-Optimierung neben dem Side-Table — kein Schema-Rueckbau noetig.

## JSONL-Backfill: Boot-One-Shot mit Settings-Flag, kein On-Demand-Pfad

**Entscheidung:** Resume-tote Multi-Session-Bestaende werden in einem einmaligen Pass beim App-Start nachgezogen. Pro cwd-Bucket Files nach `mtime` und Sessions nach `started_at` sortieren, paarweise zuordnen. Flag `backfill_jsonl_link_v1=done` in der SQLite-`settings`-KV-Tabelle verhindert Re-Run.

**Varianten:**

- **A** Boot-One-Shot (gewaehlt) — einmal pro Installation, ~200–500 ms Boot-Latenz beim Erst-Lauf.
- **B** On-Demand-pro-Projekt-Klick — Backfill erst beim ersten Click auf ein betroffenes Projekt.
- **C** Manueller Settings-Button — User triggert den Pass selbst.

**Grund:** A erledigt die Inkonsistenz im Erst-Lauf-Boot, bevor der User die Sidebar sieht — das HistoryPane zeigt sofort die korrekten Resume-Stati. Boot-Latenz ist einmalig und liegt unter der wahrgenommenen Schwelle (200–500 ms vs. den ~1–2 s, die der State-Detection-Loop ohnehin braucht, bis die Sidebar live ist). B haette keine Boot-Latenz, dafuer eine UX-Regression pro Projekt: bis zum ersten Klick zeigt die Detail-Pane „Resume nicht moeglich" fuer Sessions, die der Pass eigentlich nachhole — der Pfad ist heute schon inkonsistent, das durch B zementieren waere ein Rueckschritt. C waere die transparenteste Variante (User entscheidet, wann der Pass laeuft), erfordert aber, dass der User die Existenz dieses Buttons kennt — gegen das „minimale Ueberraschung"-Prinzip aus Phase 1.

**Konsequenz:** Der Backfill ist idempotent ueber das Flag und kann nicht versehentlich zweimal laufen. Wenn das Datenmodell in einer spaeteren Phase erweitert wird (z.B. claude rotiert Files, Multi-Pfad-Sessions), kann ein zweiter Flag (`backfill_jsonl_link_v2`) den neuen Pass schalten — `backfill_jsonl_link_v1` bleibt als „v1-done"-Marker bestehen. Pass 1 (Path-Hydration fuer Sessions mit UUID aber ohne Pfad) wurde bewusst deaktiviert: der Watcher-Backfill schreibt `jsonl_path` ohnehin nach der ersten Watcher-Sichtung mit; ein zweiter Codepfad fuer denselben Effekt waere Doppelarbeit.

**Implementierungsdetail:** Der Flag liegt im SQLite-`settings`-KV-Store (seit Sprint 1 reserviert, bisher ungenutzt) ueber den neuen `MetaKvRepository`, bewusst NICHT im User-facing `AppSettings`-JSON. Begruendung: Backfill-Flags sind interne State-Information, kein User-Konfigurations-Pflicht-Feld — wer `settings.json` versioniert oder teilt, soll nicht den Backfill-Status seines Geraets mit-versionieren.

---

## Modelle-View: Eigener IPC parallel zu stats:project-overview, geteilte Header-Toggles

**Entscheidung:** Die Per-Modell-Aufschlüsselung bekommt einen eigenen IPC `stats:models` parallel zu `stats:project-overview` und `stats:heatmap`. Eigenes `ModelStatsRepository`, eigener Statement-Cache pro Scope/Range-Kombination, eigener Store-Slot mit eigenem `usage:update`-Listener. Scope (Aktiv/Global) und Range (Alle/30d/7d) werden mit den Cards geteilt — kein eigener Toggle in der Modelle-View.

**Varianten:**

- **A** Eigener IPC `stats:models` parallel (gewählt) — saubere Domänen-Trennung, der Cards-Refresh-Tick zieht die Models-Query nicht ungefragt mit.
- **B** `stats:project-overview` um `models`-Breakdown im Result erweitern. Ein Round-Trip statt zwei, aber jeder Cards-Refresh schleppt das Models-Aggregat mit — und der User-Pfad „nur Übersicht offen" ist der häufigere.
- **C** Renderer-seitige Aggregation aus dem bestehenden `MessageRepository`. Bricht aus dem Stats-Pattern aus (Main aggregiert, Renderer pullt) und ist bei Power-User-Datensätzen messbar langsamer als SQLite `GROUP BY`.

**Grund:** A folgt dem Pattern aus Season 12/13 — drei Aggregat-Domänen, drei IPCs, jeder mit eigenem Statement-Cache. Das hält den `SqliteModelStatsDriver` aufs reine SELECT beschränkt, vermeidet eine dritte Achse durch alle StatsRepository-Methoden und entlastet den Cards-Refresh-Tick: wer nur die Übersicht offen hat, zahlt die GROUP-BY-Models-Query nicht. B würde A1 aus Season-13 (Heatmap-IPC parallel) konterkarieren, das die gleiche Trennlinie schon einmal gewählt hat. C wäre der einzige Pfad, der ohne IPC-Erweiterung auskäme — opfert aber die im Pattern etablierte Aggregat-Ownership-Trennung und liefert bei vielen Messages spürbar schlechtere Latenz, weil das Renderer-Process keine Index-Nutzung wie SQLite hat.

**Konsequenz:** Die `stats:*`-IPC-Domain ist jetzt eine Familie mit drei Channels (overview/heatmap/models). Wenn Phase 3 weitere Stats-Domänen ergänzt (Easter-Egg-Vergleiche, Multi-Tab-Diff-Stats), wandern sie als weitere Channels in dieselbe Domain. Der `useStatsStore` trägt das mit weiteren State-Slots, solange jeder Slot saubere Setter/Refresh-Methoden behält. Scope/Range-Sharing zwischen Cards und Models ist bewusst — die Roadmap formulierte „Zeitfilter analog zu Übersicht", das wäre durch einen eigenen Range-Toggle in der Models-View redundant geworden.

## Modelle-View: Horizontale CSS-Bars pro Modell, kein 100%-Stack und kein Recharts

**Entscheidung:** Der Bar-Chart in der Modelle-View ist eine horizontale CSS-Bar pro Modell mit color-mix-Tonungen über `--td-accent` (gleiche Stufen wie die Heatmap). Top-Modell bekommt den vollen Accent-Ton, restliche Modelle die l3-Heatmap-Stufe. Kein 100%-Stack-Segment-Bar, kein Recharts.

**Varianten:**

- **A** Horizontale CSS-Bars pro Modell (gewählt) — eine Reihe je Modell, links Modellname, Track mit dem Token-Anteil, rechts Prozent + absolute Tokens.
- **B** 100%-Stack-Bar mit allen Modellen aneinandergereiht — modern und kompakt in einem Block, aber bei der realen Verteilung (ein Modell dominiert mit 80–95 %) verschwinden die kleinen Segmente unter 5 px und werden nur über Tooltips lesbar.
- **C** Recharts-BarChart wie die UsageDetailModal-Linie aus Sprint 5. Out-of-the-box Tooltips/Animations, aber visuell ein Fremdkörper neben den CSS-Bars (UsageBar) und der CSS-Color-Mix-Heatmap, die alle ohne Chart-Lib auskommen.

**Grund:** A bleibt für die typische Token-Verteilung (Daily-Driver: ein Modell dominiert klar, ein bis zwei sekundäre Modelle, Long-Tail aus Modell-Wechsel-Experimenten) lesbar — auch kleine Anteile haben einen sichtbaren Track-Restbetrag (`width: max(share*100%, 0.5%)`) plus Inline-Prozent-Wert. B sähe in einer Demo schicker aus, scheitert aber am Daily-Use mit ungleicher Verteilung. C wäre ein zweiter Chart-Stil im Repo — die Sprint-5-Recharts-Linie ist im UsageDetailModal weit weg von der Stats-Pane, hier hätte sie direkt neben der CSS-Color-Mix-Heatmap gesessen. Memory-Hinweis „UX-Defaults konvenient vor traditionell" trug die Wahl nur indirekt: die moderne Variante (100%-Stack) wäre für eine gleichmäßige Verteilung der Empfehlungs-Kandidat gewesen, scheitert aber an der realen Verteilung — Konvenienz schlägt Modernität, wenn die Realität ungleich ist.

**Konsequenz:** Stilistisch konsistent zur Heatmap-Tonung. Das Top-Modell-Hervorheben (voller Accent vs. l3) macht die Hierarchie auf einen Blick lesbar — wer nur den dominanten Modell-Anteil wissen will, braucht nicht erst Prozente zu lesen. Falls die Modelle-View je in eine Phase-3-Ausbaustufe geht (z.B. Modell-Wechsel-Verlauf über Zeit), kann ein zweiter Chart in der gleichen Stats-Pane mit der gleichen color-mix-Tonung andocken.

## Heatmap: Eigener IPC parallel zu stats:project-overview, nicht Endpoint-Erweiterung

**Entscheidung:** Die Aktivitäts-Heatmap bekommt einen eigenen IPC `stats:heatmap` parallel zu `stats:project-overview` aus Season 12. Eigener Statement-Cache pro Scope im `SqliteHeatmapDriver` (zwei vorbereitete Statements für project/global), eigene Schema-Validierung (`StatsHeatmapInputSchema`), eigener Refresh-Pfad im `useStatsStore`.

**Varianten:**

- **A** Eigener IPC `stats:heatmap` parallel (gewählt) — saubere Domänen-Trennung, Statement-Cache unabhängig.
- **B** `stats:project-overview` um `includeHeatmap`-Flag erweitern — ein Round-Trip statt zwei, aber Schema und Aggregat-Cache wachsen breit, wenn weitere Stats-Domänen (Modelle-View, Easter-Egg) hinzukommen.
- **C** Eigene `stats_daily(day, project_id, tokens)`-Aggregat-Tabelle, vom JSONL-Watcher mit-geschrieben + Backfill-Migration.

**Grund:** A hält die Cards-Domäne (Statement-Cache nach Scope × Range, vier Auspraegungen) und die Heatmap-Domäne (Cache nach Scope, zwei Auspraegungen) unabhängig — beides zu vermischen würde im SqliteStatsDriver eine zweite Achse durch alle Methoden ziehen. B spart einen IPC pro Refresh, aber der Refresh läuft hinter dem bestehenden 600-ms-Debounce — der zweite Round-Trip ist nicht messbar. C ist Overkill bei aktuellen Datengrößen (siehe „Stats-Cards: Lazy-Pull pro Bedarf" — selbe Begründung): Daily-Aggregat-Queries liefern Sub-10-ms-Antworten, ein Aggregat-Cache bringt Konsistenz-Risiko bei Watcher-Crashes ohne messbaren Gewinn.

**Konsequenz:** Wenn Phase 3 weitere Stats-Domänen ergänzt (Modelle-View, Easter-Egg-Vergleiche), wandern sie als jeweils eigene Channels in dieselbe `stats:*`-IPC-Domain. Der gemeinsame `useStatsStore` trägt das mit eigenen State-Slots pro Domäne, solange die Slots saubere Setter/Refresh-Methoden behalten.

## Heatmap-Farbskala: Quartile der nicht-leeren Tage, kein fester Schwellenwert

**Entscheidung:** Die fünf Heatmap-Stufen kommen aus den 25/50/75-Perzentilen der nicht-leeren Token-Tagessummen im aktuellen Fenster. Level 0 bei `tokens=0`, Level 1 für `tokens ≤ p25`, Level 2 für `≤ p50`, Level 3 für `≤ p75`, Level 4 darüber. Edge-Case `p25=p75` (nur ein aktiver Tag oder alle gleich) → alle aktiven Tage bekommen Level 4 statt Level 1.

**Varianten:**

- **A** Quartil-basiert (gewählt) — Standard-GitHub-Verhalten, Heatmap passt sich an die individuelle Nutzungsverteilung an.
- **B** Feste Schwellen aus Settings (z.B. 0 / 50k / 200k / 500k / 1M Tokens) — vorhersagbar, projektübergreifend vergleichbar, aber Schwellen müssen gepflegt werden.
- **C** Log-Skala (`log10(tokens+1)` normiert auf Max) — gut bei extremer Spannweite, aber weniger intuitiv im Tooltip.

**Grund:** A spiegelt die echte Nutzungsverteilung — Pausentage werden grau, Highlight-Tage dunkelgrün, im individuellen Verhältnis. B verlangt Settings-Pflege, die im Daily-Use nicht passiert (Schwellen werden einmal gesetzt und nie wieder angefasst, dadurch passen sie nach einem Monat schon nicht mehr zur Nutzungsentwicklung). C wäre für sehr lange Fenster (mehrere Jahre) mit extremen Ausreißern interessant, ist aber für die aktuellen 30W/52W-Modi nicht nötig.

**Implementierungsdetail:** Der Edge-Case-Sonderfall (`if (t.p25 === t.p75) return 4;`) verhindert, dass bei einem einzigen aktiven Tag im Fenster (Quartile kollabieren auf einen einzigen Wert) der Tag auf Level 1 (= Token-mindestens-vorhanden, aber minimal) gerendert wird. Stattdessen Level 4 — der einzige Signal-Tag wird visuell maximal hervorgehoben.

**Konsequenz:** Wenn das Fenster einen extremen Ausreißer hat (z.B. 1 Tag mit 100M Tokens, 100 Tage mit je 10k), bekommt der Ausreißer Level 4 und die ruhigen Tage rutschen alle in Level 1 — visuell ist das gewollt, ein Spitzentag soll hervorstechen.

## Heatmap-Layout: Cells stretchen via 1fr/1fr, kein aspect-ratio auf der Grid

**Entscheidung:** Die `.td-heatmap-grid` nutzt `grid-template-columns: repeat(weeks, 1fr); grid-template-rows: repeat(7, 1fr)` mit `width:100%; height:100%`. Cells stretchen sich proportional auf den Container-Raum. Kein `aspect-ratio: var(--weeks) / 7` auf der Grid.

**Varianten:**

- **A** Cells stretchen via 1fr/1fr (gewählt) — Grid füllt den verfügbaren Raum, Cells werden auf breiten Panes leicht rechteckig.
- **B** `aspect-ratio: var(--weeks) / 7` mit `width:100%` — Cells bleiben quadratisch, aber die Grid-Höhe wächst linear mit der Pane-Breite.
- **C** Cells quadratisch mit `max-width`-Cap, Heatmap linksbündig im Container — verschwendet Whitespace auf breiten Panes.

**Grund:** B war die erste Implementierung und hat auf breiten Panes (>1200 px Pane-Breite) zu Clipping geführt: die Heatmap-Höhe (Pane-Breite × 7/30) wurde größer als der Pane-Body-Slot (300 px Bottom-Row minus 36 px Header minus Padding ≈ 240 px), die Bottom-Row scrollte und Cards + Heatmap clippten unten weg. C löst das Clipping, hinterlässt aber sichtbaren leeren Raum rechts neben der Heatmap. A akzeptiert leichte Cell-Rechteckigkeit als Tradeoff für saubere Container-Fülligkeit ohne Clipping.

**Konsequenz:** Cell-Quadratur ist Pane-Breiten-abhängig. Auf 460 px Pane sind Cells bei 30W etwa 12×20 px (höher als breit), auf 1500 px Pane etwa 40×20 px (breiter als hoch). Kalender-Lesbarkeit bleibt erhalten (Spalten = Wochen, Reihen = Wochentage). Als TECH_SCHULDEN dokumentiert für den Fall, dass die Cell-Form später quadratisch erzwungen werden soll.

## Stats-Cards: Lazy-Pull pro Bedarf statt Vorab-Aggregat-Tabelle

**Entscheidung:** Die acht Stats-Cards werden im Main bei jedem Renderer-Anruf neu aus `messages` und `sessions` aggregiert. Kein eigener Aggregat-Cache, keine neue Tabelle, keine Doppel-Schreibung im Watcher. Der Renderer pullt nach Projekt-Wechsel, Scope/Range-Toggle und auf `usage:update`-Push (600-ms-debounced).

**Varianten:**

- **A** Lazy-Pull pro Bedarf — Main rechnet bei jedem IPC-Aufruf direkt auf den `messages`/`sessions`-Tabellen über die existierenden Indizes (gewählt).
- **B** Push-Stream über extra Event-Channel — Watcher pushed ein „Stats-veraltet"-Event, Renderer lädt nach. Im Endeffekt das gleiche Pull-Verhalten plus ein redundanter Channel.
- **C** Vorab-Aggregat-Tabelle (z.B. `stats_daily` mit Project/Tag/Tokens/Counts) — Watcher schreibt beim Insert mit, Stats lesen nur die Aggregat-Tabelle.

**Grund:** Bei realistischen Daten-Größen (Tausende Messages pro Projekt, Indizes vorhanden) liegen die acht Aggregat-Queries deutlich unter 10 ms — ein Pull pro Refresh ist nicht spürbar. C lohnt sich erst, wenn entweder die Daten in den Millionenbereich gehen oder die Stats-Section auf dutzende Metriken anwächst; aktuell sind beide Bedingungen nicht erfüllt. C hätte zusätzlich ein Konsistenz-Risiko bei Crashes mitten in der Doppel-Schreibung (Aggregat-Row vs. messages-Row out of sync) und braucht eine Migration plus einen Backfill. B fügt einen Channel hinzu, ohne den Pull-Trigger zu ersetzen — der Pull-Auslöser ist sowieso „Watcher hat geschrieben", und den haben wir bereits via `usage:update`. Memory-Hinweis „pragmatisch vor invasiv" trug die Wahl.

**Konsequenz:** Falls die Stats-Section in Phase 3 stark wächst (eigene Tabs, Heatmap-Daten, weitere Aggregate) oder die IPC-Latenz spürbar wird, lässt sich C als Drop-in einbauen — die `StatsRepository`-Schnittstelle (`getOverview`) bleibt unverändert, nur der Driver tauscht. Keine Renderer-Änderung nötig. Bis dahin: ein Repo, kein Cache, kein Synchronisations-Code.

## Stats-Cards: Scope als Aktiv/Global-Toggle, nicht hartcodiert

**Entscheidung:** Die Stats-Pane bekommt einen Scope-Toggle „Aktiv/Global" als dritte Header-Gruppe — der User entscheidet pro Klick, ob die Karten das aktiv ausgewählte Projekt oder alle Projekte zusammen zeigen. Wahl persistiert in localStorage.

**Varianten:**

- **A** Hartcodiert auf das aktive Projekt aus der Sidebar (entspricht der Roadmap-Formulierung „pro Projekt" wörtlich genommen).
- **B** Hartcodiert global über alle Projekte — die Stats-Section ist projekt-unabhängig, der Sidebar-Switch wirkt nicht.
- **C** Toggle aktiv/global im Header der Section (gewählt).

**Grund:** A blendet im Daily-Use die natürliche Folge-Frage aus („was ist denn insgesamt zusammengekommen?"). B kappt den eigentlichen Roadmap-Spirit, weil die Per-Projekt-Sicht im realen Multi-Projekt-Daily-Use die wichtigere ist. C kostet eine Pille im Header — und die ist mit den bestehenden `td-dash-tab`/`td-dash-range`-Pillen visuell vertraut. Persistenz via localStorage (`td.statsScope`) lehnt sich an den bestehenden `td.activeProjectId`-Pattern an und vermeidet eine eigene Settings-Spalte für zwei kleine UI-Toggles.

**Konsequenz:** Heatmap und Modelle-View (kommende Seasons) bekommen denselben Toggle-Zustand aus dem `useStatsStore` und müssen die Scope-Logik nicht selbst neu modellieren.

## Stats-Streak: heute-oder-gestern statt heute-only

**Entscheidung:** Die aktuelle Streak bleibt intakt, solange der letzte aktive Tag heute ODER gestern war. Erst wenn zwei volle Kalendertage ohne Aktivität vergangen sind, bricht sie auf 0.

**Varianten:**

- **A** Letzter aktiver Tag = heute oder gestern (gewählt).
- **B** Letzter aktiver Tag muss heute sein — wer am Vormittag noch nichts gemacht hat, sieht Streak = 0.

**Grund:** B würde nach jedem Schlaf bis zur ersten heutigen Aktivität auf 0 stehen und damit täglich einmal die Streak optisch „zerstören", obwohl sie de facto erhalten ist. A ist die etablierte Github-Contribution-Logik und matcht die User-Erwartung an einen Streak-Counter. UTC-Tages-Diff in der pure Streak-Funktion macht den Vergleich DST-immun, lokale Zeit wird nur beim Today-String benutzt.

**Konsequenz:** Tests in `stats-streak.test.ts` decken den heute-oder-gestern-Pfad und den 2-Tage-Lücke-Pfad explizit. Wenn die Heuristik je geändert wird (z.B. „48 h ab letzter Activity" statt Kalendertag), bleibt der Test-Vertrag der Anker.

---

## Season-Counter: dynamisch aus sessions.season_number statt separater Spalte

**Entscheidung:** Die nächste Season-Nummer eines Projekts wird zur Lesezeit als `COALESCE(MAX(sessions.season_number), 0) + 1` aus der `sessions`-Tabelle abgeleitet — und beim Templates-Send mit `{{NEXT_SEASON_NR}}` atomar auf die aktive Session geschrieben. Die ursprüngliche `projects.next_season_number`-Spalte (Sprint 6) ist damit dead-code und wird im Schema nur noch aus Backwards-Kompatibilität mit Default `1` befüllt.

**Varianten:**

- **A** DB-Wert einmalig per SQL korrigieren (`UPDATE projects SET next_season_number = N`). Pflasterfix; der ursprüngliche Drift-Mechanismus bleibt — der Counter geht beim nächsten Templates-Send-Workflow erneut auseinander.
- **B** Counter dynamisch aus `sessions.season_number` ableiten + Templates-Send alloziert und persistiert die Nummer auf der aktiven Session (gewählt). Robust gegen Drift, weil der "Verbrauch" der Nummer und ihre persistente Spur (die `sessions`-Row) zusammenfallen.
- **C** `docs/SEASON_LOG.md` als Source of Truth, Markdown-Parser auf den Allokations-Pfad. Käme der Roadmap-Realität am nächsten, weil "Season" eigentlich ein Doku-Konzept ist und nicht an PTY-Spawns gekoppelt sein muss — koppelt aber den IPC-Allokations-Pfad an einen Datei-Parser, der bei kaputter `SEASON_LOG.md`-Section silent failed wäre.

**Grund:** Der ursprüngliche Bug entstand, weil die Sprint-6-Spalte nur entlang eines Allokations-Pfads (`pty:create` mit `type='feature'`) hochgezählt wurde. Im realen Daily-Use läuft eine Season aber häufig per Templates-Send in eine bestehende Session — und dieser Pfad bumpte den Counter nicht. A fixt das Symptom, nicht die Ursache. C ist zu groß für den Nutzen: ein Markdown-Parser am Allokations-Pfad braucht eigene Fehler-Modi (was passiert bei kaputter Section?), und die Doku-Datei wäre dann implizit Schema. B koppelt die Daten-Realität (eine Session mit `season_number = N`) an die Anzeige der nächsten Nummer — keine zweite Wahrheit, kein Drift möglich. Der atomare UPDATE-Pfad beim Templates-Send (`SessionRepository.assignSeasonNumber`) ist idempotent: ein zweiter Send in dieselbe Session liefert dieselbe Nummer zurück, kein zufälliges Hochzählen.

**Konsequenz:** Sessions ohne `season_number` (Bug/Custom/Review/Resume und alle pre-Patch-Templates-Send-Sessions) tauchen im neuen MAX nicht auf — der Counter spiegelt nur Feature-Sessions, die als solche markiert sind. Für Projekte mit historisch gemischten Allokations-Pfaden bedeutet das: der erste Allocate nach dem Fix kann tiefer einsteigen als die git-Realität (Beispiel TakumiDeck: git-Commits zeigen Season 10, MAX in der DB steht bei Season 7, der nächste Allocate liefert 8). Die Lücken füllen sich automatisch über die nächsten Templates-Sends. Eine einmalige SQL-Korrektur (`UPDATE sessions SET season_number = N WHERE id = '<latest>'`) springt direkt auf den richtigen Wert, ist aber kein Pflicht-Schritt. `projects.next_season_number` bleibt im Schema, wird beim Project-Insert default `1` gesetzt und nirgends mehr ausgelesen — dokumentiert als TECH_SCHULDEN-Eintrag (Drop in einer zukünftigen Migration).

**Implementierungsdetail:** `ProjectDbDriver.allocateSeasonNumber` ist jetzt eine reine SELECT-Operation (keine Transaktion mehr), weil der eigentliche „Verbrauch" der Nummer erst beim Session-Insert (`pty:create`) bzw. UPDATE (`assignSeasonNumber`) passiert. Better-sqlite3 ist synchron und der Electron-Main-Prozess single-threaded — zwei Allokationen werden zwangsweise serialisiert, ein Race-Fenster gibt es nicht. Die korrelierte Subquery im `PROJECT_SELECT_WITH_COUNT` (`COALESCE(...) + 1`) wirkt pro Project-Row; bei Listen-Reads (`listAll`) ist das ein Subquery-pro-Projekt, was bei der realen Projekt-Anzahl (<50 in jedem realistischen Setup) vernachlässigbar bleibt.

---

## Frontmatter-Refetch beim Modal-Open statt CLAUDE.md-Watcher

**Entscheidung:** Das CLAUDE.md-Frontmatter (im Renderer-Store `useUiStore.activeProjectFrontmatter`) wird beim Mount des `TemplatesModal` und `PreCommitModal` per `loadActiveProjectFrontmatter(project.id)` neu gelesen — nicht über einen kontinuierlich laufenden Watcher.

**Varianten:**

- **A** Refetch beim Modal-Open (gewählt). Minimale Diff: zwei `useEffect`-Hooks in den Modals, kein neuer Watcher-Lifecycle, kein zusätzlicher IPC-Push-Channel.
- **B** chokidar-Watcher auf der CLAUDE.md des aktiven Projekts, Push-Event an den Renderer bei Änderung. Robuster gegen externe Edits in dem Sinn, dass ActionBar-Trigger-Pills und EditorPane mit-aktualisiert würden, ohne dass der User ein Modal öffnen muss.

**Grund:** Der reale Schmerzpunkt ist „ich habe CLAUDE.md geändert und das Template zeigt noch die alte Phase" — und der Pfad zum Template-Senden geht zwangsweise durch den Modal-Open. A deckt diesen Pfad zuverlässig ab. B würde zusätzlich die Live-Anzeige in ActionBar/EditorPane synchron halten, aber dort hat das Frontmatter im Daily-Use weniger Sichtbarkeit (Trigger-Pills sind primär `commit` und `docs_update`-Phrasen, deren Wechsel sehr selten ist; EditorPane zeigt den Body, nicht das Frontmatter). Der Watcher-Lifecycle (Setup beim Projekt-Wechsel, Cleanup beim Schließen, chokidar-`awaitWriteFinish`-Tuning, Re-Entry beim Datei-Lösch-und-Neu-Anlegen) ist ein eigenes Stück Infrastruktur — Aufwand-Nutzen ist hier ungünstig.

**Konsequenz:** Frontmatter-Stale-Cache greift nur noch, wenn der User CLAUDE.md ändert UND danach kein Modal öffnet (= keine Templates-Send, kein PreCommit). In diesem Edge-Case bleibt der `effectiveDefaultModel`-Hint in der ActionBar oder die Trigger-Phrasen-Pille stale bis zum nächsten Project-Switch oder App-Neustart. Akzeptierte Lücke — der Daily-Use-Pfad (CLAUDE.md ändern → Templates senden) ist gefixt. Bei Bedarf nachrüstbar (Watcher) ohne Schema-Brüche, die Refetch-Logik bleibt unter dem Watcher.

---

## Modell-Filter im Verlauf-Panel: current_model statt Join über messages.model

**Entscheidung:** Die neue Modell-Filter-Pillen-Reihe im Verlauf-Panel filtert auf `sessions.current_model` (Single-Column-`IN(...)`-WHERE), nicht auf eine `EXISTS`-Subquery über `messages.model`. Sessions tauchen unter genau einem Modell auf — dem, mit dem sie zuletzt liefen. Das aggregierte „welche Modelle wurden in dieser Session benutzt"-Bild lebt separat im Detail-Pane-Block „Modelle".

**Varianten:**

- **A** Filter auf `sessions.current_model` (gewählt). Triviale SQL-Erweiterung im bestehenden `sessionsHistory`-Statement-Cache, Cache-Key um `modelsLen` erweitert, eine `IN (?, ?, ...)`-Klausel. Sessions kommen in der Liste genau einmal vor.
- **B** Filter via `EXISTS (SELECT 1 FROM messages WHERE session_id = s.id AND model IN (?))`. Eine Session mit Opus-Start und Sonnet-Wechsel tauchte dann in beiden Filter-Pillen auf — semantisch „irgendwann benutzt". Mächtiger, aber die Sessions-Liste verdoppelt sich gedanklich („warum sehe ich dieselbe Session in zwei Filtern?"), und der Join wäre auf der `messages`-Tabelle deutlich teurer.
- **C** Beide Modi via Toggle in der Filter-Bar („aktuell / je benutzt"). Maximale Flexibilität, kostet aber UI-Slot und ein neues Konzept, das im Verlauf-Panel sonst nirgends auftaucht — Over-Engineering für ein Pillen-Filter.

**Grund:** Der Daily-Use-Intent ist „zeig mir alle Sessions, die zuletzt mit Opus liefen" — A trifft das direkt. B verschiebt den Aggregat-Aspekt in den Filter, obwohl der Detail-Pane ohnehin die volle Modell-Aufschlüsselung der Session zeigt; doppelt Aggregat ist redundant. Die Modell-Spalte in der Tabellen-Anzeige zeigt sowieso `current_model` (eine Zelle pro Session) — Filter auf dieselbe Quelle hält die UI konsistent: was die Tabelle zeigt, lässt sich auch filtern. Variante B hätte einen Fall produziert, in dem die Tabelle Modell X zeigt, der Filter aber Modell Y matcht — verwirrend.

**Konsequenz:** Sessions ohne `current_model` (theoretisch möglich, in der Praxis nur bei kaputten Pre-Spawn-Sessions) sind nicht filterbar — sie tauchen weder bei aktiver noch bei inaktiver Pille auf, sondern nur im „kein Filter"-Zustand. Das ist ok, weil die Spalte real fast immer befüllt ist und der Workaround (Modell-Pille leer lassen) trivial ist. Die Modell-Liste in der UI ist eine statische 5er-Konstante (`MODEL_FILTER_OPTIONS`) — bewusst NICHT dynamisch aus den im Projekt vorkommenden Modellen. Dynamische Pillen, die je nach Projekt verschwinden/erscheinen, sind verwirrend; die fünf bekannten Modelle decken den Daily-Use ab und ein unbekannter Modell-ID-Wert bleibt in der Tabellen-Spalte sichtbar (Fallback auf rohen String), nur nicht im Filter — bewusste Beschränkung.

**Implementierungsdetail:** Statement-Cache-Key ist `t${typesLen}_s${statusesLen}_m${modelsLen}_q${hasQuery ? 1 : 0}` — Permutations-Raum ≤7×8×5×2 = 560, alle dauerhaft cacheable. Schema bleibt locker auf `z.string().min(1)` für die Modell-IDs (kein Enum-Bind an die fünf UI-Modelle), damit alte Sessions mit umbenannten Modell-IDs filterbar bleiben.

---

## Modell-Aggregat pro Session: aus messages.model statt Timeline-Tabelle oder initial_model

**Entscheidung:** Die im Detail-Pane angezeigte Modell-Aufschlüsselung („welche Modelle in dieser Session, wieviel je") ist eine reine Read-Aggregation aus `messages.model` (neu in Migration 0006), gerendert als kompakte Inline-Liste mit Counts. Kein zeitlicher Verlauf, keine separate Event-Tabelle, keine `initial_model`-Spalte.

**Varianten:**

- **A** Aus `messages.model` aggregieren (gewählt). `SELECT model, COUNT(*) GROUP BY model ORDER BY count DESC, model ASC`, eine zusätzliche Spalte auf der bestehenden messages-Tabelle, der Watcher schreibt das Feld pro Message mit. Antwortet auf „welche Modelle, wie viel pro Modell" — alles, was der Detail-Pane braucht.
- **B** Eigene Event-Tabelle `session_model_events(session_id, model, switched_at)` mit echtem Timeline-Logging. Würde „16:42 Opus → Sonnet (Slash-Befehl) · 17:15 Sonnet → Opus (Resume)" ermöglichen. Braucht aber dediziertes Switch-Event-Logging im Watcher und im Resume-Pfad, ein eigenes Schema plus Backfill für historische Daten — und die Timeline-Sicht ist im Detail-Pane gar nicht in der Spec.
- **C** Nur zwei Werte zeigen: `sessions.initial_model` (neue Spalte, beim Spawn gesetzt) und `current_model` (bestehend). Minimaler Schema-Change, aber liefert nur „Start vs. jetzt" — Sessions mit 5 Modell-Wechseln im Daily-Use sehen identisch zu Sessions mit einem Wechsel aus. Verliert den Mehrwert.

**Grund:** A passt zum tatsächlichen Need: der User will wissen, „wie hat sich der Modell-Mix in dieser Session zusammengesetzt", nicht „in welcher Reihenfolge". Die Count-Aggregation liefert implizit die Antwort „welches Modell dominierte" (= das mit höchstem Count) und „wurde überhaupt gewechselt" (= mehr als ein Eintrag). Daten-Quelle ist sowieso vorhanden — der JSONL-Parser liest `message.model` seit Sprint 5, nur der Watcher-Insert hatte das Feld bis Season 10 verworfen. B baut eine Parallel-Welt zur messages-Tabelle für einen Use-Case, der nicht in der Spec steht, und C verliert die Tiefe der Aufschlüsselung.

**Konsequenz:** Backfill für Pre-Migration-Messages nutzt `sessions.current_model` als Approximation (eine Session = ein Hint-Wert, historisch ungenau bei Modell-Wechsel). Dokumentiert als TECH_SCHULDEN-Eintrag — löst sich auf, sobald Pre-Migration-Sessions archiviert sind und neue Messages mit exaktem per-Message-Modell die Daten dominieren. Detail-Pane blendet den Block aus, wenn die Session genau ein Modell hat — der Single-Modell-Fall ist redundant zur Tabellen-Spalte, und ein Hide bei ≤1 Aggregat-Eintrag verhindert, dass der Detail-Pane mit „Modelle · Sonnet 4.6 · 47" eine Information doppelt zeigt, die schon in der Spalte steht.

**Implementierungsdetail:** Aggregat reist mit jedem `SessionHistoryEntry` im IPC-Response — Bulk-Query nach der History-Liste (`SELECT session_id, model, COUNT(*) ... WHERE session_id IN (?, ?, ...) GROUP BY session_id, model`) statt N+1. Statement-Cache pro IN-Listen-Länge analog zum sessionsHistory-Pattern. Alternative „separater IPC bei Klick auf Eintrag" wäre billiger im average-case, aber das Flackern beim Klicken (extra Round-Trip pro Selektion) ist im Daily-Use unangenehmer als die mit-gesendete Aggregat-Payload (≤5 Einträge pro Session = vernachlässigbar). `SessionRepository` bekommt das `MessageRepository` als optionale zweite Konstruktor-Dep — Bestands-Tests, die nur den Sessions-Repo brauchen, lassen den Parameter weg und sehen `models: []` (kein Detail-Aggregat).

---

## Kontext-Soft-Warning: Marker an der ctx-Bar + Tooltip statt Pille oder Toast

**Entscheidung:** Die persönliche Erfahrungsgrenze für die Per-Session-Kontext-Bar (Default 20 %, im Settings-Tab Token-Tracking konfigurierbar und per Toggle abschaltbar) wird als visueller Marker direkt an der `ctx`-Bar in der Action-Bar gerendert plus einer vierten, dezenten Tonungs-Stufe `soft` (gedämpfter `--td-blue`-Hinweis), sobald die Auslastung den Marker überholt. Der Hinweis-Text „Kontext über X % — Output-Qualität kann sinken" sitzt im `title`-Tooltip der Bar.

**Varianten:**

- **A** Marker an der Bar + soft-Tonung + Tooltip-Text (gewählt). Permanente Distanz-Anzeige zur Schwelle, Hinweis-Text on demand. Kein neuer UI-Slot, kein Layout-Sprung beim Überschreiten.
- **B** Eigene „⚠ Kontext > X %"-Pille unter der Action-Bar, sobald die Schwelle gerissen ist. Ohne Hover sichtbar, aber kein permanenter „wie weit weg"-Marker — User sieht nur „drüber/drunter". Layout springt im Moment des Überschreitens.
- **C** Einmaliger Toast unten rechts beim ersten Überschreiten pro Session. Maximal unaufdringlich, aber die explizit gewünschte Distanz-Anzeige fehlt komplett, und die Toast-Infrastruktur existiert noch nicht — Neu-Bau für ein dezentes Signal ist Overkill.

**Grund:** A liefert beides — die permanente Distanz-Anzeige (User-Wunsch: „Eine kleine Markierung wäre gut in der Leiste") UND den sanften Hinweis-Text — ohne Layout-Slot zu kosten und ohne neue UI-Infrastruktur. B verliert den Distanz-Aspekt, C dazu noch den permanenten Charakter. Der Marker selbst ist 2 px breit und ragt 2 px über und unter die 4-px-Bar hinaus (effektiv 8 px hoch); helles Off-White (`rgba(255,255,255,0.7)`) hält ihn auf jedem Fill-Ton sichtbar, `z-index: 1` über dem Fill macht ihn auch bei Überschreitung erkennbar. Erste Iteration mit 1 px Breite, gedämpftem Grau und ohne `z-index` war zu schwach — User-Feedback hat das direkt bestätigt, der Fix war eine reine CSS-Änderung (kein Schema-/Logik-Touch).

**Konsequenz:** Die Soft-Tonungs-Stufe `soft` ist eine eigene Vokabel neben Default / `warn` / `orange` / `red`. Sie sitzt absichtlich unter der Default-Yellow-Schwelle (User-Setting → bei Default 20 % vs. yellow 70 %); überschneidet sich also nicht mit dem etablierten Limit-Naehe-Alarm. Wenn jemand die Soft-Schwelle über die Yellow-Schwelle setzt, gewinnt immer die stärkere Tonung (`red > orange > warn > soft > Default`). Toggle = aus blendet Marker und Tonung komplett aus, die Yellow/Orange/Red-Logik bleibt unberührt — der User kann das Feature also einfach abschalten, falls es im Daily-Use stört, ohne andere Token-UI zu verlieren.

**Implementierungsdetail:** `overflow: hidden` auf `.td-ctx-bar` ist im Zuge der Marker-Sichtbarkeit weggefallen, damit der Marker oben/unten überstehen darf. Der Fill bekommt jetzt selbst `border-radius: 1px` (Inner-Radius < Outer-Radius), damit die abgerundeten Bar-Ecken visuell weiter sauber bleiben — gleicher Effekt wie zuvor mit `overflow: hidden`, aber ohne den Marker mitzuclippen. Marker-Triggered-Zustand markiert nur ein zusätzlicher blauer Halo via `box-shadow` — die Kern-Farbe bleibt neutral, weil der Marker eine *Position* markieren soll, nicht selber ein Alarm-Signal sein. Soft-Tonung selbst übernimmt das Alarm-Signal über die Fill-Farbe.

---

## JSONL-Watcher-Resolver: UUID-First mit cwd-Fallback statt nur cwd-Match

**Entscheidung:** Der JSONL-Watcher mappt Events primär über die claude-eigene Session-UUID aus dem JSONL-Dateinamen gegen `sessions.claude_session_id` und greift nur dann auf den bestehenden cwd-Encoded-Match auf `running`/`idle`-Sessions zurück, wenn für die UUID keine TakumiDeck-Session bekannt ist. Die Resolver-Logik ist als pure Funktion `resolveJsonlToSession(filePath, deps)` aus dem `JsonlWatcher` extrahiert; die `private`-Methode wickelt sie nur noch in die Repo-Calls ein.

**Varianten:**

- **A** UUID-First-Match mit cwd-Fallback (gewählt). Deterministisch, status-agnostisch, unabhängig vom aktiven Tab.
- **B** Aktive Session als „Hint" aus dem Renderer an den Watcher schicken; bei Ambiguität bevorzugt der Watcher die Hint-Session. Hätte einen neuen IPC-Channel plus Coupling UI-State ↔ JSONL-Pipeline gefordert — verletzt die Sprint-5-Architektur (Watcher kennt UI nicht), und ein Tab-Wechsel mitten in einem JSONL-Write erzeugt Race-Conditions.
- **C** Mapping-Cache `filePath → sessionId` im Watcher, befüllt vom ersten Match (egal welcher Heuristik); Folge-Events lesen aus dem Cache. Macht den ersten Match permanent — ein Fehl-Match (jüngste-Session-Heuristik liegt daneben) wird damit dauerhaft verewigt.

**Grund:** A nutzt eine Datenverbindung, die im System bereits existiert: `claude_session_id` wird seit Sprint-6-Hotfix beim `pty:create` direkt befüllt (`--session-id <id>`) und vom Backfill-Pfad im Watcher (`backfillClaudeSessionId`) für Legacy-Sessions nachgeholt — sie ist also für 99 % der laufenden Sessions sofort verfügbar, und der Backfill-Pfad räumt den Rest auf, sobald der Watcher die JSONL einmal gesehen hat. Damit ist das Mapping JSONL-Datei → TakumiDeck-Session 1:1 und deterministisch. Die alte cwd-Match-Heuristik („gewinne die `started_at`-jüngste Session im selben Projekt-Pfad") war ein Sprint-5-Provisorium, das funktionierte solange nur eine Session pro Projekt gleichzeitig lief — sobald mehrere Tabs im selben Pfad laufen (mehrere Seasons parallel), spiegelte die Per-Session-Kontext-Anzeige fremde Tokens in den aktiven Tab. Variante B verschiebt das Problem nur auf eine andere Kopplungs-Achse und bricht die Architektur-Trennung; Variante C konserviert das alte Falsch-Match-Risiko statt es zu eliminieren.

**Konsequenz:** Der cwd-Fallback bleibt erhalten und ist der einzige Pfad für „externe" Sessions, die claude ohne TakumiDeck geschrieben hat (kein Spawn-IPC durchlaufen, kein Backfill noch nicht angefasst). Das ist genau der ursprüngliche Use-Case der Heuristik aus Sprint 5 und schadet nicht — er greift nur, wenn der UUID-Lookup leer zurückkommt. Status-Filter beim Fallback bleibt `running` + `idle` (Live-Tracking-Pfad), beim UUID-Match dagegen status-agnostisch — so trifft auch ein Token-Push während einer resumed-completed-Session die richtige Session.

**Implementierungsdetail:** `findByClaudeSessionId` ist eine neue Repo-Methode mit SQLite-`ORDER BY started_at DESC LIMIT 1`-Statement (Tie-Break auf die jüngste, falls per Konstruktion mal zwei Sessions dieselbe UUID hätten — sollte nie passieren, aber Defense-in-Depth) und einer entsprechenden InMemory-Driver-Implementierung für Tests. Die Resolver-Logik ist als pure Funktion mit injizierten Repo-Methoden (`findByClaudeSessionId`, `listByStatus`) testbar — `tests/main/jsonl-resolver.test.ts` deckt sieben Fälle ab (UUID-Win-gegen-juengste-cwd-Session, Status-Agnostik, Fallback-Aktivierung, Tie-Break im Fallback, Non-UUID-Filename, leere Kandidaten).

---

## Projekt entfernen: Hover-Trash + Modal statt Kontextmenü, Hard-Delete + Bulk-Remap statt Soft-Archive

**Entscheidung:** „Projekt aus Liste entfernen" wird durch ein Hover-Trash-Icon im Sidebar-Eintrag getriggert und durch ein eigenes Bestätigungs-Modal mit Doppel-Confirm vollzogen. Server-seitig löscht der neue IPC `project:remove` die `projects`-Row tatsächlich (kein `archived`-Flag) und hängt vorher alle Sessions und ihre `messages`-Rows in einer better-sqlite3-Transaction auf den Default-Bucket um.

**Varianten (UI-Trigger):**

- **A** Hover-Trash-Icon im Sidebar-Eintrag + Modal (gewählt). Aktion ist beim Hovern entdeckbar, der Modal-Body hat Platz für den vollen Hinweis-Text („Sessions und Verlauf bleiben erhalten und wandern in den Legacy-Bucket"). Default-Bucket bekommt kein Icon.
- **B** Rechtsklick-Kontextmenü + Inline-Confirmation. Sehr leise UI, aber Rechtsklick als Trigger existiert bisher nicht im Renderer — neue Infrastruktur (Custom-Menü mit Click-Outside-Close, Tastatur-Handling, Viewport-Bounding) für eine seltene Aktion, und der Hinweis-Text passt nicht ins Menü.
- **C** Hover-Trash **und** Rechtsklick (beide öffnen das Modal). Maximal entdeckbar, aber zwei UI-Pfade ohne Wiederverwendungs-Hebel und neue Menu-Infra-Auslöser.

**Varianten (Datenpfad):**

- **D** Hard-Delete + Bulk-Reassign-Transaction (gewählt). Sessions wandern serverseitig auf den Default-Bucket, dann `DELETE FROM projects`. Ein UPDATE pro Tabelle, kein Per-Session-Loop — der Sprint-4-Remap iteriert pro Session, weil die cwd-Match-Logik dort pro Session entscheidet; hier wandert die ganze Mannschaft, also reicht ein Statement.
- **E** Soft-Archive mit neuem `projects.archived`-Flag. Migration nötig, plus jede Liste/Filter/Lookup-Stelle muss das Flag respektieren (Sidebar, Verlauf-Filter, History-Quickliste, Repo-Selects).
- **F** FK-Cascade `ON DELETE CASCADE` für `sessions.project_id`. Sessions wären weg statt im Legacy-Bucket — verletzt die explizite Spec-Anforderung.

**Grund:** A löst das Reibungsproblem („Aktion entdecken ohne Manual") direkt, ohne neue Renderer-Infrastruktur zu fordern — der Trash-Slot reiht sich ins bestehende `td-row-x`-Pattern ein, sichtbar gemacht durch eine kleine Opacity-Regel auf `.td-row-hover`. Memory-Hinweis „konvenient vor traditionell" trägt das Argument: der moderne Daily-Driver-Pfad ist die Empfehlung, nicht der konservative. B wäre eine Vor-Investition in Kontextmenü-Infrastruktur, die heute kein zweiter Use-Case einlöst. C kostet das Doppelte ohne erkennbaren Mehrwert. D ist der einzige Datenpfad, der Sessions wie gewünscht im Legacy-Bucket weiterleben lässt und gleichzeitig den Repo-State sauber hält: kein neues Flag, das in 8 Lese-Stellen mitgepflegt werden müsste, kein zweiter View-Filter, der irgendwann mal nicht-archivierte Projekte mit archivierten verwechselt. E wäre eine substantielle Schema-Erweiterung für ein UX-Feature, das ohne sie auskommt. F bricht die Spec.

**Konsequenz:** Wenn Phase 3 mal „Projekt-Papierkorb mit Restore" verlangt, ist E der spätere Pfad — die heutige Hard-Delete-Wahl ist umkehrbar, weil die zugehörigen Sessions weiter in der DB liegen (nur am Default-Bucket); eine zukünftige Restore-Funktion müsste die `projects`-Row neu anlegen und die Sessions per cwd-Match (oder gespeicherter Pre-Remap-projectId) zurück-umhängen. Aktuell kein Use-Case, daher kein Vorab-Aufwand. Hover-Sichtbarkeit über `opacity` (nicht `visibility`) — das Item springt beim Hover-Wechsel nicht, Layout-Breite bleibt konstant. `:focus-visible`-Regel auf dem Trash-Button hält das Icon auch bei Keyboard-Fokus sichtbar (Tab-Navigation soll die Aktion erreichen können).

**Implementierungsdetail:** Doppel-Confirm sitzt im RemoveProjectModal-Footer (lokaler `confirmStage`-State), nicht im Sidebar-Eintrag — der erklärende Hinweis-Text braucht den Modal-Body als Bühne, eine Inline-„⚠ Wirklich?"-Geste im Listen-Item wäre zu knapp gewesen. Default-Bucket-Schutz ist doppelt: UI rendert das Trash-Icon nur für `p.id !== DEFAULT_PROJECT_ID`, und der Server-Handler lehnt `DEFAULT_PROJECT_ID` zusätzlich mit `PROJECT_DEFAULT_IMMUTABLE` ab — Belt-and-Suspenders, weil der User über DevTools jederzeit einen direkten IPC-Call absetzen könnte. Vor dem `project:remove` schließt der Renderer alle offenen Tabs des Projekts via `handleCloseTab` (PTY-Kill + Lifecycle-Übergang auf `completed`), sonst hätten die Tabs im `useSessionStore` weiter auf eine projectId verwiesen, die in der DB nicht mehr existiert.

---

## Seed-basierte Native-Dep-Closure im ASAR-Build statt prune-Vertrauen oder Denylist

**Entscheidung:** Der `ignore`-Filter in `forge.config.ts` lässt von `node_modules/` nur die Pakete durch, die in der transitive Dep-Closure einer expliziten Seed-Liste liegen — und diese Seed-Liste ist exakt die Externals aus `vite.main.config.ts` (heute `better-sqlite3`, `@lydell/node-pty`). Alle anderen prod-Deps werden von Vite ins Main-/Renderer-Bundle inlined und sind im ASAR-`node_modules` redundant.

**Varianten:**

- **A** Kompletter `node_modules`-Pass-through (Status quo vor Phase 2) — verworfen, weil electron-packager dann den `prune`-Schritt nicht greifen ließ und devDeps unbenötigt im ASAR landeten (84.7 MiB statt 24.9 MiB). Auch `prune: true` explizit zu setzen hat in Kombination mit plugin-vite nichts geändert — der Schritt taucht nicht im Pack-Log auf.
- **B** Hartcodierte Denylist bekannter devDep-Prefixes (`@babel`, `@eslint`, `@vitejs`, …) — verworfen, weil bei jedem neuen devDep der Filter manuell gepflegt werden müsste und das nächste devTool ohne Vorwarnung im Bundle landet.
- **C** `npm ls --omit=dev` synchron im Forge-Config-Load + Allowlist aus der Output-Liste — verworfen wegen `child_process.execSync` zur Build-Time (langsam, fehleranfällig wenn npm-Version variiert).
- **D** Seed-basierte Closure aus `package.json`-Lookups (gewählt). Forge-Config liest `package.json` der Seed-Pakete und walked rekursiv über `dependencies` + `optionalDependencies`. Reine JSON-Reads, keine Child-Prozesse, deterministisch.

**Grund:** D ist die einzige Variante, die sowohl den ASAR-Bloat löst (alles außer der echten Native-Closure fliegt raus) als auch wartungsarm bleibt (keine Denylist-Pflege, kein neuer Build-Schritt). Die Seed-Liste ist genau zwei Einträge lang und korrespondiert 1:1 mit dem `external`-Array in `vite.main.config.ts` — wenn dort ein neues Native-Modul hinzukommt, muss der Seed parallel ergänzt werden (Konvention via Kommentar an beiden Stellen). prune-Vertrauen scheitert daran, dass plugin-vite den Schritt im aktuellen Pfad nicht reproduzierbar durchreicht; das explizit zu fixen wäre Pfusch an plugin-vite, nicht an unserer Config. Eine `npm ls`-Lösung würde Build-Zeit beim ersten Pack messbar verlängern und die Forge-Config an einen externen Prozess koppeln, dessen Output-Format zwischen npm-Versionen variieren kann.

**Konsequenz:** Renderer-Bundle bleibt fett genug (1.78 MiB), weil Vite alle Pure-JS-Deps inlinet — das ist gewollt und macht den ASAR-Schlankheits-Effekt erst möglich. Wenn in Phase 3 ein neues Native-Modul (z.B. ein OS-Notifier oder eine zweite SQLite-Variante) hinzukommt, muss es **beide** Stellen treffen: external in `vite.main.config.ts` und Seed in `forge.config.ts`. Falls jemand das vergisst, schlägt der Pack im besten Fall lautstark fehl (Modul fehlt zur Laufzeit) — im schlimmsten Fall fehlt nur eine transitive Dep, die selten getroffen wird. Schutz: Smoketest-Erwartung „App startet, DB öffnet, PTY spawnt" muss vor jedem Release durch.

**Implementierungsdetail:** Scope-Verzeichnisse (`/node_modules/@<scope>`) müssen explizit durchgelassen werden, wenn der Scope ein prod-Paket enthält — sonst klemmt electron-packager den gesamten Subtree weg (ein erster Versuch schickte `@lydell/node-pty` komplett ins Off, weil der Scope-Knoten gefiltert wurde). `prodScopes` ist als separates Set vorab errechnet und in `isProdDepPath` als erste Bedingung gecheckt. `optionalDependencies` werden in die Closure mitgenommen, weil node-pty seine Plattform-Binaries (`@lydell/node-pty-win32-x64` etc.) so deklariert; ohne den Pfad fehlt die ConPTY-Binary im Windows-Pack.

---

## Custom-Session-Typ: dedizierte Label-Spalte statt Enum-Aufweichung

**Entscheidung:** Der fünfte Session-Typ „Eigene Art" landet als neuer Enum-Wert `'custom'` in `SessionType`, die freie Bezeichnung lebt in einer eigenen nullable Spalte `sessions.custom_type_label` (Migration 0005). Der Verlauf-Filter bündelt alle `custom`-Sessions in eine einzige Pille „Eigene Art" statt einer Pille pro vergebenem freien String.

**Varianten:**

- **A** Neuer Typ `'custom'` + dedizierte Label-Spalte (gewählt). Datenmodell bleibt streng typisiert, Filter ist deterministisch, freie Bezeichnung ist semantisch von `title` getrennt.
- **B** Enum aufweichen, freier String wird selbst zum `sessions.type`-Wert. Keine Migration, aber Tippfehler-Risiko (`"Refactor"` vs `"refactor"` → zwei Buckets), Filter-Liste explodiert mit jedem neuen freien String, zod verliert seine Schutzfunktion an der IPC-Grenze.
- **C** Freier Text wandert als Prefix in den Titel (`[Refactor] Auth-Cleanup`). Null Migration, aber die Bezeichnung kollidiert semantisch mit echten Titeln und Anzeige-/Filter-Logik müsste Titles parsen.

**Grund:** A ist die einzige Variante, die das Datenmodell sauber hält — eine zusätzliche Spalte kostet einmalig eine triviale Migration und liefert dafür deterministisches Filtering, klare Typ-Validierung (zod-`superRefine` macht das Label bei `type='custom'` zur Pflicht und ignoriert es anderwärts) und keine Title-Sondersemantik. B löst das eigentliche Problem nicht — eine offene String-Domain in `sessions.type` würde sofort Filter-Explosion und Migrations-Bedarf nach hinten verschieben, sobald der erste User merkt, dass „Refactoring" und „Refactor" als zwei Buckets erscheinen. C bricht die Title-Eindeutigkeit und macht Anzeige-Refactors anfällig, weil jede Title-Anzeige zwei Pfade kennen muss.

**Konsequenz:** Season-Number-Allocation bleibt `feature`-exklusiv — `custom` bekommt keine Nummer (gleiche Regel wie für `bug`/`review`/`docs-sync`). HistoryActionModal und HistoryPane zeigen bei `type='custom'` die `custom_type_label`-Bezeichnung statt des generischen Mappings; das Fallback-Label „Eigene Art" greift nur, falls eine Session unerwartet ohne Label in der DB landet (sollte durch das zod-`superRefine` ausgeschlossen sein, ist aber defensives Rendering). Verlauf-Filter-Pille „Eigene Art" bündelt alle Custom-Sessions absichtlich — würde der User später viele Bezeichnungen vergeben, bleibt die Pillenliste konstant. Eine „pro freier Bezeichnung eine eigene Pille"-UX wäre erst sinnvoll, wenn der User wirklich nach einer Sub-Kategorie filtern will, was im Daily-Use unwahrscheinlich ist.

**Implementierungsdetail:** Der `superRefine`-Pflicht-Check sitzt an der IPC-Grenze, nicht nur am Submit-Button — der User kann das UI-Disable durch DevTools manipulieren, der Main-Handler lehnt ungültige Payloads trotzdem ab. Length-Cap auf 60 Zeichen entspricht der Verlauf-Spalten-Breite (mehr wäre via Tooltip lesbar, nicht in der Tabellen-Zelle). `customTypeLabel` zieht im Renderer als optionale Prop durch SessionTab → TerminalTab → `pty:create`; beim Resume aus dem Verlauf nehmen HistoryPane und HistoryActionModal die Bezeichnung aus dem `SessionHistoryEntry` mit in den neu angelegten Tab, damit der Wiederaufgriff dieselbe Anzeige trägt.

---

## Templates-Fenster ist kein Modal mehr, sondern ein draggable Tool-Panel

**Entscheidung:** Das Templates-Fenster verliert den `td-modal-backdrop`-Wrapper und wird als `position: fixed`-Panel direkt auf dem Viewport gerendert, mit einem Drag-Griff am Header. `aria-modal` entfällt — `role="dialog"` bleibt für Screenreader. Click-Outside-Close gibt es nicht mehr (es gibt kein Outside-Element mehr, das den Trigger trägt); Esc und `×` schließen weiter. Position-State liegt im Component (`useState<{x,y}>`), Initial-Wert in einem Mount-Effect (Viewport-Zentrierung).

**Varianten:**

- **V1** Minimal: Backdrop weg, Modal bleibt zentral fixiert. Wenn es den Editor verdeckt: Esc + Wieder-Öffnen. Minimaler Aufwand, aber bei der eigentlichen User-Motivation („nebenbei im Editor lesen") immer noch ein Reibungspunkt.
- **V2** Draggable Tool-Panel (gewählt): Backdrop weg + Drag-Griff am Header. Pointer-Events-basiert (pointerdown/pointermove/pointerup), Bounding gegen Viewport. User kann das Fenster frei verschieben.
- **V3** Side-Pane: Templates wandert als dauerhafter Pane neben dem Editor ins Layout. Layout-Refactor, größere Implementierungszeit. Verworfen, weil der Use-Case Daily-Driver-Komfort ist, kein neuer Permanent-Slot.

**Grund:** V2 löst das eigentliche Reibungsproblem — Modal-Open hat den Editor blockiert, der User konnte keinen Text aus den `.md`-Files in die Modal-Inputs übernehmen, ohne das Fenster zu schließen. Der Drag-Griff ist die natürliche „Tool-Palette"-UX (vergleichbar mit IDE-Suchfeldern, die man wegschieben kann). V1 wäre Halbgenuss: das Fenster wäre zwar non-blocking, würde aber bei jedem zweiten Workflow im Weg sitzen und der User würde es genauso oft schließen/wieder-öffnen wie heute. V3 wäre Over-Engineering für einen Use-Case, der nicht jeden Tag eintritt — ein Permanent-Slot kostet ständig Screen-Real-Estate, ein Tool-Panel nur on-demand.

**Konsequenz:** Andere Modals (`NewSessionModal`, `PreCommitModal`, `SettingsModal`, `HistoryActionModal`, `UsageDetailModal`) behalten das klassische Backdrop-Verhalten — sie sind tatsächlich modal (User-Entscheidung erzwungen, keine Hintergrund-Interaktion sinnvoll). Templates ist der Sonderfall, weil das Modal mit anderen UI-Elementen kombiniert wird (Editor lesen, dann ins Modal-Form). Falls die Drag-UX später für weitere Tool-Panels nützlich wird, wandert die Logik in einen Shared-Hook (`useDraggablePanel`); aktuell ist sie lokal im TemplatesModal, weil Single-User reicht.

**Implementierungsdetail:** Drag-Listener werden via `useEffect`-Cleanup nur registriert, solange `dragOffset` gesetzt ist — kein dauerhaftes Pointer-Move-Abfangen am Window. Buttons im Header (`+ Neu`, `×`) bekommen kein eigenes Stop-Propagation; stattdessen prüft der PointerDown-Handler via `closest('button')`, ob das Event aus einem Button kommt, und beendet den Drag-Trigger früh. Damit funktioniert ein Klick auf `×` zuverlässig (kein „Mini-Drag" durch ein paar Pixel Maus-Wackeln), und neue Header-Buttons brauchen keinen extra Boilerplate. Bounding-Konstanten (80 px rechts/60 px unten) sind hartcodiert — wenn das Fenster sehr klein wird (z.B. Multi-Monitor mit kleinem Sekundär), müsste das überarbeitet werden, aber im 1080p+-Standard reicht es.

---

## Erweiterte Template-Variablen: Konvention-basierter Body, META-Filter, In-App-Edit über vorhandenen Editor

**Entscheidung:** Die drei neuen Auto-Variablen (`LETZTE_SEASON_NAME`, `TECH_SCHULDEN_RELEVANT`, `LETZTE_ENTSCHEIDUNGEN`) werden serverseitig über einen eigenen IPC `templates:resolve-auto-vars` aufgelöst, weil sie DB- (SessionRepository) und Datei-Zugriff (`docs/TECH_SCHULDEN.md` / `docs/ENTSCHEIDUNGEN.md`) brauchen und damit nicht in den Renderer gehören. Der Template-Body wird nach einer dateigetragenen Konvention extrahiert: erster Code-Fence unter `## Vorlage`, Fallback auf volle Datei. Doku-Parser filtern META-Sektionen über das Pflicht-Label im Body (`**Bereich:**` für Schulden, `**Entscheidung:**` für Entscheidungen) — naives `##`-Section-Splitting hatte die Erklär-Sektionen aus dem Datei-Kopf als Top-3-Einträge ausgegeben. Die In-App-Template-Verwaltung läuft über den bereits in Phase 1 (Sprint 7) gebauten Markdown-Editor: `✎`-Stift im Templates-Modal öffnet die `.md` als File-Tab im Right-Pane, `+ Neu` schreibt einen Stub und öffnet ihn ebenfalls dort.

**Varianten:**

- **A** Renderer-only: Auto-Variablen werden im Renderer befüllt, der Renderer liest die `.md`-Dateien selbst — verworfen, weil der Renderer kein direktes FS hat (Sandbox/contextIsolation) und für SQLite ohnehin auf den Main angewiesen ist.
- **B** Hybrider IPC pro Auto-Variable (`templates:get-last-season`, `templates:get-schulden`, …) — verworfen wegen Round-Trip-Vervielfachung (3 IPCs pro Modal-Open statt einer), kein Vorteil bei der Boundary-Validierung.
- **C** Ein gebündelter IPC `templates:resolve-auto-vars`, der alle Server-Werte in einem Roundtrip liefert (gewählt). zod-validiert, einheitliches Error-Handling, Default-Project-Bucket bekommt explizit leere Werte ohne FS-Touch.

Für die **Body-Extraktion**:

- **A1** Konvention „erster Code-Fence unter `## Vorlage`" mit Fallback auf volle Datei (gewählt). `SEASON_PROMPT.md` folgte der Struktur seit Sprint 6, kein Migrate nötig; einfache Templates ohne Erklärtext funktionieren via Fallback weiter.
- **A2** Explizite Marker-Kommentare (`<!-- TEMPLATE-START -->`/-END) — verworfen, weil alle Bestands-Templates angepasst werden müssten und die Marker im Markdown-Editor sichtbar bleiben (kein Klapp-Verhalten).
- **A3** YAML-Frontmatter mit `body:`-Feld — verworfen wegen mühsamer Mehrzeilen-Pflege in YAML.

Für das **Template-Management**:

- **M1** Edit-Stift öffnet den vorhandenen Markdown-Editor (gewählt). Nutzt die Phase-1-Editor-Infrastruktur, Templates bleiben als `.md`-Files Git-versionierbar, kein neuer Persistenz-Layer.
- **M2** In-Place-Editor im Modal (eigene CodeMirror-Instanz) — verworfen, weil eine zweite Editor-Komponente parallel zu warten wäre und Konflikt-Erkennung bei externem Edit mehr Aufwand als Wert liefert.
- **M3** Templates in eigener SQLite-Tabelle mit voller CRUD-UI — verworfen, weil Git-Versioning entfiele und der Migrationspfad für bestehende `.md`-Templates Aufwand ohne klaren Wert bedeutet.

**Grund:** Variante C bündelt die drei Server-Werte in einem Channel; die zod-Validierung greift an einer Stelle, der Renderer hat nur einen `Promise<Result>` zu verarbeiten. A1 ist der einzige Pfad ohne Datei-Migration und gleichzeitig defensiv durch den Voll-Fallback — Templates, die der Konvention nicht folgen, bleiben weiter funktional. Der META-Label-Filter ist die natürliche Heuristik der Doku-Konvention: Pflicht-Labels markieren echte Einträge, ihre Abwesenheit markiert Erklärtext-Sektionen. M1 nutzt einen Building-Block, der bereits vorhanden ist (Markdown-Editor + File-Tab-Store) und gewinnt damit „kostenlos" Auto-Save, Diff-View beim Editieren und konsistente Tab-Navigation.

**Konsequenz:** Server-Auto-Vars sind explizit opt-in pro Template — `SEASON_PROMPT.md` referenziert sie nicht im Default-Block, weil ein erster Patch die Vorlage zu invasiv erweitert hatte und der Erklär-Block der Datei dadurch eine doppelte Rolle bekam (Doku UND Default-Prompt). Neue Templates können die Tokens jederzeit einbauen; das Modal blendet die zugehörigen Sidebar-Felder dann automatisch ein. Mehrzeilige Auto-Var-Werte werden in der Sidebar als kompakter Snippet mit „Mehr"-Toggle gerendert, weil ein einfaches `white-space: pre-line` die Spalte bei Top-3-Einträgen mit langer Was-Zeile sprengt. Top-N für Schulden und Entscheidungen ist heute hartcodiert auf 3 — falls der Schmerz real wird (z.B. zu wenig oder zu viel Kontext im Prompt), wandert das in `settings.json`; dokumentiert in [TECH_SCHULDEN.md](./TECH_SCHULDEN.md).

**Implementierungsdetail:** `TemplateFile.relPath` ist im Shared-Type ergänzt und vom Main-Reader gefüllt — für Projekt-Templates mit Forward-Slash-Normalisierung (das `fs:read/write`-Schema verlangt Forward-Slashes), für globale Templates `null`. Damit weiß das Modal pro Eintrag, ob der Edit-Pfad verfügbar ist; der Edit-Stift ist für globale Templates disabled mit Tooltip-Hinweis auf den `%APPDATA%/TakumiDeck/templates/`-Ordner. Der Phase-Label-Helper (`derivePhaseLabel`) ist tolerant gegenüber Windows-Pfadtrennern und Case (`docs\\roadmap\\phase2.md` → `Phase 2`) — das `current_phase_file`-Feld kann beides liefern, je nachdem wie der User es geschrieben hat.

---

## Trigger-Phrasen-Schnellbuttons: dynamisch aus Frontmatter, Submit via separates CR

**Entscheidung:** Die Action-Bar rendert pro Eintrag aus `workbench.trigger_phrases` automatisch eine eigene Pille. Das zod-Schema akzeptiert über `.catchall(z.string().min(1))` beliebige zusätzliche Keys jenseits der zwei Pflicht-Keys (`docs_update` + `commit`). Die `commit`-Phrase wird aus der Pillen-Liste herausgefiltert, weil die bestehende commit-Pille mit PreCommit-Modal weiterläuft. Submit-Enter geht als separates Carriage-Return außerhalb des Bracketed-Paste-Blocks an die PTY, gesteuert über ein opt-in `submit: true`-Flag im `td-template-send`-Event.

**Varianten:**

- **A** Eine schlanke Pille hartcoded für `docs_update`, kein Schema-Touch. Roadmap-Beschreibung wäre nicht erfüllt — eine spätere dritte Phrase bräuchte ein zweites Mal Code.
- **B** Dynamische Pillen-Reihe mit Schema-Lockerung, alle Phrasen als eigene Pille sichtbar (gewählt).
- **C** Eine einzelne „▾ Phrasen"-Pille mit Dropdown-Menü — verworfen, weil bei den heute realistischen 2–3 Phrasen ein unnötiger Extra-Klick pro Send anfällt. Sinnvoll erst ab ~5 Phrasen.

**Grund:** B löst genau das Roadmap-Versprechen („dynamische Buttons aus `workbench.trigger_phrases`") und skaliert ohne Refactor. Die Schema-Catchall ist die natürliche zod-Form für „zwei Pflicht-Keys + offene Erweiterung" — eine spätere Migration auf `Record<string, string>` ohne Pflicht-Keys wäre unnötig, weil die zwei Standard-Keys von den Working-Rules referenziert werden und nicht wegfallen dürfen. C wäre eine Investition in UI-Mechanik (Popover, Outside-Click, ESC, Pfeil-Tastatursteuerung), die sich erst rentiert, sobald die Pillen-Reihe wirklich breit wird.

**Konsequenz:** `commit` ist als HIDDEN_KEY explizit in `triggerPhrasePills.ts` ausgeklammert — eine Sicherheits-Whitelist, kein Free-for-all-Filter (Why-Kommentar im Code). Wenn in einer späteren Phase weitere Pflicht-Phrasen mit eigenem Modal-Workflow dazukommen (z.B. ein `release`-Wizard), wandern sie zusätzlich in die Whitelist. Pillen-Sortierung: `docs_update` zuerst (Standard-Daily-Driver), danach alphabetisch — neue User-Phrasen reihen sich also vorhersehbar ein.

**Implementierungsdetail:** Submit-Enter via separates `\r` an die PTY ist nicht kosmetisch — Claude Codes TUI behandelt einen Newline **innerhalb** eines Bracketed-Paste-Blocks `\x1b[200~ … \x1b[201~` als „Newline im Eingabefeld einfügen" (Shift+Enter-Verhalten), nicht als Submit. Das CR muss zwingend außerhalb des Blocks ankommen, damit das TUI es als Tastatur-Enter erkennt. PreCommitModal hatte denselben latenten Bug (Phrase mit `\n` im Paste-Text) und wurde im selben Pass auf das `submit: true`-Flag umgestellt — der dortige „nach Send Modal schließen"-Pfad hat den Bug bisher kosmetisch maskiert, real wurde der commit-Trigger im TUI nie automatisch abgesendet. Templates absichtlich **nicht** auf `submit: true` — lange Prompts mit User-Variablen will man vor dem Send oft noch im Eingabefeld inspizieren.

---

## Screenshot-Drop: Ablage außerhalb des Projekts, Clipboard-Image-Paste mitgenommen

**Entscheidung:** Gedroppte und gepastete Direkt-Bilder werden in `<userData>/screenshots/` abgelegt, nicht in den aktiven Projektordner. Der eingefügte Text ist immer ein roher absoluter Dateipfad (mit Quotes nur bei Whitespace). Zusätzlich zum Drag-Drop greift derselbe Pfad bei `Ctrl+Shift+V` mit einem Bild in der Zwischenablage (Image-First im bestehenden `clipboardKeyHandler`).

**Varianten:**

- **A** Nur Drag-Drop, Ablage in `<userData>/screenshots/` außerhalb der Projekte.
- **B** Wie A, aber Ablage in `<projekt>/.screenshots/` — verworfen, weil jedes Projekt eine `.gitignore`-Pflege braucht, der Multi-Projekt-Fall (kein aktives Projekt) ohnehin auf A zurückfallen müsste und Screenshots semantisch keine Repo-Assets sind.
- **C** A + Clipboard-Image-Paste (gewählt). Image-First nur, wenn ein `imagePasteSaver`-Driver gesetzt ist; ohne Driver bleibt der klassische Text-Paste-Pfad aus Sprint 3.5 unverändert (Regressions-Schutz).

**Grund:** `Win+Shift+S` → Snip im Clipboard ist der reale Daily-Driver-Workflow für Windows-Screenshots — häufiger als ein expliziter Drag aus dem Explorer. Variante A allein hätte den halben Workflow abgedeckt. B koppelt das Feature an Projekt-Hygiene-Themen, die mit dem eigentlichen Feature-Kern (Bild → claude-Prompt) nichts zu tun haben. Der Ablage-Ort folgt der Working-Rule „konvenient vor traditionell" aus dem Auto-Memory.

**Konsequenz:** Die Screenshots-Ablage wächst über die Zeit; ein „Aufräumen"-Mechanismus ist Phase-2-Backlog (TTL oder Manual-Clear-Button in Settings). Die MIME-Whitelist im Schema (`PNG/JPEG/GIF/WebP`) ist auf die Browser-Standard-Drag-Drop-Formate beschränkt — SVG ist explizit raus, weil es als XSS-Vektor in Read-Tool-Antworten gefährlich wäre und claude-code es nicht als Bild-Quelle akzeptiert.

**Implementierungsdetail:** Bytes wandern als base64-String durch den `fs:save-screenshot`-IPC, nicht als `Uint8Array` oder `Blob`. Grund: `contextBridge` clont binäre Buffer-Typen über die Sandbox-Grenze nicht stabil; base64 ist verlustfrei, vom zod-Schema trivial validierbar (Längen-Cap auf 33 MiB ≈ 25 MiB roh) und im Renderer durch `btoa` über latin1-Chunks effizient herstellbar. `File.path` wurde in Electron 32 entfernt — die Bridge nutzt `webUtils.getPathForFile(file)` aus dem Preload-Context.

---

## State-Detection in Phase 2: TUI für `waiting`/`permission-prompt`, JSONL für `running`/`idle`

**Entscheidung:** Die volle State-Detection aus Phase 2 verteilt die Klassifikation auf zwei Quellen. `waiting` und `permission-prompt` werden ausschließlich vom Renderer per TUI-Pattern auf dem serialisierten xterm-Buffer erkannt und via `pty:tui-state`-IPC an den Main-Lifecycle gepusht. `running` und `idle` macht weiterhin der Main-Loop alle 2 s aus dem JSONL-Timestamp (Phase-1-Mechanik). Der JSONL-Loop überspringt running-Sessions mit stale JSONL — er darf `running` nicht eigenständig auf `idle`/`waiting` herunterstufen.

**Varianten:**

- **A** TUI nur für `permission-prompt`, JSONL für alles andere — verworfen, weil extended thinking / Perambulating den JSONL-Timestamp stale werden lässt, ohne dass Claude fertig ist. Die Session würde fälschlich auf `waiting`/`idle` kippen.
- **B** TUI für `waiting` + `permission-prompt`, JSONL für `running` + `idle`, mit Skip-Schutz für stale-running-Sessions (gewählt).
- **C** Komplette State-Detection im Renderer auf TUI-Patterns — verworfen, weil dann Crash-Recovery beim App-Start keine Quelle hat (Renderer noch nicht mounted) und der JSONL-Watcher seinen Token-Path-Datenfluss doppelt fahren müsste.

**Grund:** Die zwei Signal-Quellen messen unterschiedliche Dinge: JSONL = „schreibt Claude gerade?" (gut für running/idle, blind bei TUI-Prompts ohne JSONL-Output). TUI = „was zeigt Claude gerade an?" (gut für Input-Prompt + Permission-Dialog, blind für interne Aktivität ohne TUI-Refresh). Erst die Kombination deckt alle vier Status zuverlässig ab. Variante B macht beide Quellen verantwortlich für *eigene* Status — kein Konkurrenz-Schreibpfad, kein State-Flackern.

**Konsequenz:** Lifecycle-`ALLOWED`-Map ist Phase-2-typisch erweitert (running/idle → waiting/permission-prompt, und Rückweg → running). Bewusst verboten bleibt der Pfad `waiting`/`permission-prompt` → `idle`, damit der JSONL-Loop den vom Renderer gemeldeten TUI-Status nicht alle 2 s aushebelt. Pattern-Definition ist versioniert (`PatternVersion` mit `id`, Fixtures, Semver-Range pro Claude-Code-Version) — neue Claude-Code-Generationen kommen als zusätzlicher Eintrag dazu, alte Fixtures bleiben als Regressionsnetz grün. Box-Layout-Toleranz (`^\s*`) im waiting-Pattern war der konkrete Bug-Fix in Season 1 — diagnostiziert per Live-DevTools-Logging am echten Buffer.

---

## Electron auf 41 statt 42 (Code-Review Build/Konfig)

**Entscheidung:** Electron-Security-Bump landet auf 41.5.1, nicht auf der zum Review-Zeitpunkt aktuellen 42.0.1. Behebt die 18 High-CVEs aus dem npm-audit, ohne den Native-Module-Build-Pfad lokal zu brechen.

**Varianten:**

- **A** Electron 42.0.1 mit Source-Rebuild von `better-sqlite3` — scheitert auch mit VS Build Tools, weil die Quelle quelltext-inkompatibel mit V8 13.x ist (`v8::External::New/Value` Signatur-Bruch, `cppgc/heap.h` nutzt `__builtin_frame_address` als GCC/Clang-Intrinsic, MSVC kann es nicht auflösen).
- **B** Electron 41.5.1 mit Prebuilt-Binary von `better-sqlite3` 12.9.0 (ABI v145) — gewählt.
- **C** Electron 33 lassen — verworfen, trägt 18 High-CVEs.

**Grund:** Variante A scheitert nicht primär an der Build-Toolchain (das ließe sich lösen), sondern an einem **API-Bruch in V8 13.x**: `better-sqlite3` 12.9.0 ruft `v8::External::Value()` ohne `Isolate*`-Argument auf und `v8::Template::SetNativeDataProperty` als mehrdeutige Überladung — beides funktioniert nur gegen Electron-≤-41-Header. Zusätzlich nutzt `cppgc/heap.h` aus dem Electron-42-SDK ein GCC/Clang-Intrinsic, das MSVC nicht kennt. Variante A ist damit blockiert, bis `better-sqlite3` ein Release mit Electron-42-Support liefert (kein Datum, keine Prebuilts auf GitHub für ABI v146). Variante B kostet einen Minor-Electron-Versionsschritt — und alle 18 gemeldeten CVEs sind in `electron <= 39.8.4`, also durch B vollständig abgedeckt.

**Konsequenz:** Beim nächsten `better-sqlite3`-Release mit Electron-42-Prebuilds (oder beim Schritt auf eine SQLite-Library mit weniger Build-Toolchain-Ballast) kann der Electron-Bump auf 42 nachgeholt werden — als isolierter Maintenance-Pass. Slot offen in [TECH_SCHULDEN.md](./TECH_SCHULDEN.md). VS-2022-Build-Tools sind seit 2026-05-12 lokal installiert; sie sind als Reserve sinnvoll, lösen den Bump aber nicht — die Inkompatibilität ist in der Quelle, nicht im Compiler.

---

## Code-Review-Pass: Main-Hardening (Bereich 5 + Hotfix CSP-Dev-Block)

**Entscheidung:** Der Main-Prozess implementiert vier sicherheitsarchitektonische Policies, die im MVP-Pre-Release-Code-Review (2026-05-12, Bereich 5 + Hotfix `6fe11a9`) festgelegt wurden und ab v0.1 dauerhaft gelten:

1. **CSP doppelt verankert** — zusätzlich zum Meta-Tag im Renderer-HTML setzt `webRequest.onHeadersReceived` denselben CSP-Inhalt als HTTP-Header. Greift vor dem ersten Script-Tag, gilt auch für `file://`-Loads (Electronegativity CSP_GLOBAL_CHECK).
2. **CSP-Profil dev/prod-aware** — Production: strict `script-src 'self'`. Development: zusätzlich `'unsafe-inline'`/`'unsafe-eval'` (für Vite-6 `@vitejs/plugin-react` Fast-Refresh-Preamble) + `ws://localhost:5173` im `connect-src` (für HMR-WebSocket).
3. **shell.openExternal-Whitelist** — `setWindowOpenHandler` öffnet `http(s)`-Ziele explizit im System-Browser, andere Schemata (`file:`/`javascript:`/`data:`) bleiben blockiert. `will-navigate` blockt In-Place-Navigation aus dem Renderer und öffnet HTTP(S) extern (Electronegativity LIMIT_NAVIGATION_GLOBAL_CHECK).
4. **Default-deny Permission-Handler mit Clipboard-Whitelist** — `setPermissionRequestHandler` + `setPermissionCheckHandler` lehnen alle Browser-Permissions (Mikro, Geo, Notifications, MIDI, …) ab. Ausnahme: `clipboard-sanitized-write` und `clipboard-read` werden explizit whitelisted, weil das Terminal-Copy/Paste-Wiring (`clipboardKeyHandler`) sonst still scheitert — Chromes Auto-Grant für `clipboard-sanitized-write` wird durch den Override mit ausgehebelt (Hotfix nach Anwender-Report 2026-05-12, in CHANGELOG dokumentiert). Weitere Whitelist-Einträge bei Bedarf in zukünftigem Sprint (Electronegativity PERMISSION_REQUEST_HANDLER_GLOBAL_CHECK).

**Varianten** (für CSP-Profil dev/prod, die nicht-triviale der vier Entscheidungen):

- **A** Einheitliche strict-CSP, Vite-Dev über andere Plugin-Konfig ohne inline-Script — verworfen, weil `@vitejs/plugin-react`-Fast-Refresh-Preamble nicht ohne inline läuft und ein Custom-Plugin-Pfad fragil wäre.
- **B** Dev-Mode-Branch in der CSP-Definition (gewählt) — Dev ist Owner-Maschine, kein realistischer Threat-Vektor; Prod-Build wird identisch hardened wie vor dem Hotfix.
- **C** CSP nur als Meta-Tag (Status vor dem Hotfix) — verworfen, weil Vite-6 die Inline-Preamble nicht umgehen kann und der Renderer dadurch in Dev leer blieb.

**Grund:** Sicherheits-Policies, die im Code-Review als „Default-Hardening für ein lokales Daily-Driver-Tool ohne externe Surface" plausibel waren. CSP-Doppel-Verankerung kostet eine doppelt zu pflegende Stelle (Meta-Tag im Renderer + Header in `main.ts`) — Trade-off bewusst akzeptiert. Dev/Prod-Trennung ist die einzige nicht-triviale: sie öffnet im Dev-Mode bewusst die CSP-Lücke, weil die App lokal auf einer Owner-Maschine läuft und der Dev-Workflow (Fast-Refresh, HMR) sonst nicht funktioniert.

**Konsequenz:** Bei jeder Änderung der CSP-Werte beide Stellen synchron pflegen (Meta-Tag und Header). Wenn TakumiDeck später als signiertes Build über npm distributed wird, die Permission-Whitelist neu evaluieren (Notifications wären dann plausibel). Bei Vite-Update auf v7+ prüfen, ob die Fast-Refresh-Preamble nicht mehr inline kommt — dann Dev-CSP wieder verschärfen.

---

## UsageBar als Vorlage-treue Zeile statt Card (Sprint 9, Variant A)

**Entscheidung:** UsageBar im PlanPane rendert ohne eigenen Border und Card-Background — nur Label-Zeile + Track. Click-Target ist die ganze Zeile, Hover signalisiert Klickbarkeit ausschließlich über Color-Wechsel auf accent.

**Varianten:**

- **A** Vorlage-treue Zeile (gewählt — kein Border, kein bg, padding 0, hover via color-only)
- **B** Card-Optik beibehalten — TakumiDeck-Eigenheit dokumentieren

**Grund:** Working-Rule „bei Konflikt mit Vorlage gewinnt die Vorlage" zieht durch. Card war Sprint-7-Default, Vorlage hat reine Zeilen — die wirken eleganter und passen zur reduzierten Plan-Pane-Optik (kein Card-Stack, keine Border-Schwere). Track bekommt ohne Card-Border einen eigenen 1-px-Border + heller Background (`line-2`), damit die Bar trotzdem sichtbar bleibt.

**Konsequenz:** Click-Target ohne sichtbaren Card-Rand — Hover-Color-Wechsel ist die einzige Klickbarkeit-Markierung. Wenn das im Daily-Driver zu subtil wirkt, ist der Fallback ein Cursor-pointer + zarter Border via `outline: 1px solid transparent` mit Hover auf accent-line.

---

## Settings-Modal: 2-Spalten-Sidebar statt horizontaler Tab-Bar (Sprint 9, Variant A — D5)

**Entscheidung:** Settings-Modal-Body nutzt Grid `180 px 1 fr` mit linker `td-settings-sidenav` (App-konsistente `td-list-item`-Klassen) und rechter `td-settings-content`-Sektion. Inner-Scroll auf der Content-Seite, Outer-Scroll auf dem Body deaktiviert.

**Varianten:**

- **A** 2-Spalten-Sidebar nach Vorlage (gewählt)
- **B** Horizontale Tab-Bar mit `border-bottom`-Highlight beibehalten — als TakumiDeck-Eigenheit dokumentieren

**Grund:** Vorlage rendert das Settings-Modal als klassisches Preferences-Layout (app.jsx 422-431). Skaliert besser auf viele Tabs (6 aktuell, erweiterbar), Sidebar-Stil ist mit der App-Sidebar konsistent. Horizontale Tab-Bar war Sprint-8-Default ohne Vorlage-Bezug — Drift, die durch Sprint-9-Vorlage-Treue korrigiert wird.

**Konsequenz:** Sidebar-Buttons sind `td-list-item`-Klassen — Hover/Active-Verhalten erbt automatisch. Tab-Wechsel via vertikale Selektion (für Power-User mit Tastatur potenziell langsamer als horizontale `Tab`-Navigation, aber Settings ist kein Power-Use-Pfad). Bei künftiger Erweiterung um Account/API-Keys/Sync-Settings (Phase 5+) trägt das Layout ohne Refactor.

---

## Per-Bar `reset_schedule` als UI-Slot ohne Backend-Berechnung (Sprint 9)

**Entscheidung:** `LimitBar.reset_schedule?: { day_of_week, hour, minute }` als optionales Feld pro Bar. Schema validiert, JSON-Editor im Settings-Token-Tracking-Tab kennt das Feld, UsageBar-Tooltip zeigt „Reset: Montag 00:00 (Phase-2-Backend)" wenn gesetzt. **Aggregations-Logik nutzt den Wert noch nicht** — `usage:window` rechnet weiter mit Rolling-`window_hours`.

**Varianten:**

- **A** Globaler `weekly_reset` für alle weekly-Bars + Form-Felder im Settings-Tab
- **B** Pro-Bar `reset_schedule` im JSON-Editor (gewählt)

**Plus:**

- **a** UI-Slot, Backend Phase 2 (gewählt)
- **b** Auch Backend-Berechnung jetzt: `usage:window` startet beim letzten Reset-Zeitpunkt

**Grund:** Pro-Bar ist flexibler (verschiedene Limits könnten unterschiedliche Reset-Zyklen haben — z.B. Anthropic-Account vs. Claude-Design-Web vs. eigene custom-Filter), und der JSON-Editor ist für Power-User-Konfig sowieso da. UI-Slot statt Backend-Logik, weil:
- die echte Reset-Berechnung (window vom letzten Reset bis jetzt, nicht rolling) ist eine nicht-triviale Änderung am `usage:bucket`-Aggregat
- ohne reale Daten zur Reset-Cadence (Anthropic gibt keinen Account-API-Endpoint dafür) ist die UI-Eingabe sowieso nur eine Schätzung
- Phase 2 kann den UI-Slot direkt nutzen, kein UI-Refactor nötig

**Konsequenz:** Tooltip macht klar, dass es ein UI-Slot ist (`(Phase-2-Backend)`-Suffix). User können den Wert setzen, ohne dass die Bar-Berechnung sich ändert — kein Verwirrungs-Risiko. Phase-2-Backend-Arbeit ist isoliert auf das `usage:window`-Aggregat.

---

## Settings-Persistenz: Auto-Save pro Form-Field statt Save-Button

**Entscheidung:** Form-Inputs im Settings-Modal triggern beim Tippen einen 500-ms-debounced Patch via `settings:set` — kein expliziter Save-Button. Mehrere Felder werden in einem einzelnen Patch koalesziert (`createDebouncedSaver` puffert pro Tick und feuert atomar). Der Raw-JSON-Editor (für `limit_bars[]`, `sensitive_file_patterns[]`) hat einen separaten „Anwenden"-Knopf, weil unfertiges JSON sonst die `settings.json` verkrüppeln würde.

**Varianten:**

- **A** Auto-Save pro Field (gewählt — V2-A)
- **B** Expliziter Save-Button mit Dirty-Indikator
- **C** Save+Schließen kombiniert im Modal-Footer

**Grund:** Settings-Tweaks im Daily-Driver sind kleine Korrekturen („P90-Window von 192 auf 168 ziehen", „Modell-Limit auf 200 k") — kein Modal-Overhead pro Tweak. Pattern ist konsistent mit dem 500-ms-Notes-Save (Sprint 3) und dem 500-ms-CodeMirror-YAML-Linter (Sprint 7). Variante B würde jeden Tweak einen Klick mehr kosten; Variante C zwingt Modal-Reopen pro Setting. Raw-JSON ist explizit ausgenommen, weil ein zwischenzeitlich kaputter Buffer den Server schreiben würde — beim Tippen ist „valid JSON" ein hartes Pre-Check.

**Konsequenz:** Lokaler optimistischer State pro Modal — der Eingabewert ist sofort sichtbar, der Server-Roundtrip ersetzt ihn beim nächsten Tick. SaveStatusBadge zeigt „Auto-Save aktiv / Speichert… / ✓ Gespeichert (N Felder) / ⚠ <Fehler>" als dezenten Indikator unten links. Beim Modal-Close wird einmal explizit `flush()` getriggert, damit die letzten <500 ms Tipps nicht verloren gehen.

**Implementierungsdetail:** `createDebouncedSaver(api, { scheduler })` mit injectable Scheduler — Tests fahren mit Manual-Scheduler statt vi.useFakeTimers, deterministisch. Lokale Schema-Validation via `AppSettingsPatchSchema.safeParse` BEVOR der IPC läuft, damit ungültige Werte als error-Outcome ohne Server-Belastung gemeldet werden.

---

## JSON-Editor-Validation: Live-Lint debounced statt on-Save

**Entscheidung:** Der CodeMirror-6-Raw-JSON-Editor (für `limit_bars[]`, `sensitive_file_patterns[]`) hat einen `linter`-Extension mit 300-ms-Debounce, der bei jedem Tipp den aktuellen Buffer gegen ein zod-Schema parst und Fehler-Marker an der jeweiligen Zeile setzt. Der „Anwenden"-Knopf ist nur aktiv, wenn der Linter keine Fehler meldet.

**Varianten:**

- **A** Live-Lint via zod-Parse beim Tippen, debounced 300 ms (gewählt — V1-A)
- **B** on-Save: Fehler erst beim Anwenden-Klick als Toast
- **C** on-Blur: Marker erst, wenn der Editor-Fokus rausgeht

**Grund:** Daily-Driver-Pattern: wer JSON tippt, will sofort wissen, ob's noch Sinn ergibt. Variante A ist konsistent mit dem Sprint-7-YAML-Linter (auch debounced). Variante B verschiebt das Feedback zu spät — User klickt Apply, sieht Fehler, muss zur Stelle scrollen. Variante C unterdrückt Tipp-Lärm, aber auch jede Live-Bestätigung — ungewöhnlich für CodeMirror-Erfahrung. 300 ms (nicht 500 ms wie YAML) sind eine kürzere Pause, weil JSON-Strukturfehler lauter sind als YAML-Indentation-Drift und sofortige Sichtbarkeit hilft.

**Konsequenz:** `JsonRawEditor`-Komponente nimmt eine `validate(source) → { value, errors }`-Funktion injected — Tests können Pure-Validierung gegen synthetische Buffer fahren. CM6-Diagnostics-Marker mappen Zeile 1 als Fallback bei strukturellen JSON-Fehlern, weil `JSON.parse` keine Position-Info im Standard-Error liefert.

---

## Crash-Recovery: ended_at = MAX(messages.ts) statt now()

**Entscheidung:** Reconciliation-Pass beim App-Start patcht orphane running/idle-Sessions mit `ended_at IS NULL` auf `interrupted` und korrigiert `ended_at` anschließend auf den letzten `messages.ts` der Session (genauester verfügbarer Crash-Zeit-Approximator). Sessions ohne Messages bekommen `now()` als Fallback.

**Varianten:**

- **A** `ended_at = now()` beim App-Start
- **B** `ended_at = null`, nur Status patchen
- **C** `ended_at = MAX(messages.ts WHERE session_id)`, Fallback `now()` (gewählt — V4-C)

**Grund:** Variante A zeigt im Verlauf-Detail „endete heute Mittag", obwohl der Crash gestern Abend war — User wird verwirrt. Variante B verzichtet auf Dauer-Berechnung („Endete: —" optisch ehrlich, aber nutzlos für Reporting). Variante C ist genauer — der Timestamp der letzten claude-Antwort vor Crash ist die beste verfügbare Approximation. Kosten: ein indizierter `MAX(ts)`-Query pro Karteileiche, bei der Größenordnung (selten >1-2 pro Crash) vernachlässigbar.

**Konsequenz:** Neues Modul `src/main/sessions/reconciliation.ts` mit Driver-Injection (SessionRepository + MessageRepository + Lifecycle). Lifecycle-Transition setzt `ended_at = clock()` initial, danach explizites `sessions.update()` mit dem MAX-Wert — kein State-Machine-Touch nötig, weil running/idle → interrupted seit Sprint 5 erlaubt ist. Idempotent: zweiter Pass macht nichts mehr (alle Live-Sessions sind dann bereits interrupted).

---

## Datei-Tab-Persistenz: nur Tab-Liste, kein Buffer-Cache

**Entscheidung:** `useFileTabsStore.hydrateFromStorage` rekonstruiert Tab-Identitäten (id/kind/relPath/label + activeId pro Projekt) aus localStorage und triggert für jeden file-Tab einen `fs:read` im Hintergrund. Unsaved Buffer werden NICHT persistiert — der User muss vor App-Schluss bewusst Ctrl+S drücken (Sprint-7-Konvention „manueller Save").

**Varianten:**

- **A** Nur Tab-Liste, Inhalt re-fetched (gewählt — V5-A)
- **B** Tab-Liste + unsaved Buffer im localStorage
- **C** Tab-Liste + Buffer + Konflikt-UI bei extern editierten Files

**Grund:** Variante B müsste mit dem Edge-Case „Datei wurde extern editiert während App geschlossen war" umgehen — entweder still überschreiben (Datenverlust) oder Konflikt-UI bauen (Variante C). Variante C ist Konflikt-Modal-Aufwand für einen seltenen Fall. Variante A ist konsistent mit Sprint-3-Notes-Save-Pattern (Daten leben in der DB, Restart sauber) und vermeidet das Datei-Konflikt-Problem komplett. Manuelle-Save-Konvention aus Sprint 7 deckt den Buffer-Verlust-Fall: der User ist gewohnt, Ctrl+S zu drücken, weil die Editor-Toolbar einen ●/○-Indikator hat.

**Konsequenz:** Schema-versioniert mit `v: 1` — künftige Tab-Felder können einen Schema-Bump auslösen, der alte Snapshots still verwirft. localStorage-Schreibwege sind in `persistCurrent(getter)` zentralisiert: jede Mutation, die Identität/Reihenfolge/Active-Pointer ändert, schreibt sofort. `setDirty/setSaved` schreiben bewusst nicht — Dirty-Status ist ohnehin nicht persistiert.

---

## Sensitive-File-Patterns: additiv zu hartcoded Defaults

**Entscheidung:** Neue Settings-Spalte `sensitive_file_patterns: string[]` (Default `[]`) wird ZUSÄTZLICH zu den hartcoded Defaults (`.env(.*)`, `secrets.*`, `*.key`, `*.pem`) ausgewertet. Defaults sind nicht abschaltbar — der User kann nur erweitern. User-Patterns matchen auf den ganzen `relPath` (nicht nur den Basename), damit Regeln wie `config/private/.*` möglich sind.

**Varianten:**

- **A** Additiv (gewählt — V8-A)
- **B** User-Patterns ersetzen die Defaults komplett
- **C** Additiv mit `disable_default_sensitive_patterns`-Flag

**Grund:** Die hartcoded Defaults sind universell richtig — es gibt kein Projekt, in dem `.env` *nicht* sensitiv ist. Variante B würde User erlauben, sich versehentlich in den Fuß zu schießen (Defaults löschen, später `.env` exposen). Variante C wäre Phase-2-Power-User-Komfort, kostet aber Komplexität für einen ungeklärten Bedarf. Variante A deckt 100 % der realistischen Custom-Cases ab (eigene Konventionen wie `*.credentials.json`, `vault.yml`) ohne Sicherheits-Downgrade.

**Konsequenz:** `findSensitiveFiles(paths, userPatterns)` nimmt das Array als zweiten Parameter; ungültige RegEx-Quellen werden still gedroppt (Aufrufer kann via `validateUserPatterns` für UI-Hint nachfragen). PreCommitModal reicht `settings.sensitive_file_patterns` durch. Settings-Dialog hat den JSON-Editor in der Workspace-Tab.

---

## Header-Bar: native Frame entfernt, td-titlebar übernimmt komplett

**Entscheidung:** `BrowserWindow` wird mit `frame: false` erstellt — die native Electron-Title-Bar ist weg. Die td-titlebar (36 px hoch, Architektur 6.0) übernimmt Drag-Region (`-webkit-app-region: drag`) und Window-Controls (min/max/close via IPC `app:window-action`). Keine doppelte Header-Reihe.

**Varianten:**

- **A** `frame: false`, nur td-titlebar (gewählt nach User-Screenshot)
- **B** Native Frame + td-titlebar parallel
- **C** Native Frame, keine td-titlebar (Sprint-8-Rückabwicklung)

**Grund:** Variante B war der initiale Sprint-8-Stand und produzierte einen Doppel-Header (Electron's native + meine td-titlebar zeigen beide „TakumiDeck"). User-Feedback zum Screenshot machte das offensichtlich. Variante C würde Brand, Projekt+Branch+Sessions-Anzeige und den Settings-Button verlieren — nicht akzeptabel. Variante A ist die saubere Implementierung der Architektur-6.0-Spec, die ohnehin „Window-Controls (minimieren, maximieren, schließen)" als Teil der Header-Bar definiert hatte.

**Konsequenz:** OS-Resize-Handles bleiben funktional (Electron-Default), Drag funktioniert über `-webkit-app-region: drag` auf `.td-titlebar`, Buttons innerhalb sind `no-drag`. macOS würde traffic-lights verlieren, aber TakumiDeck ist Windows-primär (Architektur K3). Phase 5+ könnte einen `titleBarStyle: 'hidden'`-Pfad für macOS dazustellen, falls die App jemals dorthin portiert wird.

---

## Mid-Spalten-Verteilung: 1.6fr/1fr statt 1fr/1fr

**Entscheidung:** Das App-Grid ist `240px 1.6fr 1fr 232px` — Mid-Spalte (Terminal/Verlauf) bekommt ~62 % der mittleren Fläche, Editor ~38 %. Sprint-7 hatte 1fr/1fr; bei realer Bildschirmbreite war die Tabelle in der HistoryPane + die Filter-Pillen für 50 % zu eng (clipping in `overflow: hidden`).

**Varianten:**

- **A** 1.6fr/1fr — Terminal/Verlauf bekommt mehr Platz (gewählt nach User-Screenshot)
- **B** Bei 1fr/1fr lassen, nur Filter-Wrap fixen
- **C** Editor ein-/ausklappbar machen

**Grund:** Variante B hätte den Filter-Bug allein gefixt, aber die Tabelle bleibt in 6 Spalten auf 640 px gequetscht. Variante C ist Phase-2-Komfort — Toggle-Komponente plus Persist plus Layout-Reflow beim Klick. Variante A ist die billigste Lösung mit dem größten Effekt: zwei Zeichen in `app.css`, Daily-Driver-Workflow „Terminal links + Code-Edit rechts gleichzeitig sehen" funktioniert weiter, Editor ist schmaler aber CodeMirror skaliert problemlos.

**Konsequenz:** Sprint-7-Layout-Spec war nicht eindeutig zu 1fr/1fr — das Design-Handoff-`styles.css` hat das Grid mit `1fr 1fr` gezeichnet, aber das war eher Initial-Wireframe als bindende Spec. Bei 32"-Monitoren (typische Daily-Driver-Konfiguration ~2560 px breit) sind beide Spalten weiter komfortabel groß; bei 14" (~1366 px) ist Mid jetzt ~700 px statt 560 px — knapp ausreichend für die Tabelle.

---

## Build-Distribution: Squirrel-Setup + Portable-ZIP parallel

**Entscheidung:** `npm run make` produziert beide Artefakte: Squirrel-Setup-EXE (klassische Windows-Installation mit Start-Menü-Eintrag) UND Portable-ZIP (entpackbar auf USB-Stick). Forge-Config hatte `MakerSquirrel` + `MakerZIP` schon konfiguriert; Sprint 8 bestätigt das als verbindliche Distribution.

**Varianten:**

- **A** Squirrel-Default mit totem Auto-Updater-Stub
- **B** Squirrel + Portable-ZIP (gewählt — V6-B)
- **C** Nur Portable-ZIP, kein Installer

**Grund:** Variante A reicht für die Stamm-Maschine, hilft aber nicht bei „mal schnell auf der zweiten Maschine probieren" oder „an Freunde weitergeben". Portable-ZIP entspannt zusätzlich den SmartScreen-Stress (kein Code-Signing im MVP, Architektur 12) — Doppelklick auf entpackten Ordner überspringt die Installer-Warnung komplett. Variante C verliert Start-Menü-Komfort und macht Updates schwerer. B kostet kaum mehr Build-Zeit und gibt beide Distribution-Pfade.

**Konsequenz:** Manuelle GitHub-Release-Anleitung in `docs/DEV_SETUP.md`: Version bumpen → `npm run make` → Setup-EXE + ZIP als Asset hochladen → Release publish. Auto-Update wäre Phase 5+ via electron-updater, GitHub Actions Build wäre Phase 5+ bei aktiver Distribution.

---

## Right-Pane-Layout: 4-Spalten-Grid statt 232-px-Single-Pane

**Entscheidung:** App-Layout ist ein 4-Spalten-Grid (240 / 1fr / 1fr / 232 px) mit zwei Zeilen (1fr / 300 px). Editor und Diff bekommen eine eigene breite Spalte (3. Cell, oben); Files und Notes leben als schmaler Stack ganz rechts (4. Cell, full-height); PlanPane sitzt unter dem Editor (3. Cell, unten); StatsPane bleibt unter dem Terminal (2. Cell, unten). Klassen-Vokabular `td-col-mid-top / -mid-bottom / -right-top / -right-bottom / -right-stack` 1:1 aus `docs/design/claude-export/styles.css`.

**Varianten:**

- **A** Single-Right-Pane (232 px, drei Sektionen vertikal: Editor/Diff oben + Files mitte + Notes unten) — Sprint-7-Briefing-Wortlaut
- **B** 4-Spalten-Grid wie Design-Handoff: Editor in eigener `1fr`-Spalte, Files+Notes als `td-col-right-stack`-Spalte ganz rechts (gewählt nach User-Feedback)
- **C** Editor verdrängt das Terminal über einen Mitte-Toggle (Design-Handoff-„midPanel"-Tweak) — wäre Phase-2-Komfort, kostet aber Sicht auf Terminal + Editor parallel

**Grund:** Variante A war der pragmatische Erstwurf aus dem Briefing — 232 px für einen vollständigen Markdown-Editor sind aber zu eng (Code wickelt nach 30 Zeichen, YAML-Linter-Marker schwer lesbar). User-Feedback nach Phase 4: „in der Vorlage sieht es besser aus" — und die Design-Vorlage hat von Anfang an 4 Spalten gezeichnet, nicht 3 mit Editor im schmalen Stack. Variante C wäre ein moderner Toggle-Pfad gewesen, kostet aber den Daily-Driver-Use-Case „Terminal links + Code-Edit rechts gleichzeitig sehen", der das Hauptargument für eine Multi-Pane-Workbench ist.

**Konsequenz:** PlanPane wandert von Mitte-unten nach Editor-unten (3. Spalte, untere Zeile). Die ehemaligen `.td-app-content / -row-top / -row-bottom`-Flex-Container entfallen — das CSS-Grid macht das in einem Schritt. `RightPane.tsx` wird in `EditorPane.tsx` (Editor + Diff) und `RightStack.tsx` (Files + Notes) aufgeteilt, eine Komponente pro Grid-Cell. Die Sidebar verliert ihre explizite 240-px-Breite — Grid-Cell `.td-col-left` ist jetzt die Quelle.

**Implementierungsdetail:** Trennstriche zwischen Cells laufen über `gap: 1px; background: var(--td-line)` am Grid statt über `border-right`/`border-left` an den einzelnen Cells. Genau die Design-Handoff-Implementierung.

---

## Markdown-Editor: manueller Save (Ctrl+S) statt Auto-Save

**Entscheidung:** Ctrl+S triggert `fs:write`; Editor-Toolbar zeigt einen Save-Button und einen Dirty-Indikator („○ tippt…/● gespeichert"). Pure-Logik-Util `editorDirtyState` mit `saved`/`buffer`-Strings + `isDirty/updateBuffer/markSaved`. Auto-Save gibt es bewusst NICHT.

**Varianten:**

- **A** Manueller Save mit Ctrl+S + dirty-Indikator (gewählt — Architektur 6.8 + Roadmap-Wortlaut)
- **B** Debounced Auto-Save 500 ms wie Notes (Memory-Default-Pfad „konvenient vor traditionell")
- **C** Hybrid: Auto-Save 1.5 s + Ctrl+S Force

**Grund:** Notes sind ephemeres Pad-Editing — Auto-Save passt. CLAUDE.md / CHANGELOG / Roadmap-Files sind aber versionierte Doku, die der User bewusst editiert, dann den Diff anschaut, dann den commit-Trigger sendet. Auto-Save würde unbeabsichtigte Tipps sofort persistieren und den manuellen Diff-/Commit-Workflow korrumpieren — der dirty-Stand ist hier ein Feature, nicht ein Reibungspunkt. **Bewusste Abweichung von der „UX-Defaults: konvenient vor traditionell"-Memory-Konvention** — Architektur 6.8 + Roadmap-Spec waren eindeutig, und die Workflow-Begründung trägt.

**Konsequenz:** Memory-Konvention bleibt für reine UX-Picks gültig (Daily-Driver-bevorzugte Pfade), aber Spec hat Vorrang, wenn die App-Workflow-Logik auf Sichtbarkeit von Zwischenzuständen baut (hier: dirty vs. saved als Trigger für die User-Entscheidung „commit jetzt vs. weiter editieren").

---

## Datei-Tab-Stack pro Projekt statt globale Tab-Liste

**Entscheidung:** `useFileTabsStore` hält `tabs: Record<projectId, FileTab[]>` und `activeId: Record<projectId, string|null>`. Beim Project-Wechsel sieht der User die Datei-Tabs des neuen Projekts; die alten bleiben in-memory erhalten und kommen zurück, wenn er das Projekt erneut aktiviert. Diff-Tab ist Sonderfall mit fester ID `'diff'` und sitzt immer ganz links pro Projekt-Stack.

**Varianten:**

- **A** Alle Datei-Tabs verwerfen beim Project-Wechsel
- **B** Per-Projekt-Stack analog Sprint-4-Terminal-Tabs (gewählt)

**Grund:** Daily-Driver-Case ist Multi-Tasking zwischen Projekten — A würde User dauerhaft frustrieren. B ist konsistent mit dem etablierten Terminal-Tab-Pattern (Sprint 4 Variante A: Tabs sind projekt-scoped, alle dauerhaft mounted). Implementierungsaufwand für B: ~80 Zeilen Store + 12 Tests; A wäre ~10 Zeilen, hätte aber UX-Schaden.

**Konsequenz:** Persistenz nur In-Memory beim App-Lauf — kein DB-Schema-Touch (Sprint-7-Auflage „keine neue Migration"). Beim App-Restart sind die Datei-Tabs weg, genau wie Terminal-Tabs in Sprint 4. Phase 2+ kann das in `localStorage` persistieren, wenn der Daily-Driver-Use-Case das fordert.

---

## Sensitive-File-Patterns: hartcoded statt konfigurierbar

**Entscheidung:** Pure-Logik-Util `isSensitiveFile` matcht den Datei-Basename gegen vier RegEx-Pattern: `^\.env(\..+)?$/i`, `^secrets\..+$/i`, `\.key$/i`, `\.pem$/i`. Settings-konfigurierbar wäre eine `sensitive_file_patterns: string[]`-Spalte in `AppSettings` — bewusst nicht implementiert.

**Varianten:**

- **A** Hartcoded-Liste (gewählt)
- **B** Konfigurierbar via `settings.json` mit denselben Defaults

**Grund:** Settings-Dialog kommt erst Sprint 8 — bei B müsste der User bis dahin die `settings.json` per Texteditor anfassen, um eigene Patterns zu ergänzen. Defaults decken die Standard-Cases (Twelve-Factor-`.env`, CI-Secrets, SSL-Keys/PEMs) bereits ab. „Hartcoded mit klarem Erweiterungs-Pfad bei echtem User-Bedarf" ist sauberer als „konfigurierbar, aber ohne UI".

**Konsequenz:** Sprint 8 (Settings-Dialog) kann die Liste in den UI-Editor ziehen, wenn nach erstem User-Test echte Custom-Patterns nachgefordert werden. Das `findSensitiveFiles`-API ist schon driver-frei, der Settings-Hook wäre eine 5-Zeilen-Verdrahtung.

**Implementierungsdetail:** Match läuft auf den BASENAME, nicht auf den ganzen Pfad — sonst würde `docs/keyboard-notes.md` als sensitiv markiert, weil der Pfad „key" enthält. Defensiv-Test deckt diesen False-Positive-Pfad ab.

---

## Diff-Viewer: @codemirror/merge.unifiedMergeView pro Datei statt Patch-Renderer

**Entscheidung:** Diff-Tab zeigt eine File-Liste oben (klickbar) und unten den Inline-Diff der ausgewählten Datei via `@codemirror/merge.unifiedMergeView`. Der Renderer holt parallel `git:show` (HEAD-Version) und `fs:read` (Working-Tree-Inhalt) und übergibt beide an die Extension — die berechnet den Diff intern und markiert Hinzufügungen/Löschungen inline.

**Varianten:**

- **A** Raw `git diff`-Output in einem CodeMirror-Plain-View mit eigener `+ / -`-Färbung (Design-Handoff-Pattern in `claude-export/components.jsx` `DiffViewer`)
- **B** `@codemirror/merge.unifiedMergeView` mit HEAD-Version als `original` (gewählt — Architektur 6.7 + Sprint-7-Briefing-Wortlaut)
- **C** Side-by-side `MergeView` aus demselben Paket — wäre Phase-2-Komfort, braucht mehr horizontalen Platz

**Grund:** Architektur 6.7 sagt explizit „Render mit @codemirror/merge"; das Briefing wiederholt das. Variante A war einfacher (kein zusätzliches `git:show`-IPC), hätte aber die Spec gebrochen und wäre kein „echter" Inline-Diff (kein Edit-fähiges Original-Reference). Variante C ist Phase 2 — im 1fr-breiten Editor-Slot reicht unified.

**Konsequenz:** Neuer IPC-Channel `git:show` mit `showFile(repoPath, relPath, ref='HEAD')`-Method im GitDriver. Untracked Files werfen einen simple-git-Error („exists on disk, but not in HEAD") — der Driver fängt das ab und liefert leeren String, sodass der unifiedMergeView alle Working-Tree-Zeilen korrekt als Hinzufügung markiert. Read-only via `EditorView.editable.of(false) + EditorState.readOnly.of(true)`.

---

## Sidebar-Layout: 3 Sektionen statt View-Toggle

**Entscheidung:** Die LeftSidebar rendert drei vertikal gestapelte `td-panel`-Sektionen (Projekte / Aktive Sessions / Verlauf) wie im Claude-Design-Handoff (`docs/design/claude-export/components.jsx`). Klick auf ein aktives Tab-Item wechselt zur Terminals-Hauptansicht und aktiviert den Tab; Klick auf einen Verlauf-Eintrag wechselt zur Replace-View des HistoryPane mit dem Item vorausgewählt. Modal-State (NewSession/Templates) liegt im `useUiStore`, weil sowohl die Sidebar als auch die Tab-Bar Buttons besitzen, die dieselben Modale öffnen.

**Varianten:**

- **A** Projekt-Liste + View-Toggle „Tabs / Verlauf" pro aktivem Projekt (Sprint-6-Initial-Implementation)
- **B** 3 Sektionen wie im Design-Handoff (gewählt)
- **C** Sidebar nur für Projekte; Tabs und Verlauf ausschließlich oben/im Replace-View

**Grund:** Variante A war der pragmatische Erstwurf für den Replace-View-Pattern (Q4 Variante A), aber der User-Feedback-Hinweis war eindeutig: das Design-Handoff hat von Anfang an drei Sektionen geplant, und die volle Sichtbarkeit ist für Daily-Driver-UX wertvoll — Aktive Sessions in der Sidebar erlauben Multi-Tab-Übersicht ohne Tab-Bar-Scrolling, und der Verlauf-Quick-Access (10 jüngste pro Projekt) macht den Schritt ins HistoryPane optional. Variante C verschenkt diesen Komfort komplett.

**Konsequenz:** Tab-Bar oben im Hauptbereich BLEIBT — Sidebar und Tab-Bar sind synchronisierte Ansichten. Doppelte UI-Pfade sind hier Feature, nicht Bug: in der Praxis nutzt der User die Sidebar zum Multi-Tab-Überblick und die Tab-Bar zum Schnellwechsel beim Schreiben. Tote `.td-sidebar-*`-CSS-Blöcke aus dem Pre-3-Sektionen-Layout sind als TECH_SCHULDEN-Eintrag markiert.

**Implementierungsdetail:** Verlauf-Quickliste in der Sidebar filtert Tabs aus, die schon offen sind — sonst würde derselbe Eintrag als „aktive Session" UND als „letzter Verlaufs-Eintrag" doppelt erscheinen. Das volle HistoryPane mit Filter und Tabelle bleibt für die Suche, die Sidebar-Quickliste ist nur Quick-Access für die jüngsten 10 Einträge.

---

## × auf Tab ist non-destruktiv, Archive ist explizit

**Entscheidung:** Sprint 3 hatte `× = archive + PTY-Kill` als ein Schritt; Sprint-6-UX-Fix trennt das in zwei Aktionen. `session:close` killt nur den PTY (falls running) und überlässt den Lifecycle-Übergang dem `pty:exit`-Handler (running/idle → completed). Der neue `session:archive`-Channel macht die explizite Lifecycle-Transition zu archived und ist nur über den Verlauf-Detail-Pane mit Inline-Confirmation erreichbar.

**Varianten:**

- **A** × schließt nur den Tab, kein Archive (= aktuelle Variante B-Logik), kein UI-Pfad zum Archivieren
- **B** A + Archive-Button im Verlauf-Detail-Pane mit Confirmation (gewählt)
- **C** × öffnet Confirmation-Modal („schließen / archivieren / abbrechen")
- **D** × wie Sprint 3 archiviert direkt, aber `archived → running` in der State-Machine erlauben

**Grund:** Editor- und Browser-Konventionen sehen × konsistent als „Tab weg, Datei/Inhalt bleibt" — Sprint-3-Spec brach das mentale Modell. Variante D weicht den `archived`-Endzustand der State-Machine auf, was die Sprint-3-Truth-Table-Tests entwertet und den semantischen Unterschied zwischen completed und archived verschwimmen lässt. Variante C zwingt Modal-Overhead pro × auf den 95-%-Fall (= „Tab weg") nur um den 5-%-Fall (= „wirklich loswerden") abzudecken. Variante A allein versteckt den Archive-Pfad komplett — Sessions stapeln sich ohne UI-Weg zum Aufräumen. B ist die einzige Variante, die beide Fälle sauber trennt: häufiger Pfad ist non-destruktiv, seltener Pfad hat einen klaren Knopf an der erwarteten Stelle.

**Konsequenz:** Sprint-3-Lifecycle-State-Machine bleibt **unverändert** — `archived` ist weiter Endzustand, alle Truth-Table-Tests grün. Die Trennung lebt rein in den IPC-Handlern und der UI: × → `session:close`, Archivieren-Button → `session:archive`. Default-Filter im HistoryPane blendet `archived` aus, damit die Liste nicht mit Karteileichen verstopft.

**Implementierungsdetail:** Inline-Confirmation statt Modal. Erster Klick auf „Archivieren" zeigt einen roten Banner mit „Wirklich? Session ist danach nicht mehr resume-fähig" plus Abbrechen + „Ja, archivieren". Zweiter Klick führt aus. Wenn der User den selektierten Eintrag wechselt, wird der Confirm-Marker automatisch abgeräumt — der Bestätigungs-Zustand klebt nicht auf der falschen Zeile.

---

## Resume-Bug-Fix: claude --session-id beim Spawn + Watcher-Backfill (Variante C)

**Entscheidung:** TakumiDeck spawnt neue Sessions mit `claude --session-id <takumi-uuid>`, sodass claude-codes interne Session-UUID identisch mit unserer `sessions.id` ist und `--resume <takumi-uuid>` nahtlos matcht. Für Legacy-Sessions (Sprint 2/3 + pre-Hotfix Sprint 6, gespawnt ohne `--session-id`) befüllt der JSONL-Watcher rückwirkend eine neue Spalte `sessions.claude_session_id` aus der UUID des JSONL-Filenamens. Resume nutzt `claude_session_id ?? id` und gibt `SESSION_NO_CLAUDE_UUID` zurück, wenn beides null ist.

**Varianten:**

- **A** Nur `--session-id` beim Spawn (neue Sessions sofort resume-fähig, Legacy-Sessions bleiben tot)
- **B** Nur Watcher-Backfill (Legacy-Sessions werden lebensfähig, neue Sessions haben Race-Window von ~100 ms-2 s nach Spawn)
- **C** Beide kombiniert (gewählt)

**Grund:** Sprint-5-ENTSCHEIDUNGEN.md („Sessions-Mapping über encodeCwd statt UUID") hatte angenommen, claude-code akzeptiere kein `--session-id`-Flag — Stand 2026-05-10 ist das überholt (siehe `claude --help`). Variante A war der saubere Weg für neue Sessions, hätte aber alle bestehenden Test-Sessions des Users dauerhaft als „nicht resume-fähig" zementiert (~19 Legacy-Sessions plus die in Sprint 6 erstellten). Variante B brachte für neue Sessions ein Race-Window — beim ersten Resume-Versuch direkt nach Spawn könnte die UUID noch nicht backfilled sein. C kombiniert die jeweiligen Stärken: Spawn-Pfad ist race-frei (UUID ist beim DB-Insert schon bekannt), Backfill-Pfad heilt den Altbestand sobald der Watcher die JSONL einmal gesehen hat.

**Konsequenz:** Migration `0003_claude_session_id.sql` mit nullable Spalte; alle bestehenden Rows bekommen `NULL`. `setClaudeSessionId(sessionId, claudeUuid)` ist idempotent (UPDATE WHERE id = ? AND claude_session_id IS NULL → atomarer Check-and-Set), kann pro JSONL-Tick aufgerufen werden, ohne vorher zu prüfen. Watcher-Backfill ist status-agnostisch (`listMissingClaudeSessionId()` liefert running/idle/completed/interrupted/error/archived), damit auch Legacy-completed-Sessions geheilt werden — Sprint-5-Live-Pfad (`resolveTakumiSession`) bleibt auf running/idle, weil dort Token-Inserts stattfinden und Doppelzählung bei completed unerwünscht wäre.

**Implementierungsdetail:** UUID-Extraktion erfolgt aus dem JSONL-Filename (`<uuid>.jsonl`), nicht aus der `sessionId`-Spalte der einzelnen Zeilen — pro File schreibt claude-code GENAU eine UUID, der Filename ist die einzige Quelle der Wahrheit. Bei mehreren Backfill-Kandidaten im selben encoded-cwd-Folder (mehrere TakumiDeck-Sessions ohne UUID, alle im selben Projekt) gewinnt die jüngste — gleiche Heuristik wie Sprint-5-`resolveTakumiSession`. Die Mehrdeutigkeit ist als TECH_SCHULDEN-Eintrag dokumentiert.

---

## Atomare Season-Counter-Allocation im Main

**Entscheidung:** `pty:create`-Handler ruft `projects.allocateSeasonNumber(projectId)` in einer better-sqlite3-Transaction (SELECT + UPDATE) auf, bevor die Session-Row geschrieben wird. Das returnt die Vorgänger-Nummer als Season-Wert; `next_season_number` ist danach um 1 höher persistiert. Nur für `type='feature'` — Bug/Review/Docs-Sync bekommen `null` (Architektur 6.6).

**Varianten:**

- **A** Renderer liest `next_season_number` aus dem Project-Store, vergibt sie im Modal, schickt sie als Teil des `pty:create`-Payloads
- **B** Atomar im Main-Handler in einer Transaction (gewählt)

**Grund:** Renderer-Increment ist die natürliche Quelle künstlicher Lücken: bei Modal-Abbruch wäre die Nummer schon vergeben, beim Spawn-Fehler ebenso, und zwei parallel geöffnete Modals könnten dieselbe Nummer ziehen. Variante B macht die Allocation race-frei — better-sqlite3-Transaktionen sind synchron + lokales File, der einzige verbleibende Lücken-Fall ist ein Hard-Crash zwischen Increment und sessions.create-Insert (Mikrosekunden-Fenster). Architektur 6.6 akzeptiert Lücken explizit, also kein Rollback-Aufwand nötig.

**Konsequenz:** Modal-Vorschau ist eine separate read-only-Berechnung (`activeProject.next_season_number` direkt aus dem Store), nicht durch einen IPC-Roundtrip. Wenn der User schnell zwei Sessions hintereinander öffnet, kann die zweite Modal-Vorschau einen veralteten Wert zeigen — der echte atomare Increment im Main vergibt aber die korrekte nächste Nummer. Akzeptable Drift, weil die Vorschau Komfort, nicht Wahrheit ist.

**Implementierungsdetail:** Driver-Methode `allocateSeasonNumber(projectId): number | null` mit Transaction in `SqliteProjectDriver`; Test-Driver simuliert das durch ein einfaches Read-Modify-Write im Map. Returnt null, wenn das Projekt nicht existiert — Defense-in-Depth, weil der Renderer-Filter im Sprint-4-Layout das eigentlich nicht zulässt.

---

## Verlauf-Panel als Replace-View statt Modal

**Entscheidung:** Die Verlauf-Liste mit Filter und Detail-Pane lebt im Hauptbereich des Layouts (= Tab-Slot wird bei `mainView === 'history'` durch das `HistoryPane` ersetzt), nicht in einem Modal-Overlay. TabContainer und HistoryPane werden BEIDE im DOM gerendert — der Wechsel ist nur ein CSS-`display`-Toggle, damit die xterm-Buffer der laufenden Tabs nicht disposed werden (Sprint-3-Pattern: alle Terminals dauerhaft mounted).

**Varianten:**

- **A** Replace-View (gewählt)
- **B** Modal-Overlay (analog UsageDetailModal)
- **C** Sidebar-Sub-Sektion mit Detail-Inline

**Grund:** Tabelle mit 6 Spalten + Filter-Bar + Detail-Pane braucht horizontalen Platz — ein Modal wäre dafür gequetscht (max 540 px Standard / 820 px wide), die Sidebar mit 240 px komplett unzureichend. Replace-View nutzt die volle Bildschirmbreite, und das Pattern ist konsistent zum Workspace-Sprint (Sidebar-Klick ändert Hauptansicht). Variante B würde zudem den TabContainer beim Modal-Open verdecken, der User verliert die laufenden Sessions aus dem Sichtfeld.

**Konsequenz:** App.tsx rendert beide Views (`<TabContainer>` + `<HistoryPane>`) parallel, mit `display: none/flex` je nach `mainView`. xterm-Lifecycle bleibt intakt, kein Buffer-Verlust beim Wechsel. HistoryPane registriert seine eigenen useEffect-Cleanups beim Unmount — also kein Memory-Leak, falls der User das Projekt komplett wechselt.

**Implementierungsdetail:** Klick auf einen Verlauf-Eintrag in der Sidebar setzt `historySelectedId` im UiStore + wechselt `mainView` auf `history`. HistoryPane synchronisiert seinen lokalen `selectedId` aus dem Store — der lokale State erlaubt Klicks IM HistoryPane, ohne dass jeder Klick durch Zustand-Cycle rendern muss.

---

## Templates: on-demand-Discovery und beide Quellen separat

**Entscheidung:** `fs:list-templates` läuft on-demand bei jedem Modal-Open, ohne chokidar-Watcher. Globaler Ordner (`%APPDATA%\TakumiDeck\templates`) und Per-Projekt-Ordner (`<projekt>\docs\templates`) plus Legacy-Konvention (`<projekt>\docs\*_TEMPLATE.md`) werden gescannt; jedes Template trägt einen `source`-Tag (`'global'` oder `'project'`). Konflikte bei gleichem Dateinamen werden NICHT aufgelöst — beide Einträge erscheinen nebeneinander.

**Varianten:**

- **A** Initial-Scan beim App-Start mit Cache, manueller Re-Scan-Button
- **B** On-Demand beim Modal-Open (gewählt)
- **C** Live-Watcher analog Sprint-5-JSONL-Watcher
- Konflikt-Auflösung: Per-Projekt-Override / **beide separat** (gewählt) / Hard Error

**Grund:** Templates ändern sich selten und sind klein (typisch <10 Files pro Projekt). Variante A spart ~50 ms beim ersten Modal-Open, zwingt aber zu einem Re-Scan-Knopf für den Edge-Case „User hat gerade ein Template angelegt". Variante C baut eine ganze Watcher-Infrastruktur für ein gelöstes Problem — der Initial-Scan-Code aus Sprint 5 (chokidar v5 + ignored-Predicate) ist nicht trivial, und Templates rechtfertigen den Aufwand nicht. B ist die einfachste Variante, die alle Cases abdeckt.

Für die Konflikt-Auflösung: Per-Projekt-Override hat den klassischen „warum geht mein globales Template hier nicht?"-Stolperstein und verlangt eine Einstellung zum Aushebeln. Hard-Error blockt einen seltenen Edge-Case mit einem UX-Bremsklotz. „Beide separat mit Source-Tag" macht den Konflikt sichtbar (kleiner Badge „Global" / „Projekt") und überlässt dem User die Wahl.

**Konsequenz:** TemplatesModal lädt bei jedem Open via `fs:list-templates`. Die Listen-Sortierung ist fix: globale zuerst (alphabetisch), dann Per-Projekt (alphabetisch). Variable-Filling-UI rendert nur die Felder, die das gewählte Template tatsächlich braucht — `findVariablesInTemplate` liefert die Tokens, die UI zeigt nur dazu passende Inputs.

---

## Sessions-Mapping über encodeCwd statt UUID

**Entscheidung:** TakumiDeck-Sessions matchen ihre claude-code-JSONL-Datei NICHT über die UUID im Filename, sondern über den encoded-cwd-Anteil im Eltern-Ordnernamen. claude-code vergibt seine eigene Session-UUID intern; unsere `sessions.id` ist davon entkoppelt. Der Watcher encoded den `cwd` jeder running/idle-Session nach demselben Schema (`:/\\` → `-`) und vergleicht mit `path.basename(path.dirname(filePath))`. Bei mehreren Sessions im gleichen Projekt-Ordner gewinnt die jüngste (höchstes `started_at`).

**Varianten:**

- **A** UUID-Filename ↔ `sessions.id` matchen (Sprint-5-Briefing-Annahme — beim Smoke-Test sofort als falsch erkannt)
- **B** encodeCwd-Match mit jüngster Session als Tiebreaker (gewählt)
- **C** Beim PTY-Spawn die JSONL-UUID aus der ersten Zeile des frischen Files lesen und ein Mapping persistieren

**Grund:** Architektur-Kapitel 4 hatte den Pact „sessions.id matched zu Claude Codes session-uuid" angenommen — claude-code liefert das aber nicht ab, weil es seine UUID intern vergibt und keinen `--session-id`-Flag entgegennimmt. Variante A scheiterte beim ersten Smoke-Test in Sprint 5 (alle JSONLs landeten als „extern" markiert, messages-Tabelle blieb für die aktive Session leer). Variante C wäre der robusteste Weg (1:1-Mapping in einer eigenen Tabelle), kostet aber: Race zwischen Spawn-Zeitpunkt und JSONL-Anlage, Watcher-First-Read-Logik um die Mapping-Zeile zu erkennen, plus Sprint-2-Schema-Erweiterung. Für 2-5 parallele Tabs reicht Variante B mit dem „jüngste gewinnt"-Tiebreaker — bei Bedarf später ohne Datenverlust nach C migrierbar.

**Konsequenz:** `messages.session_id` ist weiterhin unsere TakumiDeck-Session-ID, nicht die claude-UUID. Der Filename der JSONL-Datei wird nirgends gespeichert (außer in `jsonl_offsets.file_path` als Lookup-Key). Wenn der User parallel im selben Projekt zwei Tabs offen hat und in beiden gleichzeitig prompted, kann der jüngere Tab fälschlich Tokens des älteren zugewiesen bekommen — Limitation in [TECH_SCHULDEN.md](./TECH_SCHULDEN.md), für 2-5-Tab-Realität tolerabel.

**Implementierungsdetail:** `encodeCwd(cwd)` ist verlustbehaftet (mehrere `cwd`-Werte können denselben encoded-cwd erzeugen, wenn ein Pfadsegment selbst `-` enthält). Aktuelle Heuristik akzeptiert das, weil claude-code die Konvention konsistent benutzt — solange wir gegen denselben Encoder matchen, geht nichts verloren.

---

## Token-Persistenz: messages + usage_buckets parallel

**Entscheidung:** Pro JSONL-Zeile mit `usage`-Feld schreibt der Watcher zwei Stellen: einen Insert in `messages` (Per-Session-Detail) und einen Upsert in `usage_buckets` (Hourly-Aggregat pro Modell). Beide Tabellen waren in Architektur Kapitel 4 vorgesehen; Sprint 5 ist der erste Sprint, der sie befüllt.

**Varianten:**

- **A** Beide Tabellen wie Architektur 4 vorsieht (gewählt)
- **B** Nur `usage_buckets`, Per-Session-Detail bei Bedarf aus dem JSONL-File on-demand tailen
- **C** Nur `messages`, Aggregate zur Lesezeit per `GROUP BY` berechnen

**Grund:** A ist die einzige Variante, die gleichzeitig schnelle Plannutzungs-Bars (= Aggregat-Reads aus `usage_buckets`) und Sprint-6-Verlauf-Panel (= Per-Session-Token-Zahlen aus `messages`) bedient. C wird bei wachsendem Datenvolumen merklich langsam — der 5h-Bar müsste bei jedem Push tausende Messages gruppieren. B verschiebt die Komplexität in den Sprint-6-Pfad, der dann erneut den JSONL-Tail brauchen würde — duplizierter Lesepfad, der schon vom Sprint-5-Watcher abgedeckt ist.

**Konsequenz:** Schreib-Aufwand pro Zeile verdoppelt sich (zwei Inserts), aber better-sqlite3 ist synchron und schnell genug, um mit dem 100-ms-`awaitWriteFinish`-Cadence Schritt zu halten. Sprint 6 (Verlauf-Panel) und Phase 2 (Heatmap) lesen jeweils aus der passenden Tabelle, ohne JSONL-Tail. Externe claude-Sessions (ohne TakumiDeck-Spawn) tragen weiter zu `usage_buckets` bei (für die globalen 5h/weekly-Bars), landen aber NICHT in `messages` — sie haben keine TakumiDeck-Session-Zuordnung.

**Implementierungsdetail:** `messages.tokens_in` summiert `input_tokens + cache_creation + cache_read` (statt nur `input_tokens`). Damit fallen Cache-Treffer in den Per-Session-Kontext-Wert mit ein, was claude-codes eigenem `/context` näher kommt. Cache-Anteile getrennt zu persistieren wäre Sprint-6-Schema-Erweiterung, falls das Verlauf-Panel das braucht.

---

## JSONL-Watcher-Scope: globaler chokidar mit Initial-Scan

**Entscheidung:** chokidar-Watch über das gesamte `~/.claude/projects/`-Verzeichnis ab App-Start, mit `ignoreInitial: false` für den vollständigen Initial-Scan aller existierenden JSONL-Dateien. Filterung auf `.jsonl`-Endung über das `ignored`-Predicate (chokidar v5 hat den Glob-Support entfernt). Pro Datei persistierter Byte-Offset in der `jsonl_offsets`-Tabelle (Migration `0002`); Re-Reads beim nächsten App-Start kosten 0 Bytes pro unveränderter Datei.

**Varianten:**

- **A** Globaler Glob mit Initial-Scan, persistierte byte-offsets (gewählt)
- **B** Nur JSONLs aktuell laufender Sessions (Target-Watch on demand), keine Historie
- **C** Lazy: chokidar-Watch nur auf Verzeichnis, Add-Events triggern pro neuer Datei

**Grund:** Variante B verfehlt den eigentlichen Sprint-5-Zweck — die globalen 5h/weekly-Bars brauchen historische Daten als P90-Datenbasis (192-h-Fenster). Ohne Initial-Scan zeigen sie wochenlang Fallback-Werte, nicht die echten Limits. Variante C addiert eine Discovery-Schicht über fs.readdir, die nichts gegenüber chokidars eingebauter Recursive-Walk gewinnt. A skaliert mit ~7 JSONLs pro Projekt × ~10 Projekten beim User in unter 2 Sekunden — vertretbarer Cold-Start.

**Konsequenz:** chokidar v5 unterstützt keine Glob-Pattern mehr (Mid-Sprint-Discovery). Statt `.../**/*.jsonl` watchen wir den Root und filtern Non-JSONL-Files via `ignored`-Predicate. `awaitWriteFinish: 100 ms` schützt gegen partielle Writes, kostet aber Latenz: bei aktiv schreibenden Files (laufende claude-Antwort) kommt der Update-Event erst, wenn das File für 100 ms ruht — siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md). `ready`-Event mit Info-Log als Diagnose, damit Initial-Scan-Probleme im `main.log` sichtbar sind.

**Implementierungsdetail:** Anti-Reentrancy pro Datei: chokidar kann `change`-Events sehr schnell hintereinander auslösen, aber unsere `handleFile`-Logik ist async (file-IO + DB). Eine `Map<filePath, Promise>` serialisiert das, damit der zweite Event nicht denselben Bytes-Bereich nochmal liest.

---

## Recharts-Strategie: CSS-Bars top-level, Recharts nur im Detail-Modal

**Entscheidung:** Die Top-Level-Plannutzungs-Bars (5h, weekly_*, Per-Session-Kontext) sind reine CSS-Bars (`<div>` mit `width: <percent>%` plus Schwellen-Farb-Klassen). Recharts kommt erst im `UsageDetailModal` zum Einsatz — dort als Linien-Diagramm für die Per-Modell-Burn-Rate.

**Varianten:**

- **A** CSS-Bars top-level + Recharts im Detail-Modal (gewählt)
- **B** Pure Recharts überall — Bars + Tooltips aus `BarChart`
- **C** Dünner Wrapper um Recharts mit `td-*`-Token-Vorbelegung

**Grund:** Recharts hat keine Theme-API; das Anpassen an `tokens.css`-Variablen (`--td-accent`, `--td-warn`, etc.) erfordert Inline-Style-Overrides für jede SVG-Komponente. Für 5 Top-Level-Bars ist das mehr Wrestling als Mehrwert — eine CSS-Bar ist 30-40 Zeilen Markup + Style, perfekt token-konform und mit vollem Hover/Click-Verhalten. Recharts dort einsetzen, wo es Mehrwert hat: Detail-Modal mit echter Zeitreihe / Per-Modell-Aufschlüsselung. Variante B wäre Engineering-Lärm, Variante C ein Wrapper, der aktuell nur an einer einzigen Stelle gebraucht würde.

**Konsequenz:** Recharts ist als Dependency installiert (Architektur 2 hat sie ohnehin vorgesehen) und wird im `UsageDetailModal` direkt benutzt — kein eigener Theme-Layer. Wenn Phase 2 mehr Recharts-Stellen braucht (Heatmap-Variante etc.), kann ein Token-Wrapper später nachgerüstet werden, wenn der Bedarf klar ist.

---

## State-Detection-Heuristik: rein Last-Event-Timestamp

**Entscheidung:** Die Sprint-5-State-Detection klassifiziert running/idle ausschließlich über den Timestamp der letzten JSONL-Zeile pro Session: jünger als 3 Sekunden = `running`, sonst `idle`. Alle 2 Sekunden läuft eine Loop im Main-Prozess, die für jede Session im Status `running` oder `idle` die Klassifikation neu ermittelt und ggf. via `SessionLifecycle.transition` umschreibt.

**Varianten:**

- **A** Last-Event-Timestamp wie Architektur 6.2 (gewählt)
- **B** Typ-bewusst (bestimmte JSONL-Message-Types als „aktiv", andere ignorieren)
- **C** PTY-Stdout-Activity-Bursts als zweite Quelle parallel zu JSONL

**Grund:** Architektur 6.2 spezifiziert Variante A wörtlich („last line <3 s ago"), und sie ist trivial gegen Driver-Injection testbar (Pure-Logik mit Fixed-Clock + InMemory-Repo). Variante B (Permission-Prompt-Recognition, `waiting`-Status) ist explizit Phase-2-Material in Architektur 8 — drift-anfällig gegen Claude-Code-Format-Änderungen, kein Sprint-5-Bedarf. Variante C löst ein Problem, das wir noch nicht haben (JSONL-Latenz reicht in der Praxis).

**Konsequenz:** Lifecycle-State-Machine erweitert um `running ↔ idle`. `running → waiting` bleibt explizit verboten — Phase 2 wird das durch eine bewusste ALLOWED-Map-Änderung freischalten, nicht versehentlich. Sessions ohne Messages (frisch gespawnt, claude tippt noch nicht) werden NICHT auf `idle` gesetzt — sonst würde ein neuer Tab sofort grau erscheinen, bevor der erste Output kommt.

---

## Workspace-Scan: Async-Walk mit Konkurrenz-Limit

**Entscheidung:** Der Workspace-Scanner läuft als async-rekursiver Walk auf `fs.promises.readdir`, mit einem schmalen Promise-Pool (Konkurrenz-Default 4). Stop-Marker pro Subordner: `CLAUDE.md` (= Projekt erkannt, Recurse stoppt) oder `.git/` ohne `CLAUDE.md` (Stop ohne Erkennung). Versteckte Verzeichnisse und `node_modules` werden übersprungen. Max-Depth 5.

**Varianten:**

- **A** Async-Walk mit Konkurrenz-Limit (gewählt)
- **B** Sync-Walk via `fs.readdirSync`
- **C** Lazy On-Demand: erst beim ersten Sidebar-Refresh-Klick scannen

**Grund:** Bei einem persönlichen Tool mit 1–3 Projekten wäre B in der Praxis kaum unterscheidbar von A — aber sobald der Workspace mal 50 Subordner trägt, blockiert sync den Main-Prozess für die Scan-Dauer und IPC-Calls hängen währenddessen. Variante C verschiebt den UX-Hit auf den ersten Sidebar-Klick (leere Sidebar nach Cold-Start) ohne nennenswerten Gewinn. A skaliert mit, ohne den Initial-Code aufzublähen — das Driver-Pattern (`FsLikeDriver`) macht Tests gegen synthetische Fake-Trees identisch leicht wie bei B.

**Konsequenz:** Phase-2 wird ohnehin auf einen `chokidar`-Live-Watcher umsteigen — der ist auch async. A passt nahtlos. Die `realFsDriver`-Implementation schluckt erwartbare fs-Errors (`EACCES`/`ENOENT`/`ENOTDIR`/`EPERM`) und liefert Best-Effort, sodass ein einziger nicht-lesbarer Subordner den ganzen Scan nicht abbricht.

**Implementierungsdetail:** `versteckte Verzeichnisse` (Punkt-Präfix außer `.git`) und `node_modules` werden hart aus dem Recurse-Set rausgenommen — kein Setting, weil Architektur 6.1 die Marker-Logik fix vorgibt und die Ausschlüsse pragmatisch sind (sonst kämen `.cache`-Trees mit ihren CLAUDE.md-artigen Files als Fehl-Erkennung rein).

---

## CLAUDE.md-Parser: gray-matter + zod-validierte `workbench`-Section

**Entscheidung:** TakumiDeck verwendet `gray-matter` für die Trennung von YAML-Frontmatter und Markdown-Body. Die `workbench:`-Section wird nachgelagert durch `ClaudeMdFrontmatterSchema` (zod) validiert — `trigger_phrases.docs_update` und `trigger_phrases.commit` sind strict-Pflicht, alle anderen Felder optional. „Datei ohne Frontmatter" und „Frontmatter ohne `workbench:`-Section" sind legitime Zustände (Result.ok mit `frontmatter: null`); kaputte YAML oder fehlende Trigger-Phrasen liefern klare Result-Errors mit Codes.

**Varianten:**

- **A** `gray-matter` als kombiniertes Paket (gewählt)
- **B** `js-yaml` + handgeschriebene `---`-Splitter-Logik
- **C** Vollständig handgeschriebener Mini-YAML-Parser (keine npm-Dependency)

**Grund:** Der Markdown-Body von CLAUDE.md kann selbst `---`-Trennlinien enthalten (Architektur-Doku tut es) — ein selbst geschriebener Splitter würde dort schon stolpern. BOM-Bytes (Windows-Notepad), CRLF und alternative Trenner-Stile sind ebenfalls Edge-Cases, die `gray-matter` als de-facto-Standard im Markdown-Ökosystem längst kapselt. Bundle-Differenz ist im Electron-Kontext irrelevant. Variante C erfindet etablierte YAML-Semantik nochmal selbst und ist gegen den Aufwand-Gegenwert nicht zu rechtfertigen.

**Konsequenz:** `js-yaml` kommt als transitiver Sub-Dependency mit; falls Sprint 7 (Markdown-Editor mit Inline-YAML-Validierung) eine direkte Verwendung braucht, ist es schon im Tree. Strict-Pflicht für Trigger-Phrasen schützt Working-Rule-3 und 5: ohne sie kann der Workflow nicht funktionieren, also lieber sofort einen sprechenden Fehler als später undefined-Cascading.

---

## Default-Project-Migration: Auto-Match per cwd-Prefix mit Legacy-Bucket

**Entscheidung:** Beim ersten Sprint-4-Start wird das Sprint-2-Default-Project (UUID `…0001`) als Legacy-Bucket in der Sidebar sichtbar gemacht und ein einmaliger `cwd`-Prefix-Match-Pass läuft: für jede Session mit `project_id = DEFAULT_PROJECT_ID` wird geprüft, ob `session.cwd` innerhalb eines neu erkannten Project-Pfads liegt. Treffer → Session wird per FK-Update auf das echte Project umgehängt. Kein Treffer → Session bleibt am Default-Bucket; der Bucket wird in der Sidebar nur angezeigt, solange `session_count > 0` ist.

**Varianten:**

- **A** Auto-Match per cwd-Prefix beim ersten Sprint-4-Start, Rest bleibt sichtbar als Legacy (gewählt)
- **B** Default-Project bleibt unsichtbar in der Sidebar, Sessions hängen still daran weiter
- **C** Confirm-Dialog beim Start: „X Legacy-Sessions löschen oder behalten?"

**Grund:** Variante A ist datenverlust-frei *und* räumt sichtbar auf — alle Sessions, deren `cwd` auf ein erkanntes Projekt fällt, wandern automatisch dorthin; was nicht passt, bleibt sichtbar erreichbar (sobald Sprint 6 das Verlauf-Panel hat). Variante B versteckt eine wachsende Karteileichen-Menge ohne UI-Pfad zur Bereinigung. Variante C bricht den App-Start mit einem Dialog auf, dessen einzige sinnvolle Antwort „Behalten" ist, solange kein Recovery-Pfad existiert.

**Konsequenz:** Die Sprint-2-`__default__`-Schuld ist damit aufgelöst (siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md), ✅-Eintrag). Eine neue, kleinere Folgeschuld entsteht: Sprint-2/3-Sessions, die mit `cwd = workspace_path` (Parent-Ordner) gespawnt wurden, matchen *keinen* der echten Projekt-Pfade und landen dauerhaft im Legacy-Bucket — UI-erreichbar erst mit Sprint-6-Verlauf-Panel. Im Test-Szenario aus dem Sprint-4-Smoke waren das 19 Sessions; für Neu-Sessions ab Sprint 4 ist das Problem behoben (NewSession-Modal nutzt jetzt `activeProject.path`).

**Implementierungsdetail:** Die Match-Logik (`isPathInsideProject`) ist trennzeichen-sicher: `D:\Foo` matched nur Pfade, die mit `D:\Foo<sep>` beginnen oder exakt gleich sind — `D:\Foobar` als Sub-Path-Trick wird abgelehnt. Beide Pfade werden über `path.resolve` normalisiert, damit Trailing-Slashes und Mixed-Separators auf Windows kein Problem sind.

---

## Per-Projekt-Tab-Filter: Renderer-Filter, alle xterm-Instanzen mounted

**Entscheidung:** Tabs leben weiter in einem flachen `tabs[]`-Array im `useSessionStore`; jeder Tab trägt sein `projectId`. Die Tab-Bar zeigt nur Tabs des aktiven Projekts (Renderer-Filter über `activeProjectId` aus `useUiStore`); alle xterm-Instanzen aller Projekte bleiben dauerhaft im DOM mounted (CSS `display: none/flex`), PTYs aller Projekte laufen weiter. Beim Projekt-Wechsel rotiert `activeId` automatisch auf den ersten Tab des neuen Projekts oder auf null (Empty-State).

**Varianten:**

- **A** Renderer-Filter über `activeProjectId`, alle xterm dauerhaft mounted (gewählt)
- **B** Tabs als `Map<projectId, Tab[]>` strukturiert, statt flach
- **C** Sessions beim Projekt-Wechsel komplett aus dem Renderer ausblenden + frisch laden

**Grund:** Sprint 3 hatte Tab-Persistenz auf „alle xterm dauerhaft mounted" festgelegt (siehe gleichnamiger Eintrag oben) — Variante A hier zieht die Logik konsequent in die Sprint-4-Filterschicht durch: derselbe Mount-Lifecycle, derselbe Test-Aufwand, dasselbe Speicher-Profil bei 2–5 Tabs pro Projekt × 1–3 Projekten. Variante B würde Cross-Project-Operationen (z.B. „wie viele running-Sessions insgesamt?") umständlicher machen, ohne ein konkretes Problem zu lösen. Variante C widerspricht direkt der Sprint-3-Entscheidung — Re-Mount kostet xterm-Buffer, der aufwendig per Snapshot rekonstruiert werden müsste.

**Konsequenz:** `nextTab` und `prevTab` sind projekt-scoped (akzeptieren `projectId` als Argument), `pickNextActive` rotiert nur innerhalb des Projekts. `selectTabsForProject` als kleiner Selector dient sowohl der Tab-Bar als auch den Navigations-Helpern. Wenn das aktive Projekt 0 Tabs hat, bleibt der Multi-Terminal-Stack komplett verborgen und der projekt-spezifische Empty-State greift („Keine Sessions in <Projekt>").

---

## `useUiStore` als eigener Renderer-Store ab Sprint 4

**Entscheidung:** Die Auswahl des aktiven Sidebar-Projekts (`activeProjectId`) liegt in einem neuen `useUiStore` (`src/renderer/stores/ui.ts`), nicht im `useProjectStore`.

**Varianten:**

- **A** Neuer `useUiStore` für UI-State (gewählt)
- **B** `activeProjectId` als Feld direkt im `useProjectStore`
- **C** Aus URL/Hash-Routing ableiten

**Grund:** Architektur-Kapitel 2 nennt `useUiStore` explizit als einen der vier vorgesehenen Domain-Stores (`useSessionStore`, `useProjectStore`, `useUsageStore`, `useUiStore`). Sprint 4 ist der natürliche Anlass, ihn aufzumachen — Sprint 5 (Token-Dashboard mit Detail-Panel) und Sprint 8 (Settings-Modal-Sichtbarkeit) werden sehr wahrscheinlich denselben Store mit-nutzen. Variante B würde Domain-Daten (Projekt-Liste) und UI-Zustand (Auswahl) vermischen — ein Pattern, das Architektur-2 bewusst anders gezeichnet hat. Variante C (Hash-Router) wäre Phase-2-Reife (Deep-Linking, Browser-Back) für eine App, die aktuell keine Routes hat.

**Konsequenz:** Zwei neue Renderer-Stores in Sprint 4 (`useUiStore` + `useProjectStore`), beide minimal. Der `useUiStore` wächst in den nächsten Sprints organisch — keine Eröffnungs-Kosten in einem späteren Sprint, wenn der Store sowieso auseinander gerissen werden müsste.

---

## Copy/Paste-Bindings: Smart Ctrl+C/V als Default + zwei Alternativen

**Entscheidung:** Das Terminal akzeptiert drei parallele Copy/Paste-Bindings — Smart Ctrl+C/V (Daily-Driver-Default), Ctrl+Shift+C/V (cross-platform-Standard), Ctrl+Insert/Shift+Insert (Unix-X11-Konvention). Smart Ctrl+C kopiert, *wenn* eine Selection existiert (plus Auto-`clearSelection`), sonst läuft das Event als SIGINT durch. Ctrl+V pastet immer und überschreibt das selten genutzte `\x16` der traditionellen Terminals.

**Varianten:**

- **A** Smart Ctrl+C/V plus Ctrl+Shift+C/V plus Ctrl+Insert/Shift+Insert parallel (gewählt)
- **B** Nur Ctrl+Shift+C/V — saubere Disambiguierung, kein Override von SIGINT
- **C** Nur Smart Ctrl+C/V — minimale Reibung, aber keine Bypass-Option für Hotkey-Konflikte

**Grund:** Variante B war mein erster Vorschlag, ist „theoretisch reinste" Wahl (keine Mehrdeutigkeit, kein Verlust von SIGINT bei vergessener Selection) — aber Windows Terminal, VS Code und sogar moderne Linux-Terminals (Konsole, GNOME mit Setting) sind seit Jahren auf Smart Ctrl+C/V als Default gewechselt: in der Praxis schlagen die UX-Vorteile die seltenen Selection-Verwechslungen, und der `clearSelection()`-Auto-Reset nach jedem Copy entschärft den Resteffekt. Variante C verliert den Bypass, falls Ctrl+C systemweit von einer anderen App belegt wäre — aktuell unwahrscheinlich, aber kostenlos abdeckbar. Variante A liefert alle drei Wege gleichzeitig: User wählt das, was Fingergedächtnis und installierte Tools (z.B. ShareX kapert oft Ctrl+Shift+C global) zulassen.

**Konsequenz:** Pure-Logik-Util `createCopyPasteKeyHandler` mit driver-injected `ClipboardLike` + `getTerminal`-Lambda, 17 Tests ohne xterm/Browser-Clipboard. Falls Smart-Ctrl+C in der Praxis schmerzt (versehentliche Selection schluckt SIGINT), kann das Smart-Verhalten per Setting deaktiviert werden — aktuell hardcoded, Settings-UI ist Sprint 8.

**Implementierungsdetail:** Bracketed-Paste-Mode (`\x1b[200~...\x1b[201~`) übernimmt xterms `terminal.paste(text)` automatisch — claude erkennt das und verarbeitet den Block als ein einziges Eingabe-Event statt zeilenweise. Bei Pastes >~100 Zeilen komprimiert claude code die Anzeige zu einem `[Pasted text #N +K lines]`-Platzhalter; das ist claudes Feature, nicht unsere Begrenzung.

---

## Tab-Persistenz: alle xterm-Instanzen dauerhaft mounted

**Entscheidung:** Pro Session lebt eine eigene Terminal-Komponente dauerhaft im DOM; Tab-Wechsel ändert nur die CSS-Sichtbarkeit (`display: none/flex`). Kein Snapshot/Replay über die SerializeAddon-API, kein gemeinsamer Multiplex.

**Varianten:**

- **A** Alle Terminals bleiben mounted, inaktive werden per CSS versteckt (gewählt)
- **B** Snapshot-und-Wiederherstellen pro Tab-Wechsel (SerializeAddon ein-/auspacken, Lücke aus Main nachpuffern)
- **C** Eine globale xterm-Instanz, Datenströme werden pro Session gemultiplext und beim Wechsel neu in das eine Terminal geschrieben

**Grund:** Architektur-K2 zielt auf 2-5 Tabs realistisch; bei der Tab-Anzahl ist die Speicherersparnis von B/C marginal, aber die Komplexitätskosten sind real. Variante B muss ANSI-Escape-Sequenzen über den Snapshot-Roundtrip robust halten — Cursor-Mode, Alt-Screen, Mausreports und Bracketed-Paste-State sind genau die Stellen, an denen partielle Replays kaputtgehen. Variante C verlangt Per-Session-Cursor-State-Tracking und kollidiert mit Resize-Events. A ist die einzige Variante, die mit dem existierenden xterm-Lifecycle (`open`, `dispose`, `loadAddon`) ohne Tricks auskommt.

**Konsequenz:** Pro Tab eine Canvas-Render-Pipeline + Scrollback im RAM. Bei Bedarf später (Phase 2: mehr Tabs, Heatmap-Renderer-Refactor) auf eine andere Variante umschwenken — die zentrale `TabContainer`-Komponente kapselt die Sichtbarkeitslogik, der Wechsel wäre lokal. Inaktive Tabs liefern 0×0-Boxes an den ResizeObserver — das `safeFit`-try/catch fängt die FitAddon-Throws sauber ab.

---

## Lifecycle-State-Machine: zentraler Reducer im Main

**Entscheidung:** Eine Klasse `SessionLifecycle` im Main-Prozess kennt alle erlaubten Status-Übergänge (running→completed/interrupted/error/archived, completed/interrupted/error→running per Resume + →archived) als 2D-Map. Jede Status-Änderung — egal ob aus pty:exit, session:close, session:resume oder before-quit — geht durch `lifecycle.transition()`. Disallowed Transitions werden als `IpcResult.err` mit Code `LIFECYCLE_INVALID_TRANSITION` abgewiesen; Side-Effects (`ended_at` setzen/nullen) hängen pro Übergang an einer Stelle.

**Varianten:**

- **A** Zentraler Reducer mit Truth-Table und Side-Effect-Map (gewählt)
- **B** Dezentral: jeder IPC-Handler setzt seinen Zielstatus selbst, das Repo akzeptiert weiter alles aus dem Status-Enum
- **C** Repo-Whitelist auf erlaubte Werte ohne Vor-Bedingungs-Prüfung („running darf zu archived per Renderer-Bug springen")

**Grund:** Working Rule 4 verlangt, dass die Tests der Season die *neue* Lifecycle-Logik abdecken — eine zentrale State-Machine hat genau einen Test-Pfad pro From×To-Kombination und ist damit trivial als Truth-Table abdeckbar (26 Tests in Sprint 3, davon 18 reine Daten-Assertions). Variante B würde dieselben Regeln auf 4-5 Handler verteilen, und Sprint 5 (State-Detection mit waiting/idle) müsste die Regeln dort überall erweitern. Variante C verfehlt den Punkt der State-Machine, weil sie Vor-Bedingungen ignoriert.

**Konsequenz:** Sprint 5 erweitert genau eine Map-Konstante (`ALLOWED`) um die waiting/idle-Übergänge, und die JSONL-Watch-Logik schreibt durchs lifecycle-API. Driver-Injection-Pattern wie Sprint 1/2: die Klasse nimmt nur `SessionRepository` und eine `Clock`-Funktion — Tests fahren ohne better-sqlite3 (InMemorySessionDriver) und ohne System-Clock (Fixed-Clock).

**Implementierungsdetail:** Idempotente Übergänge (gleicher Status nochmal) sind No-ops und liefern die aktuelle Row zurück — vermeidet Lärm in Tests und Logs, falls ein Handler aus Versehen zweimal feuert. `ended_at` wird beim Wiedereintritt in einen Endzustand *nicht* überschrieben, damit der ursprüngliche Endzeitpunkt erhalten bleibt (z.B. completed → archived behält den Completion-Zeitpunkt).

---

## Resume mit ursprünglichem Modell, ohne erneuten Picker

**Entscheidung:** Der Resume-Button spawnt `claude --resume <session-id>` mit dem in `sessions.current_model` gespeicherten Modell-Wert; es gibt keinen Modell-Dialog vor dem Resume und kein Setting für ein anderes Verhalten.

**Varianten:**

- **A** Resume nimmt das gespeicherte Modell, kein Picker (gewählt)
- **B** Resume öffnet vor dem Spawn nochmal den Modell-Picker, vorbelegt mit dem letzten Wert
- **C** Setting `resume_with_original_model` (Default true), umschaltbar auf „immer fragen"

**Grund:** Architektur 6.2 ist explizit Spec („gleichem Modell wie ursprünglich"). Das Argument für B (User will eventuell auf billigeres Modell wechseln) wird von Claude-Codes eigenem `/model`-Befehl im laufenden Prozess abgedeckt — nach dem Resume kann jederzeit umgeschaltet werden. Variante C addiert einen Setting-Eintrag, der wahrscheinlich nie umgestellt wird, und kostet Sprint-8-UI-Aufwand.

**Konsequenz:** Wenn sich später herausstellt, dass B-Verhalten häufig gewünscht ist (z.B. wenn das ursprüngliche Modell deprecated wurde), ist die Erweiterung lokal: NewSessionModal kennt schon den Modell-Picker, im Resume-Pfad würde derselbe Dialog mit `defaultValue=session.current_model` aufgerufen.

---

## Notes-Save: Debounce + Blur + Unmount + beforeunload

**Entscheidung:** Der Auto-Save für Notizen läuft als pure-Logik-Util `createNotesSaver` mit 500 ms Debounce; zusätzlich greifen Sofort-Flushes bei `onBlur` (Textarea verliert Fokus), `useEffect`-Cleanup (Tab-Wechsel oder App-Quit-vor-Render) und `window.beforeunload` (Renderer wird gleich getötet).

**Varianten:**

- **A** Pure 500 ms Debounce ohne weitere Trigger
- **B** Debounce + onBlur + onUnmount + beforeunload (gewählt)
- **C** Sofort-Save bei jedem Keystroke

**Grund:** Architektur 6.2 verlangt 500 ms Debounce — Variante C scheidet damit aus. Variante A scheitert genau am Sprint-3-Test-Szenario („mehrere Inputs in 500 ms ergeben einen Save", was Debounce abdeckt — *aber* zusätzlich müssen die letzten Tipps beim Tab-Wechsel erhalten bleiben, sonst gehen sie verloren). Onblur und Unmount sind die natürlichen Flush-Punkte: der User hat Fokus weggegeben oder die Komponente verlässt das Tree. Beforeunload ist die letzte Chance vor dem Renderer-Tod — best-effort, weil der invoke-Promise oft nicht mehr aufgelöst wird, aber better-sqlite3 ist im Main synchron und kann die Patches in der Praxis noch durchführen.

**Konsequenz:** Pure-Logik-Trennung: `createNotesSaver` ist driver-injected (saveFn-Callback), Tests fahren mit `vi.useFakeTimers()` ohne React und ohne IPC. Worst-Case-Verlust ist 0–500 ms Tipps bei Hard-Quit (Strom weg, OOM), kein Verlust bei normalem Tab-Wechsel oder geordnetem App-Quit. Falls sich später herausstellt, dass auch Hard-Quit-Verlust schmerzt, kann ein synchroner sendSync-Channel im Preload nachgerüstet werden — das ist eine eigenständige Erweiterung, die nicht jetzt nötig ist.

**Implementierungsdetail:** Idempotenz: `createNotesSaver` cached den zuletzt gespeicherten Wert und unterdrückt erneute Saves desselben Inhalts. Damit kostet ein onBlur direkt nach einem 500-ms-Debounce-Save keinen zweiten IPC-Call.

---

## App-Quit-Race: synchrone Status-Patches vor killAll

**Entscheidung:** `before-quit` setzt zuerst das `lifecycle.shuttingDown`-Flag, patcht dann alle running-Sessions synchron auf `interrupted` (über `lifecycle.transition`), erst danach läuft `ptyManager.killAll()` und `db.close()`. Der `pty:exit`-Handler prüft das Flag und überschreibt nicht mehr — die Sprint-2-Default-Transition zu `completed` ist in dieser Phase abgeschaltet.

**Varianten:**

- **A** Synchrone DB-Patches im before-quit, vor killAll (gewählt)
- **B** `will-quit`-Event mit `event.preventDefault()`, asynchroner Patch, dann erneutes `app.quit()`
- **C** Beim Quit nichts tun, beim *nächsten* App-Start orphane running-Sessions retroaktiv auf interrupted setzen
- **A+C** A im Normalfall + C als Reconciliation-Pass beim Start (für Hard-Crashes)

**Grund:** Variante A ist trivial und korrekt für den geordneten Quit-Fall. better-sqlite3 ist synchron und schnell — keine realistische Hänge-Gefahr im before-quit. Variante B ist das doppel-quit-Pattern, das in der Electron-Praxis als anfällig gilt (User-Eindruck „App hängt", weil das zweite quit nicht ausgelöst wird). Variante C wurde vom User explizit als Sprint-8-Aufgabe markiert und ist in [TECH_SCHULDEN.md](./TECH_SCHULDEN.md) festgehalten — Robustheit gegen Hard-Crash kommt mit dem Polish-Sprint, nicht jetzt.

**Konsequenz:** Hard-Crash (Strom weg, Task-Manager-Kill, OOM) lässt orphane running-Sessions in der DB — sichtbar wird das erst, wenn Sprint 6 das Verlauf-Panel baut. Bis Sprint 8 sieht der User das nicht, weil Sprint 3 nur Live-Tabs anzeigt.

**Implementierungsdetail:** Das `shuttingDown`-Flag schützt zusätzlich gegen die Race „lifecycle hat schon transitioniert, pty:exit feuert noch einmal" — die State-Machine selbst lehnt den Übergang `interrupted → completed` ohnehin ab, das Flag ist die saubere Zwei-Linien-Verteidigung (Logging-Lärm + State-Machine-Reject statt nur State-Machine-Reject).

---

## PTY-Backend: @lydell/node-pty (NAPI)

**Entscheidung:** TakumiDeck verwendet `@lydell/node-pty` als PTY-Bibliothek; der ursprünglich in der Sprint-2-Briefing genannte `@homebridge/node-pty-prebuilt-multiarch`-Fork ist explizit *nicht* in Verwendung.

**Varianten:**

- **A** `@lydell/node-pty` mit NAPI-Binaries via optionale Plattform-Subpakete (gewählt)
- **B** `@homebridge/node-pty-prebuilt-multiarch` behalten und Electron auf Major 30 zurückrudern (höchste ABI mit Win32-Prebuilts in dem Fork)
- **C** Visual Studio Build Tools auf der Dev-Maschine installieren und `@homebridge` aus Source kompilieren

**Grund:** Der @homebridge-Fork hat seit ~Monaten keine Win32-Prebuilds für Electron 33+ (höchste ABI v121 = Electron 30). Variante B würde uns ohne tieferen Grund auf eine ältere Electron-Major-Version festhalten — eine Schuld, die später beim ersten Sicherheits-Update fällig wird. Variante C bricht das Memory-Setting „kein VS-Compiler nötig" und kostet 4–8 GB Build-Tools-Setup für ein gelöstes Problem. lydell verteilt **NAPI**-Binaries (ABI-stabil über Node/Electron-Versionen) als optionale npm-Subpakete (`@lydell/node-pty-win32-x64` etc., wie es esbuild macht); kein `electron-rebuild` mehr nötig. Die API ist 1:1 zu Microsofts node-pty.

**Konsequenz:** Native-Module-Workflow für PTY ist trivial geworden — `npm install` + `--ignore-scripts` reicht, kein Rebuild. `electron-rebuild` bleibt für `better-sqlite3` weiterhin Pflicht. Wenn Microsoft selbst eine NAPI-fähige `node-pty`-Version mit Prebuilts herausgibt, kann ein späterer Migrate trivial folgen — die API ist ohnehin identisch.

**Implementierungsdetail:** `realPtySpawn` in `src/main/pty/spawn.ts` wraps `nodePty.spawn` in das schmale `IPtyLike`-Interface, damit die `PtyManager`-Klasse keine Direktabhängigkeit zum Paket hat (Tests fahren mit Fake-Driver, vgl. Sprint-1-Migration-Pattern).

---

## xterm.js auf v5.5 gepinnt (kein v6)

**Entscheidung:** Die App benutzt `@xterm/xterm@^5.5` zusammen mit `@xterm/addon-canvas@^0.7`. Die aktuelle Major v6 ist explizit *nicht* in Verwendung.

**Varianten:**

- **A** v5.5 + addon-canvas (gewählt)
- **B** v6 mit dem eingebauten DOM-Renderer
- **C** v6 mit `@xterm/addon-webgl`

**Grund:** Architektur-K2 verlangt explizit Canvas-Renderer („Kein WebGL-Renderer (Canvas reicht für 2-5 Tabs realistisch)"). xterm.js v6 hat den Canvas-Renderer entfernt — die Wahl wäre dort nur noch DOM (Variante B) oder WebGL (C). DOM-Renderer ist auf größeren Buffern erkennbar langsamer und hat schlechteres Glyph-Rendering; WebGL widerspricht der Architektur-Entscheidung. v5.5 ist weiterhin gewartet (xterm.js bekommt Patches), und addon-canvas 0.7 ist genau dafür gebaut.

**Konsequenz:** Major-Updates auf v6+ sind blockiert, bis entweder ein offizieller Canvas-Renderer-Wiederbeleb von xterm.js kommt oder Architektur-K2 explizit auf WebGL umgestellt wird. Beim nächsten Renderer-Refactor (Phase 2: Heatmap, mehr Tabs) wieder hinterfragen.

---

## claude-Binary-Auflösung: Setting + PATH-Default

**Entscheidung:** Der Pfad zur `claude`-Binary kommt aus `settings.json` als `claude_binary_path` mit Default `'claude'` (= PATH-Lookup). Das Main-Process-Pre-Check-Modul (`src/main/pty/binary.ts`) löst Bare-Names per `where`/`which` auf und bevorzugt auf Windows `.exe` > `.cmd` > `.bat` über das endungslose Unix-Shell-Script.

**Varianten:**

- **A** Setting `claude_binary_path` mit Default `'claude'` + PATH-Lookup mit Extension-Bevorzugung (gewählt)
- **B** Reines PATH ohne Setting — User kann nicht überschreiben
- **C** Auto-Detection beim ersten Start (`where claude` → cachen → bei Fehler User-Prompt)

**Grund:** Variante B scheitert exakt am Sprint-2-Realfall: npm-installiertes Claude Code legt zwei Files an (`claude` ohne Endung als Unix-Shell-Script und `claude.cmd` als Windows-Wrapper). ConPTY kann das endungslose Script nicht starten — wir brauchen die Extension-Bevorzugung sowieso. Variante C addiert magisches Verhalten ohne klaren Mehrwert: wenn Auto-Detection scheitert, landen wir wieder bei einem Setting; und solange sie funktioniert, ist sie kaum von A unterscheidbar. Variante A ist explizit, debugbar (User sieht in `settings.json`, was tatsächlich aufgelöst wird) und sauber überschreibbar für Spezialfälle (Portable-Installs, Multi-Version-Setups).

**Konsequenz:** Der Pre-Check (`resolveExecutable`) gehört zum normalen Spawn-Path und liefert bei Fehlern ein klares `IpcResult.err` mit Code `PTY_BINARY_NOT_FOUND`. Sprint 8 (Settings-Dialog) bekommt die UI dafür; bis dahin editiert der User direkt `settings.json`.

**Implementierungsdetail:** Auf Windows ist die Extension-Reihenfolge `.exe` > `.cmd` > `.bat` > `.com`, damit echte Executables vor Batch-Wrappern bevorzugt werden — sonst würde z.B. ein hypothetisches `claude.exe` im PATH übersehen, weil `where` den `.cmd` zuerst listet. Reicht für npm-CLIs in der Praxis.

---

## Settings-Backend: eigene JSON-Operationen

**Entscheidung:** TakumiDeck verwaltet `settings.json` mit eigenen `fs`-Aufrufen plus atomic write (`.tmp` + rename) statt einer Library wie `electron-store` oder `conf`.

**Varianten:**

- **A** Eigene JSON-Operationen mit zod-Validierung beim Lesen (gewählt)
- **B** `electron-store` mit JSON-Schema-Validation und dot-paths
- **C** `conf` als minimalere electron-store-Alternative

**Grund:** Settings sind das Herzstück der App-Konfiguration und werden mit der Zeit komplexer (Limit-Bars, Custom-Filter). `electron-store` zwingt seine Konventionen auf (Pfad-Auto-Wahl, magische Keys), die bei Migrations zwischen Settings-Schema-Versionen im Weg stehen würden. Eigene Operationen sind 30 Zeilen, vollständig nachvollziehbar, und passen exakt zur Architektur-Entscheidung „Master-Config in JSON-Dateien, App rendert nur" (TAKUMIDECK_ARCHITEKTUR Kapitel 10 Punkt 6).

**Konsequenz:** Wenn das Settings-Schema wächst, müssen wir Migrations selbst schreiben — kein Auto-Migration-Path. Dafür haben wir volle Kontrolle, atomic writes (kein halb-geschriebenes JSON bei Crash) und können jederzeit zu einem Schema-Versions-Feld erweitern, ohne Library-Quirks zu umgehen.

---

## zod-Runtime-Validation an allen IPC-Boundaries ab Tag 1

**Entscheidung:** Jeder IPC-Channel mit Eingangs-Payload bekommt ein zod-Schema, das im Main-Handler vor der Logik per `.parse()` greift.

**Varianten:**

- **A** zod-Validation überall ab Sprint 1 (gewählt)
- **B** Nur an externen Daten-Boundaries (settings.json, JSONL-Files), IPC vertraut TS-Compile-Time
- **C** Komplett später nachrüsten

**Grund:** TypeScript-Types existieren nur zur Compile-Zeit; das Renderer-Bundle könnte theoretisch beliebige Payloads schicken (Bug, Memory-Corruption, Browser-Devtools-Eingriff). Bei einer wachsenden Channel-Liste (Sessions, PTY, Git, Usage in Sprints 2–7) wäre B die ständige Versuchung, den nächsten Channel „mal eben ohne Schema" einzuführen, bis der erste Bug eskaliert. Mit der zod-Convention ab Tag 1 ist das Schema Pflichtbestandteil jedes Handlers — und gleichzeitig die laufende Doku, was ein Channel akzeptiert.

**Konsequenz:** Jeder neue Channel kostet zusätzlich ein Schema in `src/shared/schemas.ts`. Im Gegenzug bekommen wir eindeutige Fehlermeldungen (zod sagt genau, welches Feld kaputt ist), nicht „TypeError: Cannot read property X of undefined" tief im Handler.

**Implementierungsdetail:** Das Patch-Schema (`AppSettingsPatchSchema`) ist mit `.partial()` auf das volle Settings-Schema aufgesetzt — kein Drift möglich.

---

## Logging via electron-log

**Entscheidung:** Main-Prozess loggt über `electron-log` nach `<userData>/logs/main.log`.

**Varianten:**

- **A** electron-log (gewählt)
- **B** `console.log` + eigener Helper, kein Datei-Output
- **C** Erst in Sprint 8 (Polish) einrichten

**Grund:** Production-Builds haben keine offene Konsole, in der `console.log` sichtbar wäre. Sobald das erste Mal jemand schreibt „bei mir geht's nicht" ohne Reproduktion, hilft nur ein File-Log. electron-log handhabt Datei-Rotation, Levels und Multi-Prozess-Logging out-of-the-box; selbst zu schreiben wäre 100+ Zeilen für ein gelöstes Problem.

**Konsequenz:** Settings-Dialog in Sprint 8 bekommt einen „Open Data Folder"-Button, und das Log liegt direkt daneben — kein zusätzlicher UX-Pfad nötig.

---

## Vitest-Setup direkt mit Foundation-Smoke-Tests

**Entscheidung:** Ab Sprint 1 ist Vitest konfiguriert, und vier Test-Dateien (Result-Helper, zod-Schemas, SettingsStore, Migration-Runner) laufen grün.

**Varianten:**

- **A** Setup jetzt + Smoke-Tests für Foundation (gewählt)
- **B** Setup jetzt, Tests folgen mit Sprint 2
- **C** Komplett später

**Grund:** Working Rule 4 verlangt „Test scope per season — Tests cover only the newly added or changed feature". Ohne Tests in Sprint 1 wäre die erste Test-Datei in Sprint 2 entstanden — und die Versuchung wäre groß, „kurz noch die Settings-Tests mitzunehmen". Damit wäre die Per-Season-Disziplin schon im zweiten Sprint hinüber. Tests jetzt zu schreiben verankert die Regel, solange der Scope klein und überschaubar ist.

**Konsequenz:** Migration-Runner ist gegen ein schmales `MigrationDriver`-Interface getestet (Fake-Driver, kein echtes SQLite). Das ist auch die Voraussetzung dafür, dass `npx vitest run` läuft, nachdem `electron-rebuild` die better-sqlite3-ABI auf Electron umgestellt hat — siehe [TECH_SCHULDEN.md](./TECH_SCHULDEN.md).

---

## Template-Eintrag (beim ersten echten Eintrag ersetzen)

**Entscheidung:** TakumiDeck wählt Variante A / B / C – kurz benennen, was sich dadurch konkret unterscheidet.

**Varianten:**

- **A** <Kurzbeschreibung> (gewählt)
- **B** <Kurzbeschreibung>
- **C** <Kurzbeschreibung>

**Grund:** Hier steht, warum A gewinnt. Dieser Abschnitt ist der eigentliche Mehrwert der Datei — nicht abkürzen. Idealerweise ein konkretes Szenario, das B / C schmerzhaft macht, und ein Szenario, das A trivial macht.

**Konsequenz:** Was bedeutet diese Entscheidung für spätere Arbeit? („Wir müssen ab jetzt bei jeder neuen Spalte …", „Ein späteres Feature X lässt sich hier …").

**Implementierungsdetail:** *(optional)* kurze Notiz zu einer Umsetzungs-Wahl, die der Grund-Abschnitt nicht mitbehandelt.
