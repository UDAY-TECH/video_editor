import { contextBridge } from 'electron';

// Typed IPC surface exposed to the renderer. Channels will be added here as
// each IPC domain (media, project, export) is implemented in later phases.
const api = {};

contextBridge.exposeInMainWorld('api', api);

export type Api = typeof api;
