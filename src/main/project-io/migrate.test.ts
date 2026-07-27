import { describe, it, expect } from 'vitest';
import { migrateProjectFile, CURRENT_PROJECT_VERSION } from './migrate';

function validProject(): Record<string, unknown> {
  return {
    version: CURRENT_PROJECT_VERSION,
    id: 'proj-1',
    name: 'Test Project',
    createdAt: '2024-01-01T00:00:00.000Z',
    modifiedAt: '2024-01-01T00:00:00.000Z',
    settings: { resolution: { width: 1920, height: 1080 }, fps: 30, sampleRate: 48000 },
    mediaAssets: [],
    tracks: [],
  };
}

describe('migrateProjectFile', () => {
  it('accepts a valid current-version project file', () => {
    const result = migrateProjectFile(validProject());
    expect(result.id).toBe('proj-1');
    expect(result.tracks).toEqual([]);
  });

  it('rejects non-object input', () => {
    expect(() => migrateProjectFile('not an object')).toThrow();
    expect(() => migrateProjectFile(null)).toThrow();
    expect(() => migrateProjectFile([1, 2, 3])).toThrow();
  });

  it('rejects an unsupported version', () => {
    expect(() => migrateProjectFile({ ...validProject(), version: '0.0.1' })).toThrow(/unsupported version/);
  });

  it('rejects a project missing required fields', () => {
    const project = validProject();
    delete project.settings;
    expect(() => migrateProjectFile(project)).toThrow(/settings/);
  });

  it('rejects malformed settings.resolution', () => {
    const project = validProject();
    (project.settings as Record<string, unknown>).resolution = { width: 'wide', height: 1080 };
    expect(() => migrateProjectFile(project)).toThrow(/resolution.width/);
  });

  it('rejects when mediaAssets or tracks are not arrays', () => {
    const project = validProject();
    project.tracks = 'nope';
    expect(() => migrateProjectFile(project)).toThrow(/tracks/);
  });

  it('accepts a well-formed track with a well-formed clip', () => {
    const project = validProject();
    project.tracks = [
      {
        id: 't1',
        type: 'video',
        index: 0,
        muted: false,
        locked: false,
        clips: [
          {
            id: 'c1',
            mediaAssetId: 'a1',
            trackId: 't1',
            startTime: 0,
            duration: 5,
            sourceIn: 0,
            sourceOut: 5,
            speed: 1,
            transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
            effects: [],
            keyframes: {},
          },
        ],
      },
    ];
    expect(() => migrateProjectFile(project)).not.toThrow();
  });

  it('rejects a track whose clips are missing required fields', () => {
    const project = validProject();
    project.tracks = [
      { id: 't1', type: 'video', index: 0, clips: [{ id: 'c1' }] },
    ];
    expect(() => migrateProjectFile(project)).toThrow(/clips\[0\]/);
  });

  it('rejects a media asset missing required fields', () => {
    const project = validProject();
    project.mediaAssets = [{ id: 'a1' }];
    expect(() => migrateProjectFile(project)).toThrow(/mediaAssets\[0\]/);
  });
});
