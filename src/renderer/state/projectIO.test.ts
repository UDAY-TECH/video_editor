import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from './projectStore';
import { useMediaBinStore } from './mediaBinStore';
import { useTimelineStore } from './timelineStore';
import {
  buildProjectFile,
  applyProjectFile,
  resetToNewProject,
  saveProject,
  loadProject,
  initDirtyTracking,
} from './projectIO';
import { CURRENT_PROJECT_VERSION } from '@shared/schemaVersion';
import type { MediaAsset, ProjectFile } from '@shared/types';

const asset: MediaAsset = {
  id: 'asset-1',
  filePath: 'C:\\videos\\clip.mp4',
  type: 'video',
  duration: 10,
  resolution: { width: 1920, height: 1080 },
};

beforeEach(() => {
  resetToNewProject();
});

describe('buildProjectFile / applyProjectFile', () => {
  it('writes the current schema version, not a stale hardcoded one', () => {
    expect(buildProjectFile().version).toBe(CURRENT_PROJECT_VERSION);
  });

  it('round-trips media assets and tracks through build/apply', () => {
    useMediaBinStore.getState().addAssets([asset]);
    useTimelineStore.getState().addClip(useTimelineStore.getState().tracks[0].id, asset, 0);

    const project = buildProjectFile();
    expect(project.mediaAssets).toHaveLength(1);
    expect(project.tracks.some((t) => t.clips.length > 0)).toBe(true);

    resetToNewProject();
    expect(useMediaBinStore.getState().assets).toHaveLength(0);

    (globalThis as { window?: unknown }).window = {
      api: {
        media: {
          generateThumbnail: vi.fn().mockResolvedValue(null),
          generateWaveform: vi.fn().mockResolvedValue(null),
          generateProxy: vi.fn().mockResolvedValue({ jobId: null, proxyPath: null }),
        },
      },
    };
    applyProjectFile(project, 'C:\\projects\\test.veproj');

    expect(useMediaBinStore.getState().assets).toHaveLength(1);
    expect(useProjectStore.getState().filePath).toBe('C:\\projects\\test.veproj');
    expect(useProjectStore.getState().isDirty).toBe(false);
    expect(useTimelineStore.getState().tracks.some((t) => t.clips.length > 0)).toBe(true);
  });
});

describe('resetToNewProject', () => {
  it('clears media assets and resets tracks to the default empty set', () => {
    useMediaBinStore.getState().addAssets([asset]);
    resetToNewProject();
    expect(useMediaBinStore.getState().assets).toHaveLength(0);
    const tracks = useTimelineStore.getState().tracks;
    expect(tracks).toHaveLength(4);
    expect(tracks.every((t) => t.clips.length === 0)).toBe(true);
    expect(useProjectStore.getState().isDirty).toBe(false);
  });
});

describe('saveProject', () => {
  it('saves to the current filePath without forcing a dialog when one is already set', async () => {
    const save = vi.fn().mockResolvedValue({ canceled: false, filePath: 'C:\\p\\a.veproj' });
    (globalThis as { window?: unknown }).window = { api: { project: { save } } };

    useProjectStore.setState({ filePath: 'C:\\p\\a.veproj' });
    await saveProject(false);

    expect(save).toHaveBeenCalledWith(expect.anything(), 'C:\\p\\a.veproj');
    expect(useProjectStore.getState().isDirty).toBe(false);
  });

  it('passes null to force a dialog on Save As even if a path is already set', async () => {
    const save = vi.fn().mockResolvedValue({ canceled: false, filePath: 'C:\\p\\b.veproj' });
    (globalThis as { window?: unknown }).window = { api: { project: { save } } };

    useProjectStore.setState({ filePath: 'C:\\p\\a.veproj' });
    await saveProject(true);

    expect(save).toHaveBeenCalledWith(expect.anything(), null);
    expect(useProjectStore.getState().filePath).toBe('C:\\p\\b.veproj');
  });

  it('leaves state untouched when the save dialog is canceled', async () => {
    const save = vi.fn().mockResolvedValue({ canceled: true });
    (globalThis as { window?: unknown }).window = { api: { project: { save } } };

    useProjectStore.setState({ filePath: null });
    useProjectStore.getState().markDirty();
    await saveProject(true);

    expect(useProjectStore.getState().filePath).toBeNull();
    expect(useProjectStore.getState().isDirty).toBe(true);
  });
});

describe('loadProject', () => {
  it('applies the loaded project when not canceled', async () => {
    const projectFile: ProjectFile = {
      version: '1.0.0',
      id: 'p1',
      name: 'Loaded',
      createdAt: '2024-01-01T00:00:00.000Z',
      modifiedAt: '2024-01-01T00:00:00.000Z',
      settings: { resolution: { width: 1280, height: 720 }, fps: 24, sampleRate: 44100 },
      mediaAssets: [asset],
      tracks: [],
    };
    const load = vi
      .fn()
      .mockResolvedValue({ canceled: false, filePath: 'C:\\p\\loaded.veproj', project: projectFile });
    (globalThis as { window?: unknown }).window = {
      api: {
        project: { load },
        media: {
          generateThumbnail: vi.fn().mockResolvedValue(null),
          generateWaveform: vi.fn().mockResolvedValue(null),
          generateProxy: vi.fn().mockResolvedValue({ jobId: null, proxyPath: null }),
        },
      },
    };

    await loadProject();

    expect(useProjectStore.getState().name).toBe('Loaded');
    expect(useProjectStore.getState().filePath).toBe('C:\\p\\loaded.veproj');
    expect(useMediaBinStore.getState().assets).toHaveLength(1);
  });

  it('does nothing when the open dialog is canceled', async () => {
    const load = vi.fn().mockResolvedValue({ canceled: true });
    (globalThis as { window?: unknown }).window = { api: { project: { load } } };

    const before = useProjectStore.getState().name;
    await loadProject();
    expect(useProjectStore.getState().name).toBe(before);
  });
});

describe('initDirtyTracking', () => {
  it('does not mark dirty when an in-place asset patch (e.g. thumbnail regen) keeps the same set of ids', () => {
    useMediaBinStore.getState().addAssets([asset]);
    const unsubscribe = initDirtyTracking();
    useProjectStore.setState({ isDirty: false });

    useMediaBinStore.getState().updateAsset(asset.id, { thumbnailPath: 'C:\\thumbs\\asset-1.jpg' });

    expect(useProjectStore.getState().isDirty).toBe(false);
    unsubscribe();
  });

  it('marks dirty when an asset is actually added or removed', () => {
    const unsubscribe = initDirtyTracking();
    useProjectStore.setState({ isDirty: false });

    useMediaBinStore.getState().addAssets([asset]);

    expect(useProjectStore.getState().isDirty).toBe(true);
    unsubscribe();
  });

  it('marks dirty when timeline tracks change', () => {
    const unsubscribe = initDirtyTracking();
    useProjectStore.setState({ isDirty: false });

    useTimelineStore.getState().addTrack('video');

    expect(useProjectStore.getState().isDirty).toBe(true);
    unsubscribe();
  });
});
