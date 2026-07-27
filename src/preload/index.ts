import { contextBridge, ipcRenderer } from 'electron';
import type { Api } from '../shared/api';

const api: Api = {
  media: {
    import: (paths) => ipcRenderer.invoke('media:import', paths),
    generateThumbnail: (asset) => ipcRenderer.invoke('media:generateThumbnail', asset),
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
};

contextBridge.exposeInMainWorld('api', api);
