import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import { Channels } from '@shared/ipc-channels';
import type {
  AppPickFolderInput,
  AppPickFolderResult,
  AppSettings,
  ClaudeMdParseResult,
  DocsSyncStatusInput,
  DocsSyncStatusResult,
  DocsOnDemandStatusInput,
  DocsOnDemandStatusResult,
  SessionStatusPushEvent,
  FsListTemplatesInput,
  FsListTreeInput,
  FsChangedEvent,
  FsClearScreenshotsResult,
  FsReadInput,
  FsReadResult,
  FsSaveScreenshotInput,
  FsSaveScreenshotResult,
  FsScreenshotsSummaryResult,
  FsSetWatchedProjectInput,
  FsTreeNode,
  FsWriteInput,
  FsWriteResult,
  GitDiffInput,
  GitDiffResult,
  GitSessionDiffInput,
  GitSessionDiffResult,
  GitShowInput,
  GitShowResult,
  GitShowStagedInput,
  GitShowStagedResult,
  GitStatusInput,
  GitStatusResult,
  IpcResult,
  ModelFetchResult,
  ProjectReadCfgInput,
  ProjectRemoveInput,
  ProjectRow,
  PtyCreateInput,
  PtyDataEvent,
  PtyExitEvent,
  PtyKillInput,
  PtyResizeInput,
  PtyTuiStateInput,
  PtyWriteInput,
  RendererApi,
  StatsHeatmapInput,
  StatsHeatmapResult,
  StatsModelsInput,
  StatsModelsResult,
  StatsOverviewInput,
  StatsOverviewResult,
  UpdaterState,
  UpdaterStatePushEvent,
  SessionArchiveInput,
  SessionCloseInput,
  SessionHistoryEntry,
  SessionHistoryInput,
  SessionResumeInput,
  SessionRow,
  SessionUpdateInput,
  TerminalLoadBufferInput,
  TerminalLoadBufferResult,
  TerminalSaveBufferInput,
  TemplateFile,
  TemplatesAllocateSeasonForSessionInput,
  TemplatesAllocateSeasonForSessionResult,
  TemplatesResolveAutoVarsInput,
  TemplatesResolveAutoVarsResult,
  UsageContextInput,
  UsageContextResult,
  UsageHeatmapResult,
  UsageUpdateEvent,
  UsageWindowInput,
  UsageWindowResult,
  WindowAction,
} from '@shared/types';

// Whitelist-API. Renderer hat keinen direkten Node/Electron-Zugriff (contextIsolation: true,
// sandbox: true). Jede Methode forwardet an einen genau definierten IPC-Channel und
// returnt ein IpcResult, dessen Shape im Main durch zod validiert wird.
const api: RendererApi = {
  settings: {
    get: () => ipcRenderer.invoke(Channels.SettingsGet) as Promise<IpcResult<AppSettings>>,
    set: (patch: Partial<AppSettings>) =>
      ipcRenderer.invoke(Channels.SettingsSet, patch) as Promise<IpcResult<AppSettings>>,
  },
  app: {
    getVersion: () => ipcRenderer.invoke(Channels.AppGetVersion) as Promise<IpcResult<string>>,
    openDataFolder: () =>
      ipcRenderer.invoke(Channels.AppOpenDataFolder) as Promise<IpcResult<string>>,
    windowAction: (action: WindowAction) =>
      ipcRenderer.invoke(Channels.AppWindowAction, action) as Promise<IpcResult<null>>,
    claudeHealth: () =>
      ipcRenderer.invoke(Channels.AppClaudeHealth) as Promise<
        IpcResult<
          | { resolved: string; healthy: true }
          | { resolved: null; healthy: false; hint: string }
        >
      >,
    // Phase-2 Season-18: Ordner-Picker fuer den First-Start-Wizard. Argument
    // ist optional; ohne Payload nimmt der Handler einen Default-Titel.
    pickFolder: (input?: AppPickFolderInput) =>
      ipcRenderer.invoke(Channels.AppPickFolder, input) as Promise<
        IpcResult<AppPickFolderResult>
      >,
  },
  pty: {
    create: (input: PtyCreateInput) =>
      ipcRenderer.invoke(Channels.PtyCreate, input) as Promise<IpcResult<SessionRow>>,
    write: (input: PtyWriteInput) =>
      ipcRenderer.invoke(Channels.PtyWrite, input) as Promise<IpcResult<null>>,
    resize: (input: PtyResizeInput) =>
      ipcRenderer.invoke(Channels.PtyResize, input) as Promise<IpcResult<null>>,
    kill: (input: PtyKillInput) =>
      ipcRenderer.invoke(Channels.PtyKill, input) as Promise<IpcResult<null>>,
    pushTuiState: (input: PtyTuiStateInput) =>
      ipcRenderer.invoke(Channels.PtyTuiState, input) as Promise<IpcResult<null>>,
    // Wir reichen NUR die Payload (kein IpcRendererEvent) an den Renderer weiter — sonst
    // würden interne Electron-Objekte über die contextBridge-Grenze sichtbar.
    onData: (handler: (event: PtyDataEvent) => void) => {
      const wrapped = (_evt: IpcRendererEvent, payload: PtyDataEvent) => handler(payload);
      ipcRenderer.on(Channels.PtyData, wrapped);
      return () => ipcRenderer.removeListener(Channels.PtyData, wrapped);
    },
    onExit: (handler: (event: PtyExitEvent) => void) => {
      const wrapped = (_evt: IpcRendererEvent, payload: PtyExitEvent) => handler(payload);
      ipcRenderer.on(Channels.PtyExit, wrapped);
      return () => ipcRenderer.removeListener(Channels.PtyExit, wrapped);
    },
  },
  sessions: {
    update: (input: SessionUpdateInput) =>
      ipcRenderer.invoke(Channels.SessionUpdate, input) as Promise<IpcResult<SessionRow>>,
    close: (input: SessionCloseInput) =>
      ipcRenderer.invoke(Channels.SessionClose, input) as Promise<IpcResult<SessionRow>>,
    resume: (input: SessionResumeInput) =>
      ipcRenderer.invoke(Channels.SessionResume, input) as Promise<IpcResult<SessionRow>>,
    history: (input: SessionHistoryInput) =>
      ipcRenderer.invoke(Channels.SessionHistory, input) as Promise<
        IpcResult<SessionHistoryEntry[]>
      >,
    archive: (input: SessionArchiveInput) =>
      ipcRenderer.invoke(Channels.SessionArchive, input) as Promise<IpcResult<SessionRow>>,
    onStatusPush: (handler: (event: SessionStatusPushEvent) => void) => {
      const wrapped = (_evt: IpcRendererEvent, payload: SessionStatusPushEvent) => handler(payload);
      ipcRenderer.on(Channels.SessionStatusPush, wrapped);
      return () => ipcRenderer.removeListener(Channels.SessionStatusPush, wrapped);
    },
  },
  // Phase-2 Season-33: Terminal-Buffer-Persistierung. Beide Calls werden im
  // Renderer nur fuer type='terminal' gefeuert; der Main lehnt fremde Typen
  // ab (save: Error-Code, load: liefert null).
  terminal: {
    saveBuffer: (input: TerminalSaveBufferInput) =>
      ipcRenderer.invoke(Channels.TerminalSaveBuffer, input) as Promise<
        IpcResult<null>
      >,
    loadBuffer: (input: TerminalLoadBufferInput) =>
      ipcRenderer.invoke(Channels.TerminalLoadBuffer, input) as Promise<
        IpcResult<TerminalLoadBufferResult>
      >,
  },
  templates: {
    resolveAutoVars: (input: TemplatesResolveAutoVarsInput) =>
      ipcRenderer.invoke(Channels.TemplatesResolveAutoVars, input) as Promise<
        IpcResult<TemplatesResolveAutoVarsResult>
      >,
    allocateSeasonForSession: (input: TemplatesAllocateSeasonForSessionInput) =>
      ipcRenderer.invoke(Channels.TemplatesAllocateSeasonForSession, input) as Promise<
        IpcResult<TemplatesAllocateSeasonForSessionResult>
      >,
  },
  // Phase-2 Season-21: Docs-Sync-Status fuer das NewSessionModal mit Typ
  // „Docs-Sync". Liefert den Sync-Status der vier Doku-Files (CHANGELOG/
  // FEATURES/TECH_SCHULDEN/ENTSCHEIDUNGEN) im aktiven Projekt.
  docs: {
    syncStatus: (input: DocsSyncStatusInput) =>
      ipcRenderer.invoke(Channels.DocsSyncStatus, input) as Promise<
        IpcResult<DocsSyncStatusResult>
      >,
    // Phase-2 Season-22: On-Demand-Kontext-Praeambel — Status + Body der
    // On-Demand-Files aus dem CLAUDE.md-Frontmatter. Renderer ruft beim
    // Oeffnen des NewSessionModals fuer alle Session-Typen ausser
    // docs-sync (dort uebernimmt syncStatus die Anzeige).
    onDemandStatus: (input: DocsOnDemandStatusInput) =>
      ipcRenderer.invoke(Channels.DocsOnDemandStatus, input) as Promise<
        IpcResult<DocsOnDemandStatusResult>
      >,
  },
  fs: {
    listTemplates: (input: FsListTemplatesInput) =>
      ipcRenderer.invoke(Channels.FsListTemplates, input) as Promise<
        IpcResult<TemplateFile[]>
      >,
    read: (input: FsReadInput) =>
      ipcRenderer.invoke(Channels.FsRead, input) as Promise<IpcResult<FsReadResult>>,
    write: (input: FsWriteInput) =>
      ipcRenderer.invoke(Channels.FsWrite, input) as Promise<IpcResult<FsWriteResult>>,
    listTree: (input: FsListTreeInput) =>
      ipcRenderer.invoke(Channels.FsListTree, input) as Promise<IpcResult<FsTreeNode[]>>,
    saveScreenshot: (input: FsSaveScreenshotInput) =>
      ipcRenderer.invoke(Channels.FsSaveScreenshot, input) as Promise<
        IpcResult<FsSaveScreenshotResult>
      >,
    // Phase-2 Season-17: Settings-Manual-Clear-Block fuer <userData>/screenshots/.
    screenshotsSummary: () =>
      ipcRenderer.invoke(Channels.FsScreenshotsSummary, {}) as Promise<
        IpcResult<FsScreenshotsSummaryResult>
      >,
    clearScreenshots: () =>
      ipcRenderer.invoke(Channels.FsClearScreenshots, {}) as Promise<
        IpcResult<FsClearScreenshotsResult>
      >,
    // Phase-2 Season-2: File.path wurde in Electron 32 entfernt. webUtils.getPathForFile
    // ist die offizielle Bridge — synchron, läuft im Preload-Process (hat Disk-Zugriff
    // im sandboxed Mode), und reicht nur einen String zurück (kein File-Klon über die
    // contextBridge). Leerer String = das File ist kein Disk-File (Clipboard-Image,
    // Browser-Drag ohne Datei) → Caller fällt auf saveScreenshot zurück.
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
    // Phase-2 Season-29 (Multi-Tab-Diff Auto-Refresh): aktives Projekt beim
    // chokidar-Watcher im Main setzen. Renderer ruft bei jedem Wechsel.
    setWatchedProject: (input: FsSetWatchedProjectInput) =>
      ipcRenderer.invoke(Channels.FsSetWatchedProject, input) as Promise<IpcResult<null>>,
    onChanged: (handler: (event: FsChangedEvent) => void) => {
      const wrapped = (_evt: IpcRendererEvent, payload: FsChangedEvent) => handler(payload);
      ipcRenderer.on(Channels.FsChanged, wrapped);
      return () => ipcRenderer.removeListener(Channels.FsChanged, wrapped);
    },
  },
  git: {
    status: (input: GitStatusInput) =>
      ipcRenderer.invoke(Channels.GitStatus, input) as Promise<
        IpcResult<GitStatusResult>
      >,
    diff: (input: GitDiffInput) =>
      ipcRenderer.invoke(Channels.GitDiff, input) as Promise<IpcResult<GitDiffResult>>,
    show: (input: GitShowInput) =>
      ipcRenderer.invoke(Channels.GitShow, input) as Promise<IpcResult<GitShowResult>>,
    showStaged: (input: GitShowStagedInput) =>
      ipcRenderer.invoke(Channels.GitShowStaged, input) as Promise<
        IpcResult<GitShowStagedResult>
      >,
    sessionDiff: (input: GitSessionDiffInput) =>
      ipcRenderer.invoke(Channels.GitSessionDiff, input) as Promise<
        IpcResult<GitSessionDiffResult>
      >,
  },
  projects: {
    list: () => ipcRenderer.invoke(Channels.ProjectList) as Promise<IpcResult<ProjectRow[]>>,
    add: () =>
      ipcRenderer.invoke(Channels.ProjectAdd) as Promise<IpcResult<ProjectRow | null>>,
    scanWorkspace: () =>
      ipcRenderer.invoke(Channels.ProjectScan) as Promise<IpcResult<ProjectRow[]>>,
    readClaudeMd: (input: ProjectReadCfgInput) =>
      ipcRenderer.invoke(Channels.ProjectReadCfg, input) as Promise<
        IpcResult<ClaudeMdParseResult>
      >,
    remove: (input: ProjectRemoveInput) =>
      ipcRenderer.invoke(Channels.ProjectRemove, input) as Promise<
        IpcResult<ProjectRow[]>
      >,
  },
  usage: {
    window: (input: UsageWindowInput) =>
      ipcRenderer.invoke(Channels.UsageWindow, input) as Promise<
        IpcResult<UsageWindowResult>
      >,
    context: (input: UsageContextInput) =>
      ipcRenderer.invoke(Channels.UsageContext, input) as Promise<
        IpcResult<UsageContextResult>
      >,
    heatmap: () =>
      ipcRenderer.invoke(Channels.UsageHeatmap) as Promise<IpcResult<UsageHeatmapResult>>,
    onUpdate: (handler: (event: UsageUpdateEvent) => void) => {
      const wrapped = (_evt: IpcRendererEvent, payload: UsageUpdateEvent) => handler(payload);
      ipcRenderer.on(Channels.UsageUpdate, wrapped);
      return () => ipcRenderer.removeListener(Channels.UsageUpdate, wrapped);
    },
  },
  stats: {
    overview: (input: StatsOverviewInput) =>
      ipcRenderer.invoke(Channels.StatsOverview, input) as Promise<
        IpcResult<StatsOverviewResult>
      >,
    heatmap: (input: StatsHeatmapInput) =>
      ipcRenderer.invoke(Channels.StatsHeatmap, input) as Promise<
        IpcResult<StatsHeatmapResult>
      >,
    models: (input: StatsModelsInput) =>
      ipcRenderer.invoke(Channels.StatsModels, input) as Promise<
        IpcResult<StatsModelsResult>
      >,
  },
  // Phase-2 Season-26: Auto-Update via electron-updater. `onStatePush` ist
  // analog zu sessions.onStatusPush / pty.onData: reichen nur den Payload
  // ueber die contextBridge, kein IpcRendererEvent.
  updater: {
    getState: () =>
      ipcRenderer.invoke(Channels.UpdaterGetState) as Promise<IpcResult<UpdaterState>>,
    check: () =>
      ipcRenderer.invoke(Channels.UpdaterCheck) as Promise<IpcResult<UpdaterState>>,
    startDownload: () =>
      ipcRenderer.invoke(Channels.UpdaterStartDownload) as Promise<IpcResult<UpdaterState>>,
    quitAndInstall: () =>
      ipcRenderer.invoke(Channels.UpdaterQuitAndInstall) as Promise<IpcResult<null>>,
    onStatePush: (handler: (event: UpdaterStatePushEvent) => void) => {
      const wrapped = (_evt: IpcRendererEvent, payload: UpdaterStatePushEvent) =>
        handler(payload);
      ipcRenderer.on(Channels.UpdaterStatePush, wrapped);
      return () => ipcRenderer.removeListener(Channels.UpdaterStatePush, wrapped);
    },
  },
  // Phase-2 Season-34 (Variante D): optionaler Modell-Auto-Refresh. Liefert
  // available=false ohne API-Key (Abo-/OAuth-Pfad).
  models: {
    fetchAvailable: () =>
      ipcRenderer.invoke(Channels.ModelsFetchAvailable) as Promise<IpcResult<ModelFetchResult>>,
  },
};

contextBridge.exposeInMainWorld('api', api);
