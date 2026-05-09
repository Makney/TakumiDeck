import { contextBridge, ipcRenderer } from 'electron';
import { Channels } from '@shared/ipc-channels';
import type { AppSettings, IpcResult, RendererApi } from '@shared/types';

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
};

contextBridge.exposeInMainWorld('api', api);
