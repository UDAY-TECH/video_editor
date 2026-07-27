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
        solo: false,
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
            volume: 1,
            transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
            effects: [],
            keyframes: {},
          },
        ],
      },
    ];
    expect(() => migrateProjectFile(project)).not.toThrow();
  });

  it('rejects a track missing solo', () => {
    const project = validProject();
    project.tracks = [
      { id: 't1', type: 'video', index: 0, muted: false, locked: false, clips: [] },
    ];
    expect(() => migrateProjectFile(project)).toThrow(/\.solo/);
  });

  it('rejects a clip missing volume', () => {
    const project = validProject();
    project.tracks = [
      {
        id: 't1',
        type: 'video',
        index: 0,
        muted: false,
        solo: false,
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
    expect(() => migrateProjectFile(project)).toThrow(/\.volume/);
  });

  it('rejects a track whose clips are missing required fields', () => {
    const project = validProject();
    project.tracks = [
      { id: 't1', type: 'video', index: 0, solo: false, clips: [{ id: 'c1' }] },
    ];
    expect(() => migrateProjectFile(project)).toThrow(/clips\[0\]/);
  });

  it('rejects a media asset missing required fields', () => {
    const project = validProject();
    project.mediaAssets = [{ id: 'a1' }];
    expect(() => migrateProjectFile(project)).toThrow(/mediaAssets\[0\]/);
  });

  it('migrates a 1.0.0 project file forward to the current version', () => {
    const project = { ...validProject(), version: '1.0.0' };
    const result = migrateProjectFile(project);
    expect(result.version).toBe(CURRENT_PROJECT_VERSION);
  });

  it('migrates a 1.1.0 project file forward, injecting solo/volume defaults', () => {
    const project = {
      ...validProject(),
      version: '1.1.0',
      tracks: [
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
      ],
    };
    const result = migrateProjectFile(project);
    expect(result.version).toBe(CURRENT_PROJECT_VERSION);
    expect(result.tracks[0].solo).toBe(false);
    expect(result.tracks[0].clips[0].volume).toBe(1);
  });

  it('accepts a text clip that has no mediaAssetId', () => {
    const project = validProject();
    project.tracks = [
      {
        id: 't1',
        type: 'video',
        index: 0,
        muted: false,
        solo: false,
        locked: false,
        clips: [
          {
            id: 'c1',
            trackId: 't1',
            startTime: 0,
            duration: 5,
            sourceIn: 0,
            sourceOut: 5,
            speed: 1,
            volume: 1,
            transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
            effects: [],
            keyframes: {},
            text: {
              content: 'Hello',
              fontFamily: 'Arial',
              fontSize: 48,
              color: '#ffffff',
              align: 'center',
              entranceAnimation: 'none',
              exitAnimation: 'none',
            },
          },
        ],
      },
    ];
    expect(() => migrateProjectFile(project)).not.toThrow();
  });

  it('rejects a clip with neither mediaAssetId nor text', () => {
    const project = validProject();
    project.tracks = [
      {
        id: 't1',
        type: 'video',
        index: 0,
        muted: false,
        solo: false,
        locked: false,
        clips: [
          {
            id: 'c1',
            trackId: 't1',
            startTime: 0,
            duration: 5,
            sourceIn: 0,
            sourceOut: 5,
            speed: 1,
            volume: 1,
            transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
            effects: [],
            keyframes: {},
          },
        ],
      },
    ];
    expect(() => migrateProjectFile(project)).toThrow(/mediaAssetId.*text/);
  });

  it('rejects a text clip with a malformed text object', () => {
    const project = validProject();
    project.tracks = [
      {
        id: 't1',
        type: 'video',
        index: 0,
        muted: false,
        solo: false,
        locked: false,
        clips: [
          {
            id: 'c1',
            trackId: 't1',
            startTime: 0,
            duration: 5,
            sourceIn: 0,
            sourceOut: 5,
            speed: 1,
            volume: 1,
            transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
            effects: [],
            keyframes: {},
            text: { content: 'Hello' },
          },
        ],
      },
    ];
    expect(() => migrateProjectFile(project)).toThrow(/text\.fontFamily/);
  });
});
