// Zentrale Channel-Konstanten für die IPC zwischen Main und Renderer.
// Sprint 1 hat settings:* und app:* belegt; Sprint 2 ergänzt pty:* und session:update.
export const Channels = {
  // Project-Management (Sprint 4)
  ProjectList: 'project:list',
  ProjectAdd: 'project:add',
  ProjectScan: 'project:scan-workspace',
  ProjectReadCfg: 'project:read-claude-md',
  // Phase-2 Season-8: Projekt aus der Liste entfernen. Sessions wandern auf den
  // Default-Bucket; das Default-Project selbst ist server-seitig immutable.
  ProjectRemove: 'project:remove',

  // Session-Management (Sprint 2: update; Sprint 3: close/resume; Sprint 6: history/archive)
  SessionClose: 'session:close',
  SessionResume: 'session:resume',
  SessionUpdate: 'session:update',
  SessionHistory: 'session:history',
  // Phase-2 Season-1: Main pusht Status-Änderungen (waiting/running/idle) aktiv
  // an den Renderer, damit der Store aktuell bleibt ohne IPC-Poll.
  SessionStatusPush: 'session:status-push',
  // Sprint-6-UX-Fix (Variante B): expliziter Archive-Schritt, getrennt vom × auf
  // dem Tab. session:close killt nur den PTY, session:archive setzt den Lifecycle.
  SessionArchive: 'session:archive',

  // PTY (Sprint 2)
  PtyCreate: 'pty:create',
  PtyWrite: 'pty:write',
  PtyResize: 'pty:resize',
  PtyKill: 'pty:kill',
  PtyData: 'pty:data',
  PtyExit: 'pty:exit',
  // Phase-2 Season-1: Renderer pusht den detektierten TUI-Status (Pattern-Match
  // auf serialisierten xterm-Buffer) ans Main. Nur State-Wechsel werden gesendet,
  // damit der Channel ruhig bleibt — eine sitzende `waiting`-Session erzeugt
  // keinen Traffic.
  PtyTuiState: 'pty:tui-state',

  // Terminal (Phase-2 Season-32): Buffer-Persistierung fuer terminal-Sessions.
  // Save wird im TerminalTab-Cleanup gefeuert (Renderer serialisiert via
  // @xterm/addon-serialize und trimmt vorher pure mit `trimBufferSnapshot`).
  // Load wird beim TerminalTab-Mount fuer resumed terminal-Sessions gerufen,
  // bevor der erste PTY-Frame in xterm geschrieben wird — der Pre-Frame-
  // Restore haengt eine kleine Queue auf den onData-Listener, damit die
  // Reihenfolge stimmt. Claude-Sessions skippen beide Pfade im Renderer
  // (claude rendert seinen Verlauf beim `--resume` selbst aus der JSONL).
  TerminalSaveBuffer: 'terminal:save-buffer',
  TerminalLoadBuffer: 'terminal:load-buffer',

  // Modelle (Phase-2 Season-34, Variante D): optionaler Auto-Refresh gegen den
  // Anthropic `/v1/models`-Endpoint. Nur wirksam mit gesetztem API-Key; ohne
  // Key liefert der Handler `available=false` (Abo-/OAuth-Nutzung).
  ModelsFetchAvailable: 'models:fetch-available',

  // Git (Sprint 7)
  GitStatus: 'git:status',
  GitDiff: 'git:diff',
  GitShow: 'git:show',
  // Phase-2 Season-29 (Multi-Tab-Diff): Index-Version einer Datei
  // (`git show :<relPath>`) fuer den 'staged'-Modus des DiffViewers.
  GitShowStaged: 'git:show-staged',
  // Phase-2 Season-29 (Multi-Tab-Diff): Aenderungen seit Session-Start.
  // Server resolved sessions.start_commit_sha und liefert Branch +
  // GitFileChange[]. Renderer holt per-File-Inhalt am Baseline via
  // git:show mit ref=baselineSha.
  GitSessionDiff: 'git:session-diff',

  // Token-Tracking (Sprint 5)
  UsageWindow: 'usage:window',
  UsageHeatmap: 'usage:heatmap',
  UsageContext: 'usage:context',
  // Push-Channel: Watcher → Renderer, wenn neue Token-Daten reingekommen sind.
  // Renderer entscheidet anhand des kind-Felds, was er re-fetcht.
  UsageUpdate: 'usage:update',

  // Stats (Phase-2 Season-12): Aggregations-Cards fuer die Stats-Pane.
  // Renderer ruft beim Projekt-Wechsel, beim Scope/Range-Toggle und nach
  // jedem usage:update-Push (debounced) — der Main aggregiert direkt aus
  // messages + sessions ueber die bestehenden Indizes.
  StatsOverview: 'stats:project-overview',
  // Stats (Phase-2 Season-13): GitHub-Style Aktivitaets-Heatmap. Renderer
  // ruft parallel zu StatsOverview, eigener Endpoint mit eigenem Statement-
  // Cache. Range/Scope-Toggle der Cards beeinflusst die Heatmap NICHT — die
  // hat einen eigenen 30W/52W-Toggle, weil ein 7d-Fenster die Heatmap-Logik
  // zertruemmern wuerde.
  StatsHeatmap: 'stats:heatmap',
  // Stats (Phase-2 Season-14): Per-Modell-Aufschluesselung fuer die Modelle-
  // View. Eigener Endpoint parallel zu StatsOverview/StatsHeatmap; konsumiert
  // den gleichen Scope/Range-Toggle wie die Cards, damit „Zeitfilter analog
  // zu Uebersicht" (PHASE2.md) ohne zusaetzliche Toggle-Tiefe erfuellt ist.
  StatsModels: 'stats:models',

  // Filesystem (Sprint 6/7)
  FsRead: 'fs:read',
  FsWrite: 'fs:write',
  FsListTemplates: 'fs:list-templates',
  // Phase-2 Season-4: Auto-Variablen, die DB- oder Datei-Zugriff brauchen
  // (LETZTE_SEASON_NAME aus SQLite, TECH_SCHULDEN_RELEVANT + LETZTE_ENTSCHEIDUNGEN
  // aus Markdown-Dateien). Renderer ruft pro Modal-Open einmal; ohne Auflösung
  // landen die Variablen leer im Prompt (graceful Fallback).
  TemplatesResolveAutoVars: 'templates:resolve-auto-vars',
  // Phase-2 Season-11: vom Templates-Send aufgerufen, wenn das Template
  // `{{NEXT_SEASON_NR}}` verwendet. Atomar: liest MAX(season_number)+1 fuer
  // das Projekt der Session und schreibt den Wert auf die Session, falls sie
  // noch keinen Wert hat. Idempotent — eine bereits zugewiesene Nummer wird
  // nicht ueberschrieben. Damit zieht der Season-Counter auch ohne neuen
  // pty:create-Spawn mit (Bug aus Season 8/9/10: Counter blieb stehen, weil
  // Seasons per Templates-Send statt neuer Feature-Session gestartet wurden).
  TemplatesAllocateSeasonForSession: 'templates:allocate-season-for-session',
  // Phase-2 Season-21: Status fuer die vier Docs-Sync-Doku-Dateien
  // (CHANGELOG/FEATURES/TECH_SCHULDEN/ENTSCHEIDUNGEN). Renderer ruft beim
  // Oeffnen des NewSessionModals mit Typ „Docs-Sync" und vergleicht
  // SHA-256-Hash der Originaldatei mit `source_hash` im Frontmatter der
  // Summary-Datei.
  DocsSyncStatus: 'docs:sync-status',
  // Phase-2 Season-22: Status der On-Demand-Files aus dem CLAUDE.md-
  // Frontmatter plus (wenn Summary geladen) den Body ohne Frontmatter,
  // damit das NewSessionModal die Praeambel ohne zweiten IPC bauen kann.
  DocsOnDemandStatus: 'docs:on-demand-status',
  FsListTree: 'fs:list-tree',
  // Phase-2 Season-2: Screenshot-Drop ins Terminal. Renderer speichert
  // Image-Bytes über diesen Channel in <userData>/screenshots/, bekommt
  // den absoluten Pfad zurück und pastet ihn ins xterm.
  FsSaveScreenshot: 'fs:save-screenshot',
  // Phase-2 Season-17: Settings-Manual-Clear-Block. Summary liefert
  // {fileCount, totalBytes} ohne FS-Mutation; Clear loescht alle Files
  // im <userData>/screenshots/ und liefert die Bilanz zurueck.
  FsScreenshotsSummary: 'fs:screenshots-summary',
  FsClearScreenshots: 'fs:clear-screenshots',
  // Phase-2 Season-29 (Multi-Tab-Diff Auto-Refresh): Renderer setzt das
  // aktive Projekt fuer den chokidar-Watcher; null stoppt den Watcher.
  FsSetWatchedProject: 'fs:set-watched-project',
  // Push-Channel: Main → Renderer, wenn ein File im aktiven Projekt
  // geaendert / neu / geloescht wurde. Debounced 200 ms; Liste der
  // Paths (projektrelativ).
  FsChanged: 'fs:changed',

  // Settings (Sprint 1)
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',

  // App-Misc (Sprint 1 teilweise)
  AppOpenDataFolder: 'app:open-data-folder',
  AppGetVersion: 'app:get-version',
  // Phase-2 Season-18: Ordner-Picker fuer den First-Start-Workspace-Wizard.
  // dialog.showOpenDialog({ properties: ['openDirectory'] }) im Main, gibt
  // {canceled, path} an den Renderer zurueck. Generisch genug, damit der
  // Settings-Workspace-Tab den Picker spaeter mitnutzen kann.
  AppPickFolder: 'app:pick-folder',
  // Sprint 8 — Header-Bar Window-Controls (frameless wäre Phase 5+; aktuell
  // bedienen wir die Standard-Electron-Frame-Controls über IPC).
  AppWindowAction: 'app:window-action',
  // Sprint 8 — Health-Check, ob die claude-Binary erreichbar ist. Header-Bar
  // ruft beim Mount + bei PTY-Spawn-Fehlern.
  AppClaudeHealth: 'app:claude-health',

  // Phase-2 Season-26: Auto-Update via electron-updater gegen GitHub-Releases.
  // Renderer ruft `Check` beim Mount + im Settings-About-Tab; `StartDownload`
  // nach User-Klick auf den Banner; `QuitAndInstall` nach abgeschlossenem
  // Download. `GetState` synchronisiert den Banner beim Mount, ohne auf den
  // naechsten Push-Tick warten zu muessen. Skip-in-Dev: im !app.isPackaged-
  // Pfad gibt `Check` direkt einen 'no-update'-State zurueck.
  UpdaterGetState: 'updater:get-state',
  UpdaterCheck: 'updater:check',
  UpdaterStartDownload: 'updater:start-download',
  UpdaterQuitAndInstall: 'updater:quit-and-install',
  UpdaterStatePush: 'updater:state-push',
} as const;
