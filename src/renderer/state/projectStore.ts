import { create } from 'zustand';
import type { ProjectSettings } from '@shared/types';

const DEFAULT_SETTINGS: ProjectSettings = {
  resolution: { width: 1920, height: 1080 },
  fps: 30,
  sampleRate: 48000,
};

interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  settings: ProjectSettings;
  filePath: string | null;
}

interface ProjectState extends ProjectMeta {
  isDirty: boolean;
  markDirty: () => void;
  reset: (meta?: Partial<ProjectMeta>) => void;
}

function freshMeta(): ProjectMeta {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: 'Untitled Project',
    createdAt: now,
    modifiedAt: now,
    settings: DEFAULT_SETTINGS,
    filePath: null,
  };
}

export const useProjectStore = create<ProjectState>((set) => ({
  ...freshMeta(),
  isDirty: false,

  markDirty: () => set({ isDirty: true }),
  reset: (meta) => set({ ...freshMeta(), isDirty: false, ...meta }),
}));
