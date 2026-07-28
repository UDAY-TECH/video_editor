import type { ExportContainer, ExportSettings, MediaAsset, ProgressEvent, ProjectFile } from './types';

export interface ProxyStartResult {
  // Non-null when a cached proxy already exists (nothing to wait for).
  proxyPath: string | null;
  // Non-null when generation was kicked off in the background - listen for
  // onProxyComplete/onProxyError filtered by this id.
  jobId: string | null;
}

export interface ProxyCompleteEvent {
  jobId: string;
  assetId: string;
  proxyPath: string;
}

export interface ProxyErrorEvent {
  jobId: string;
  assetId: string;
  message: string;
}

export interface MediaApi {
  import(paths?: string[]): Promise<MediaAsset[]>;
  generateThumbnail(
    asset: Pick<MediaAsset, 'id' | 'filePath' | 'type' | 'duration'>,
  ): Promise<string | null>;
  generateWaveform(asset: Pick<MediaAsset, 'id' | 'filePath' | 'type'>): Promise<string | null>;
  // Opens a file dialog for a .cube LUT and returns its absolute path (null if canceled).
  importLut(): Promise<string | null>;
  // Only generates (and only returns non-null) for video assets above the 4K-oriented
  // resolution threshold (Section 5.2/6) - a no-op for everything else.
  generateProxy(
    asset: Pick<MediaAsset, 'id' | 'filePath' | 'type' | 'duration' | 'resolution'>,
  ): Promise<ProxyStartResult>;
  onProxyComplete(callback: (event: ProxyCompleteEvent) => void): () => void;
  onProxyError(callback: (event: ProxyErrorEvent) => void): () => void;
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

export interface ExportStartResult {
  jobId: string;
}

export interface ExportCompleteEvent {
  jobId: string;
  outputPath: string;
}

export interface ExportErrorEvent {
  jobId: string;
  message: string;
}

export interface ExportApi {
  // Opens a native save dialog filtered to the given container's extension.
  pickOutputPath(defaultName: string, container: ExportContainer): Promise<string | null>;
  start(project: ProjectFile, settings: ExportSettings): Promise<ExportStartResult>;
  cancel(jobId: string): void;
  onProgress(callback: (event: ProgressEvent) => void): () => void;
  onComplete(callback: (event: ExportCompleteEvent) => void): () => void;
  onError(callback: (event: ExportErrorEvent) => void): () => void;
}

export interface Api {
  media: MediaApi;
  project: ProjectApi;
  app: AppApi;
  export: ExportApi;
}
