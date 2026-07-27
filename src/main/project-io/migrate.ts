import type { ProjectFile } from '../../shared/types';
import { CURRENT_PROJECT_VERSION } from '../../shared/schemaVersion';

export { CURRENT_PROJECT_VERSION };

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

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`Invalid project file: missing or invalid "${field}"`);
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

function validateTextContent(value: unknown, prefix: string): void {
  const text = requireObject(value, `${prefix}.text`);
  requireString(text.content, `${prefix}.text.content`);
  requireString(text.fontFamily, `${prefix}.text.fontFamily`);
  requireNumber(text.fontSize, `${prefix}.text.fontSize`);
  requireString(text.color, `${prefix}.text.color`);
  requireString(text.align, `${prefix}.text.align`);
  requireString(text.entranceAnimation, `${prefix}.text.entranceAnimation`);
  requireString(text.exitAnimation, `${prefix}.text.exitAnimation`);
}

function validateClip(value: unknown, trackIndex: number, clipIndex: number): void {
  const prefix = `tracks[${trackIndex}].clips[${clipIndex}]`;
  const clip = requireObject(value, prefix);
  requireString(clip.id, `${prefix}.id`);
  requireString(clip.trackId, `${prefix}.trackId`);
  requireNumber(clip.startTime, `${prefix}.startTime`);
  requireNumber(clip.duration, `${prefix}.duration`);
  requireNumber(clip.sourceIn, `${prefix}.sourceIn`);
  requireNumber(clip.sourceOut, `${prefix}.sourceOut`);
  requireNumber(clip.volume, `${prefix}.volume`);
  requireObject(clip.transform, `${prefix}.transform`);
  requireArray(clip.effects, `${prefix}.effects`);
  requireObject(clip.keyframes, `${prefix}.keyframes`);

  const hasMediaAssetId = typeof clip.mediaAssetId === 'string';
  const hasText = clip.text !== undefined;
  if (!hasMediaAssetId && !hasText) {
    throw new Error(`Invalid project file: "${prefix}" must have either "mediaAssetId" or "text"`);
  }
  if (hasText) validateTextContent(clip.text, prefix);
}

function validateTrack(value: unknown, index: number): void {
  const prefix = `tracks[${index}]`;
  const track = requireObject(value, prefix);
  requireString(track.id, `${prefix}.id`);
  requireString(track.type, `${prefix}.type`);
  requireNumber(track.index, `${prefix}.index`);
  requireBoolean(track.solo, `${prefix}.solo`);
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
  let version = raw.version;
  let migrated = raw;

  if (version === '1.0.0') {
    // 1.0.0 -> 1.1.0: added optional Clip.text for text clips; mediaAssetId
    // became conditionally required (present unless the clip is a text
    // clip). No data transformation needed - every 1.0.0 clip already has a
    // valid mediaAssetId, which remains valid under the new schema.
    migrated = { ...migrated, version: '1.1.0' };
    version = '1.1.0';
  }

  if (version === '1.1.0') {
    // 1.1.0 -> 1.2.0: added Clip.volume (default 1, keyframeable like any
    // other property) and Track.solo (default false), plus optional
    // Track ducking fields and MediaAsset.waveformPath (no default needed
    // since they're optional). Inject defaults for the two new required fields.
    const tracks = Array.isArray(migrated.tracks) ? migrated.tracks : [];
    const migratedTracks = tracks.map((rawTrack) => {
      const track = isPlainObject(rawTrack) ? rawTrack : {};
      const clips = Array.isArray(track.clips) ? track.clips : [];
      const migratedClips = clips.map((rawClip) => {
        const clip = isPlainObject(rawClip) ? rawClip : {};
        return { ...clip, volume: typeof clip.volume === 'number' ? clip.volume : 1 };
      });
      return {
        ...track,
        solo: typeof track.solo === 'boolean' ? track.solo : false,
        clips: migratedClips,
      };
    });
    migrated = { ...migrated, tracks: migratedTracks, version: '1.2.0' };
    version = '1.2.0';
  }

  if (version === CURRENT_PROJECT_VERSION) return migrated;
  throw new Error(`Invalid project file: unsupported version "${String(version)}"`);
}

export function migrateProjectFile(raw: unknown): ProjectFile {
  const obj = requireObject(raw, '<root>');
  const migrated = migrateToCurrentVersion(obj);
  return validateProjectShape(migrated);
}
