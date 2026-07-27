import { useProjectStore } from './projectStore';
import { useMediaBinStore } from './mediaBinStore';
import { useTimelineStore, createDefaultTracks } from './timelineStore';
import type { MediaAsset, ProjectFile } from '@shared/types';

const SCHEMA_VERSION = '1.0.0';

export function buildProjectFile(): ProjectFile {
  const project = useProjectStore.getState();
  return {
    version: SCHEMA_VERSION,
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    modifiedAt: new Date().toISOString(),
    settings: project.settings,
    mediaAssets: useMediaBinStore.getState().assets,
    tracks: useTimelineStore.getState().tracks,
  };
}

function regenerateThumbnails(assets: MediaAsset[]): void {
  for (const asset of assets) {
    if (asset.type === 'audio') continue;
    window.api.media
      .generateThumbnail(asset)
      .then((thumbnailPath) => {
        // Only patch the store if the path actually changed (generateThumbnail
        // reuses an existing cached file when present) - avoids a spurious
        // store update, which would otherwise trip dirty-tracking below.
        if (thumbnailPath && thumbnailPath !== asset.thumbnailPath) {
          useMediaBinStore.getState().updateAsset(asset.id, { thumbnailPath });
        }
      })
      .catch(() => {});
  }
}

export function applyProjectFile(project: ProjectFile, filePath: string): void {
  useMediaBinStore.getState().setAssets(project.mediaAssets);
  useTimelineStore.getState().loadTracks(project.tracks);
  useProjectStore.getState().reset({
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    modifiedAt: project.modifiedAt,
    settings: project.settings,
    filePath,
  });
  regenerateThumbnails(project.mediaAssets);
}

export function resetToNewProject(): void {
  useMediaBinStore.getState().setAssets([]);
  useTimelineStore.getState().loadTracks(createDefaultTracks());
  useProjectStore.getState().reset();
}

export async function saveProject(saveAs: boolean): Promise<void> {
  const project = buildProjectFile();
  const currentPath = useProjectStore.getState().filePath;
  const result = await window.api.project.save(project, saveAs ? null : currentPath);
  if (result.canceled || !result.filePath) return;
  useProjectStore.getState().reset({
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    modifiedAt: project.modifiedAt,
    settings: project.settings,
    filePath: result.filePath,
  });
}

export async function loadProject(): Promise<void> {
  const result = await window.api.project.load();
  if (result.canceled || !result.project || !result.filePath) return;
  applyProjectFile(result.project, result.filePath);
}

function assetIdsChanged(a: MediaAsset[], b: MediaAsset[]): boolean {
  if (a.length !== b.length) return true;
  const bIds = new Set(b.map((asset) => asset.id));
  return a.some((asset) => !bIds.has(asset.id));
}

// Marks the project dirty whenever timeline or media-bin content actually
// changes, so Save/unsaved-changes prompts reflect real edits rather than
// firing on every render. Call once at app startup; returns an unsubscribe fn.
//
// The media-bin check compares asset IDs rather than array identity: background
// thumbnail regeneration (after import or project load) patches individual
// assets in place, which changes the array reference but isn't a user edit -
// comparing IDs means only actual add/remove of media marks the project dirty.
export function initDirtyTracking(): () => void {
  const unsubTimeline = useTimelineStore.subscribe((state, prevState) => {
    if (state.tracks !== prevState.tracks) useProjectStore.getState().markDirty();
  });
  const unsubMedia = useMediaBinStore.subscribe((state, prevState) => {
    if (assetIdsChanged(state.assets, prevState.assets)) useProjectStore.getState().markDirty();
  });
  return () => {
    unsubTimeline();
    unsubMedia();
  };
}
