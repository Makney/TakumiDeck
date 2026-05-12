import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { Channels } from '@shared/ipc-channels';
import type {
  AppSettings,
  ClaudeMdParseResult,
  SessionStatusPushEvent,
  FsListTemplatesInput,
  FsListTreeInput,
  FsReadInput,
  FsReadResult,
  FsTreeNode,
  FsWriteInput,
  FsWriteResult,
  GitDiffInput,
  GitDiffResult,
  GitShowInput,
  GitShowResult,
  GitStatusInput,
  GitStatusResult,
  IpcResult,
  ProjectReadCfgInput,
  ProjectRow,
  PtyCreateInput,
  PtyDataEvent,
  PtyExitEvent,
  PtyKillInput,
  PtyResizeInput,
  PtyTuiStateInput,
  PtyWriteInput,
  RendererApi,
  SessionArchiveInput,
  SessionCloseInput,
  SessionHistoryEntry,
  SessionHistoryInput,
  SessionResumeInput,
  SessionRow,
  SessionUpdateInput,
  TemplateFile,
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
};

contextBridge.exposeInMainWorld('api', api);
