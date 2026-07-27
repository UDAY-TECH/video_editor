import type { ProjectFile } from '../../shared/types';

export const CURRENT_PROJECT_VERSION = '1.0.0';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireObject(value: unknown, field: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`Invalid project file: missing or invalid "${field}"`);
  return value;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid project file: missing or invalid "${field}"`);
  return value;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number') throw new Error(`Invalid project file: missing or invalid "${field}"`);
  return value;
}

function requireArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`Invalid project file: missing or invalid "${field}"`);
  return value;
}

function validateMediaAsset(value: unknown, index: number): void {
  const asset = requireObject(value, `mediaAssets[${index}]`);
  requireString(asset.id, `mediaAssets[${index}].id`);
  requireString(asset.filePath, `mediaAssets[${index}].filePath`);
  requireString(asset.type, `mediaAssets[${index}].type`);
  requireNumber(asset.duration, `mediaAssets[${index}].duration`);
}

function validateClip(value: unknown, trackIndex: number, clipIndex: number): void {
  const prefix = `tracks[${trackIndex}].clips[${clipIndex}]`;
  const clip = requireObject(value, prefix);
  requireString(clip.id, `${prefix}.id`);
  requireString(clip.mediaAssetId, `${prefix}.mediaAssetId`);
  requireString(clip.trackId, `${prefix}.trackId`);
  requireNumber(clip.startTime, `${prefix}.startTime`);
  requireNumber(clip.duration, `${prefix}.duration`);
  requireNumber(clip.sourceIn, `${prefix}.sourceIn`);
  requireNumber(clip.sourceOut, `${prefix}.sourceOut`);
  requireObject(clip.transform, `${prefix}.transform`);
  requireArray(clip.effects, `${prefix}.effects`);
  requireObject(clip.keyframes, `${prefix}.keyframes`);
}

function validateTrack(value: unknown, index: number): void {
  const prefix = `tracks[${index}]`;
  const track = requireObject(value, prefix);
  requireString(track.id, `${prefix}.id`);
  requireString(track.type, `${prefix}.type`);
  requireNumber(track.index, `${prefix}.index`);
  const clips = requireArray(track.clips, `${prefix}.clips`);
  clips.forEach((clip, clipIndex) => validateClip(clip, index, clipIndex));
}

function validateProjectShape(raw: Record<string, unknown>): ProjectFile {
  requireString(raw.version, 'version');
  requireString(raw.id, 'id');
  requireString(raw.name, 'name');
  requireString(raw.createdAt, 'createdAt');
  requireString(raw.modifiedAt, 'modifiedAt');
  const settings = requireObject(raw.settings, 'settings');
  const mediaAssets = requireArray(raw.mediaAssets, 'mediaAssets');
  const tracks = requireArray(raw.tracks, 'tracks');

  const resolution = requireObject(settings.resolution, 'settings.resolution');
  requireNumber(resolution.width, 'settings.resolution.width');
  requireNumber(resolution.height, 'settings.resolution.height');
  requireNumber(settings.fps, 'settings.fps');
  requireNumber(settings.sampleRate, 'settings.sampleRate');

  mediaAssets.forEach((asset, index) => validateMediaAsset(asset, index));
  tracks.forEach((track, index) => validateTrack(track, index));

  return raw as unknown as ProjectFile;
}

// Bump CURRENT_PROJECT_VERSION and add a case here whenever the schema
// (Section 3 of the spec) changes, transforming `raw` up to the current shape
// before it reaches validateProjectShape.
function migrateToCurrentVersion(raw: Record<string, unknown>): Record<string, unknown> {
  const version = raw.version;
  if (version === CURRENT_PROJECT_VERSION) return raw;
  throw new Error(`Invalid project file: unsupported version "${String(version)}"`);
}

export function migrateProjectFile(raw: unknown): ProjectFile {
  const obj = requireObject(raw, '<root>');
  const migrated = migrateToCurrentVersion(obj);
  return validateProjectShape(migrated);
}
