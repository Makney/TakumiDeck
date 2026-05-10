// Zentrale Channel-Konstanten für die IPC zwischen Main und Renderer.
// Sprint 1 hat settings:* und app:* belegt; Sprint 2 ergänzt pty:* und session:open / session:update.
export const Channels = {
  // Project-Management (Sprint 4)
  ProjectList: 'project:list',
  ProjectAdd: 'project:add',
  ProjectScan: 'project:scan-workspace',
  ProjectReadCfg: 'project:read-claude-md',

  // Session-Management (Sprint 2: open/update; Sprint 3: close/resume/history)
  SessionOpen: 'session:open',
  SessionClose: 'session:close',
  SessionResume: 'session:resume',
  SessionUpdate: 'session:update',
  SessionHistory: 'session:history',

  // PTY (Sprint 2)
  PtyCreate: 'pty:create',
  PtyWrite: 'pty:write',
  PtyResize: 'pty:resize',
  PtyKill: 'pty:kill',
  PtyData: 'pty:data',
  PtyExit: 'pty:exit',

  // Git (Sprint 7)
  GitStatus: 'git:status',
  GitDiff: 'git:diff',
  GitWorktrees: 'git:worktrees',

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

  // Settings (Sprint 1)
  SettingsGet: 'settings:get',
  SettingsSet: 'settings:set',

  // Notes (Sprint 2-3)
  NotesSave: 'notes:save',

  // App-Misc (Sprint 1 teilweise)
  AppOpenDataFolder: 'app:open-data-folder',
  AppGetVersion: 'app:get-version',
} as const;

export type ChannelName = (typeof Channels)[keyof typeof Channels];
