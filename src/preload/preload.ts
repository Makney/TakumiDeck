import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { Channels } from '@shared/ipc-channels';
import type {
  AppSettings,
  IpcResult,
  PtyCreateInput,
  PtyDataEvent,
  PtyExitEvent,
  PtyKillInput,
  PtyResizeInput,
  PtyWriteInput,
  RendererApi,
  SessionCloseInput,
  SessionResumeInput,
  SessionRow,
  SessionUpdateInput,
} from '@shared/types';

// Whitelist-API. Renderer hat keinen direkten Node/Electron-Zugriff (contextIsolation: true,
// sandbox: true). Jede Methode forwardet an einen genau definierten IPC-Channel und
// returnt ein IpcResult, dessen Shape im Main durch zod validiert wird.
const api: RendererApi = {
  settings: {
    get: () => ipcRenderer.invoke(Channels.SettingsGet) as Promise<IpcResult<AppSettings>>,
    set: (patch) =>
      ipcRenderer.invoke(Channels.SettingsSet, patch) as Promise<IpcResult<AppSettings>>,
  },
  app: {
    getVersion: () => ipcRenderer.invoke(Channels.AppGetVersion) as Promise<IpcResult<string>>,
    openDataFolder: () =>
      ipcRenderer.invoke(Channels.AppOpenDataFolder) as Promise<IpcResult<string>>,
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
  },
};

contextBridge.exposeInMainWorld('api', api);
