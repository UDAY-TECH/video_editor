import type { MediaAsset, ProjectFile } from './types';

export interface MediaApi {
  import(paths?: string[]): Promise<MediaAsset[]>;
  generateThumbnail(
    asset: Pick<MediaAsset, 'id' | 'filePath' | 'type' | 'duration'>,
  ): Promise<string | null>;
}

export interface ProjectSaveResult {
  canceled: boolean;
  filePath?: string;
}

export interface ProjectLoadResult {
  canceled: boolean;
  filePath?: string;
  project?: ProjectFile;
}

export interface ProjectApi {
  save(project: ProjectFile, filePath: string | null): Promise<ProjectSaveResult>;
  load(): Promise<ProjectLoadResult>;
}

export interface AppApi {
  onCheckUnsavedBeforeClose(callback: () => void): () => void;
  confirmCloseResult(shouldClose: boolean): void;
}

export interface Api {
  media: MediaApi;
  project: ProjectApi;
  app: AppApi;
}
