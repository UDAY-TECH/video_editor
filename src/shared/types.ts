// Shared data model between main and renderer processes.
// Schema is versioned — bump ProjectFile.version and add a migration in
// main/project-io whenever a field is added or changed.

export interface ProjectFile {
  version: string;
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  settings: ProjectSettings;
  mediaAssets: MediaAsset[];
  tracks: Track[];
}

export interface ProjectSettings {
  resolution: { width: number; height: number };
  fps: number;
  sampleRate: number;
}

export interface MediaAsset {
  id: string;
  filePath: string;
  type: 'video' | 'audio' | 'image';
  duration: number;
  resolution?: { width: number; height: number };
  thumbnailPath?: string;
  proxyPath?: string;
}

export interface Track {
  id: string;
  type: 'video' | 'audio';
  index: number;
  muted: boolean;
  locked: boolean;
  clips: Clip[];
}

export interface Clip {
  id: string;
  mediaAssetId: string;
  trackId: string;
  startTime: number;
  duration: number;
  sourceIn: number;
  sourceOut: number;
  speed: number;
  transform: Transform;
  effects: Effect[];
  keyframes: Record<string, Keyframe[]>;
  transitionIn?: Transition;
  transitionOut?: Transition;
}

export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export interface Effect {
  id: string;
  type: 'brightness' | 'contrast' | 'saturation' | 'blur' | 'lut' | string;
  params: Record<string, number | string>;
}

export interface Keyframe {
  time: number;
  value: number;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}

export interface Transition {
  type: 'fade' | 'dissolve' | 'wipe';
  duration: number;
}

// IPC progress event shape shared by all long-running main→renderer jobs.
export interface ProgressEvent {
  jobId: string;
  percent: number;
  message: string;
}
