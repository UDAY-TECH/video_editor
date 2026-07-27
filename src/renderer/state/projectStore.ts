import { create } from 'zustand';
import type { ProjectFile } from '@shared/types';

interface ProjectState {
  project: ProjectFile | null;
  setProject: (project: ProjectFile) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  project: null,
  setProject: (project) => set({ project }),
}));
