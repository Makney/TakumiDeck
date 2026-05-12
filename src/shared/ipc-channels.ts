// Zentrale Channel-Konstanten für die IPC zwischen Main und Renderer.
// Sprint 1 hat settings:* und app:* belegt; Sprint 2 ergänzt pty:* und session:update.
export const Channels = {
  // Project-Management (Sprint 4)
  ProjectList: 'project:list',
  ProjectAdd: 'project:add',
  ProjectScan: 'project:scan-workspace',
  ProjectReadCfg: 'project:read-claude-md',

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

  // Git (Sprint 7)
  GitStatus: 'git:status',
  GitDiff: 'git:diff',
  GitShow: 'git:show',

  // Token-Tracking (Sprint 5)
  UsageWindow: 'usage:window',
  UsageHeatmap: 'usage:heatmap',
  UsageContext: 'usage:context',
  // Push-Channel: Watcher → Renderer, wenn neue Token-Daten reingekommen sind.
  // Renderer entscheidet anhand des kind-Felds, was er re-fetcht.
  UsageUpdate: 'usage:update',

  // Filesystem (Sprint 6/7)
  FsRead: 'fs:read',
  FsWrite: 'fs:write',
  FsListTemplates: 'fs:list-templates',
  FsListTree: 'fs:list-tree',
  // Phase-2 Season-2: Screenshot-Drop ins Terminal. Renderer speichert
  // Image-Bytes über diesen Channel in <userData>/screenshots/, bekommt
  // den absoluten Pfad zurück und pastet ihn ins xterm.
  FsSaveScreenshot: 'fs:save-screenshot',

  // Settings (Sprint 1)
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',

  // App-Misc (Sprint 1 teilweise)
  AppOpenDataFolder: 'app:open-data-folder',
  AppGetVersion: 'app:get-version',
  // Sprint 8 — Header-Bar Window-Controls (frameless wäre Phase 5+; aktuell
  // bedienen wir die Standard-Electron-Frame-Controls über IPC).
  AppWindowAction: 'app:window-action',
  // Sprint 8 — Health-Check, ob die claude-Binary erreichbar ist. Header-Bar
  // ruft beim Mount + bei PTY-Spawn-Fehlern.
  AppClaudeHealth: 'app:claude-health',
} as const;
