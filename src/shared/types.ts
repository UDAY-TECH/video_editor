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
  // Cached fixed-length peak array (JSON file) for waveform display, alongside thumbnailPath.
  waveformPath?: string;
}

export interface Track {
  id: string;
  type: 'video' | 'audio';
  index: number;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  clips: Clip[];
  // Rule-based ducking (Section 5.6): while `duckingTriggerTrackId` has an
  // active, audible clip, this track's gain is reduced by duckingReductionDb.
  duckingTriggerTrackId?: string;
  duckingReductionDb?: number;
}

export interface Clip {
  id: string;
  // Absent for text clips (see `text` below) — a clip must have exactly one
  // of mediaAssetId or text.
  mediaAssetId?: string;
  trackId: string;
  startTime: number;
  duration: number;
  sourceIn: number;
  sourceOut: number;
  speed: number;
  // 1.0 = 100%; keyframeable via keyframes['volume'] like any transform
  // property, even though it doesn't live on `transform` (it's audio, not visual).
  volume: number;
  transform: Transform;
  effects: Effect[];
  keyframes: Record<string, Keyframe[]>;
  // Brightness/contrast/saturation/exposure are keyframeable via
  // keyframes['brightness'] etc, same convention as volume above.
  colorCorrection: ColorCorrection;
  transitionIn?: Transition;
  transitionOut?: Transition;
  // Present only for text clips. Text clips have no backing MediaAsset —
  // they're generated content placed directly on a video track — but still
  // use the ordinary startTime/duration/sourceIn/sourceOut/transform/
  // keyframes fields above like any other clip.
  text?: TextClipContent;
}

export interface TextClipContent {
  content: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  align: 'left' | 'center' | 'right';
  entranceAnimation: 'none' | 'fade' | 'slide';
  exitAnimation: 'none' | 'fade' | 'slide';
}

export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

// Section 5.7: all four numeric fields are additive around a neutral 0 (no
// change), matching the FFmpeg `eq` filter's own neutral convention that the
// Phase 9 export filter chain will build on. Live preview approximates this
// via a Canvas 2D `filter` string (see renderer/engine/colorCorrection.ts).
export interface ColorCorrection {
  brightness: number; // -100..100
  contrast: number; // -100..100
  saturation: number; // -100..100
  exposure: number; // -3..3 stops
  // Absolute path to an imported .cube file; absent until the user imports one.
  lutPath?: string;
  lutIntensity: number; // 0..1 blend between ungraded and fully-graded, default 1
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
