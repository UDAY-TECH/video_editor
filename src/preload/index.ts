import { contextBridge, ipcRenderer } from 'electron';
import type { Api } from '../shared/api';

const api: Api = {
  media: {
    import: (paths) => ipcRenderer.invoke('media:import', paths),
    generateThumbnail: (asset) => ipcRenderer.invoke('media:generateThumbnail', asset),
  },
};

contextBridge.exposeInMainWorld('api', api);
