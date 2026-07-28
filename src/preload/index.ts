import { contextBridge, ipcRenderer } from 'electron';
import type { Api } from '../shared/api';

const api: Api = {
  media: {
    import: (paths) => ipcRenderer.invoke('media:import', paths),
    generateThumbnail: (asset) => ipcRenderer.invoke('media:generateThumbnail', asset),
    generateWaveform: (asset) => ipcRenderer.invoke('media:generateWaveform', asset),
    importLut: () => ipcRenderer.invoke('media:importLut'),
    generateProxy: (asset) => ipcRenderer.invoke('media:generateProxy', asset),
    onProxyComplete: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]): void =>
        callback(payload);
      ipcRenderer.on('media:proxyComplete', listener);
      return () => ipcRenderer.removeListener('media:proxyComplete', listener);
    },
    onProxyError: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]): void =>
        callback(payload);
      ipcRenderer.on('media:proxyError', listener);
      return () => ipcRenderer.removeListener('media:proxyError', listener);
    },
  },
  project: {
    save: (project, filePath) => ipcRenderer.invoke('project:save', project, filePath),
    load: () => ipcRenderer.invoke('project:load'),
  },
  app: {
    onCheckUnsavedBeforeClose: (callback) => {
      const listener = (): void => callback();
      ipcRenderer.on('app:checkUnsavedBeforeClose', listener);
      return () => ipcRenderer.removeListener('app:checkUnsavedBeforeClose', listener);
    },
    confirmCloseResult: (shouldClose) => ipcRenderer.send('app:confirmCloseResult', shouldClose),
  },
  export: {
    pickOutputPath: (defaultName, container) =>
      ipcRenderer.invoke('export:pickOutputPath', defaultName, container),
    start: (project, settings) => ipcRenderer.invoke('export:start', project, settings),
    cancel: (jobId) => ipcRenderer.send('export:cancel', jobId),
    onProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]): void =>
        callback(payload);
      ipcRenderer.on('export:progress', listener);
      return () => ipcRenderer.removeListener('export:progress', listener);
    },
    onComplete: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]): void =>
        callback(payload);
      ipcRenderer.on('export:complete', listener);
      return () => ipcRenderer.removeListener('export:complete', listener);
    },
    onError: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]): void =>
        callback(payload);
      ipcRenderer.on('export:error', listener);
      return () => ipcRenderer.removeListener('export:error', listener);
    },
  },
};

contextBridge.exposeInMainWorld('api', api);
