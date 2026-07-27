import { create } from 'zustand';
import type { Clip, MediaAsset, Track } from '@shared/types';
import { hasOverlap } from '../engine/timelineMath';

const DEFAULT_ZOOM = 50;
const DEFAULT_IMAGE_DURATION = 5;
const ZOOM_STORAGE_KEY = 'videoEditor.timeline.zoom';
const SNAP_STORAGE_KEY = 'videoEditor.timeline.snapping';

interface Command {
  do: () => void;
  undo: () => void;
}

function loadZoom(): number {
  if (typeof localStorage === 'undefined') return DEFAULT_ZOOM;
  const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
  const parsed = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ZOOM;
}

function loadSnapping(): boolean {
  if (typeof localStorage === 'undefined') return true;
  const raw = localStorage.getItem(SNAP_STORAGE_KEY);
  return raw === null ? true : raw === 'true';
}

function createDefaultTracks(): Track[] {
  return [
    { id: crypto.randomUUID(), type: 'video', index: 0, muted: false, locked: false, clips: [] },
    { id: crypto.randomUUID(), type: 'video', index: 1, muted: false, locked: false, clips: [] },
    { id: crypto.randomUUID(), type: 'audio', index: 0, muted: false, locked: false, clips: [] },
    { id: crypto.randomUUID(), type: 'audio', index: 1, muted: false, locked: false, clips: [] },
  ];
}

export function findClip(tracks: Track[], clipId: string): { clip: Clip; track: Track } | null {
  for (const track of tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) return { clip, track };
  }
  return null;
}

function isAssetCompatibleWithTrack(assetType: MediaAsset['type'], trackType: Track['type']): boolean {
  return trackType === 'audio' ? assetType === 'audio' : assetType === 'video' || assetType === 'image';
}

function insertClip(tracks: Track[], clip: Clip): Track[] {
  return tracks.map((t) => (t.id === clip.trackId ? { ...t, clips: [...t.clips, clip] } : t));
}

function removeClipFromTracks(tracks: Track[], clipId: string): Track[] {
  return tracks.map((t) => ({ ...t, clips: t.clips.filter((c) => c.id !== clipId) }));
}

function replaceClip(tracks: Track[], clipId: string, updater: (clip: Clip) => Clip): Track[] {
  return tracks.map((t) => ({
    ...t,
    clips: t.clips.map((c) => (c.id === clipId ? updater(c) : c)),
  }));
}

function relocateClip(tracks: Track[], clipId: string, newTrackId: string, newStartTime: number): Track[] {
  const found = findClip(tracks, clipId);
  if (!found) return tracks;
  const movedClip = { ...found.clip, trackId: newTrackId, startTime: newStartTime };
  return insertClip(removeClipFromTracks(tracks, clipId), movedClip);
}

interface TimelineState {
  tracks: Track[];
  selectedClipId: string | null;
  playheadTime: number;
  zoom: number;
  snappingEnabled: boolean;
  past: Command[];
  future: Command[];

  selectClip: (id: string | null) => void;
  setPlayhead: (time: number) => void;
  setZoom: (zoom: number) => void;
  toggleSnapping: () => void;

  addTrack: (type: 'video' | 'audio') => void;
  addClip: (trackId: string, asset: MediaAsset, startTime: number) => boolean;
  moveClip: (clipId: string, trackId: string, startTime: number) => boolean;
  trimClipStart: (clipId: string, newStartTime: number) => boolean;
  trimClipEnd: (clipId: string, newEndTime: number, maxSourceOut?: number) => boolean;
  splitClipAt: (clipId: string, atTime: number) => boolean;
  removeClip: (clipId: string, mode: 'lift' | 'ripple') => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;

  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

export const useTimelineStore = create<TimelineState>((set, get) => {
  function runCommand(command: Command): void {
    command.do();
    set((state) => ({ past: [...state.past, command], future: [] }));
  }

  return {
    tracks: createDefaultTracks(),
    selectedClipId: null,
    playheadTime: 0,
    zoom: loadZoom(),
    snappingEnabled: loadSnapping(),
    past: [],
    future: [],

    selectClip: (id) => set({ selectedClipId: id }),
    setPlayhead: (time) => set({ playheadTime: Math.max(0, time) }),
    setZoom: (zoom) => {
      const clamped = Math.max(5, Math.min(500, zoom));
      if (typeof localStorage !== 'undefined') localStorage.setItem(ZOOM_STORAGE_KEY, String(clamped));
      set({ zoom: clamped });
    },
    toggleSnapping: () =>
      set((state) => {
        const next = !state.snappingEnabled;
        if (typeof localStorage !== 'undefined') localStorage.setItem(SNAP_STORAGE_KEY, String(next));
        return { snappingEnabled: next };
      }),

    addTrack: (type) => {
      const sameType = get().tracks.filter((t) => t.type === type);
      const newTrack: Track = {
        id: crypto.randomUUID(),
        type,
        index: sameType.length,
        muted: false,
        locked: false,
        clips: [],
      };
      runCommand({
        do: () => set((state) => ({ tracks: [...state.tracks, newTrack] })),
        undo: () => set((state) => ({ tracks: state.tracks.filter((t) => t.id !== newTrack.id) })),
      });
    },

    addClip: (trackId, asset, startTime) => {
      const track = get().tracks.find((t) => t.id === trackId);
      if (!track || track.locked || !isAssetCompatibleWithTrack(asset.type, track.type)) return false;
      const duration = asset.duration > 0 ? asset.duration : DEFAULT_IMAGE_DURATION;
      const clampedStart = Math.max(0, startTime);
      if (hasOverlap(track, null, clampedStart, duration)) return false;

      const clip: Clip = {
        id: crypto.randomUUID(),
        mediaAssetId: asset.id,
        trackId,
        startTime: clampedStart,
        duration,
        sourceIn: 0,
        sourceOut: duration,
        speed: 1,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        effects: [],
        keyframes: {},
      };
      runCommand({
        do: () => set((state) => ({ tracks: insertClip(state.tracks, clip) })),
        undo: () => set((state) => ({ tracks: removeClipFromTracks(state.tracks, clip.id) })),
      });
      return true;
    },

    moveClip: (clipId, newTrackId, newStartTime) => {
      const found = findClip(get().tracks, clipId);
      const targetTrack = get().tracks.find((t) => t.id === newTrackId);
      if (!found || !targetTrack || found.track.locked || targetTrack.locked) return false;

      const clampedStart = Math.max(0, newStartTime);
      if (hasOverlap(targetTrack, clipId, clampedStart, found.clip.duration)) return false;

      const prevTrackId = found.clip.trackId;
      const prevStartTime = found.clip.startTime;
      if (prevTrackId === newTrackId && prevStartTime === clampedStart) return true;

      runCommand({
        do: () => set((state) => ({ tracks: relocateClip(state.tracks, clipId, newTrackId, clampedStart) })),
        undo: () => set((state) => ({ tracks: relocateClip(state.tracks, clipId, prevTrackId, prevStartTime) })),
      });
      return true;
    },

    trimClipStart: (clipId, newStartTime) => {
      const found = findClip(get().tracks, clipId);
      if (!found || found.track.locked) return false;
      const { clip, track } = found;
      const delta = newStartTime - clip.startTime;
      const nextDuration = clip.duration - delta;
      const nextSourceIn = clip.sourceIn + delta;
      if (nextDuration <= 0 || nextSourceIn < 0 || newStartTime < 0) return false;
      if (hasOverlap(track, clipId, newStartTime, nextDuration)) return false;

      const prev = { startTime: clip.startTime, duration: clip.duration, sourceIn: clip.sourceIn };
      const next = { startTime: newStartTime, duration: nextDuration, sourceIn: nextSourceIn };

      runCommand({
        do: () => set((state) => ({ tracks: replaceClip(state.tracks, clipId, (c) => ({ ...c, ...next })) })),
        undo: () => set((state) => ({ tracks: replaceClip(state.tracks, clipId, (c) => ({ ...c, ...prev })) })),
      });
      return true;
    },

    trimClipEnd: (clipId, newEndTime, maxSourceOut) => {
      const found = findClip(get().tracks, clipId);
      if (!found || found.track.locked) return false;
      const { clip, track } = found;
      const nextDuration = newEndTime - clip.startTime;
      const nextSourceOut = clip.sourceIn + nextDuration;
      if (nextDuration <= 0) return false;
      if (typeof maxSourceOut === 'number' && nextSourceOut > maxSourceOut) return false;
      if (hasOverlap(track, clipId, clip.startTime, nextDuration)) return false;

      const prev = { duration: clip.duration, sourceOut: clip.sourceOut };
      const next = { duration: nextDuration, sourceOut: nextSourceOut };

      runCommand({
        do: () => set((state) => ({ tracks: replaceClip(state.tracks, clipId, (c) => ({ ...c, ...next })) })),
        undo: () => set((state) => ({ tracks: replaceClip(state.tracks, clipId, (c) => ({ ...c, ...prev })) })),
      });
      return true;
    },

    splitClipAt: (clipId, atTime) => {
      const found = findClip(get().tracks, clipId);
      if (!found || found.track.locked) return false;
      const { clip } = found;
      if (atTime <= clip.startTime || atTime >= clip.startTime + clip.duration) return false;

      const splitOffset = atTime - clip.startTime;
      const newClip: Clip = {
        ...clip,
        id: crypto.randomUUID(),
        startTime: atTime,
        duration: clip.duration - splitOffset,
        sourceIn: clip.sourceIn + splitOffset,
      };
      const trimmedDuration = splitOffset;
      const trimmedSourceOut = clip.sourceIn + splitOffset;
      const originalDuration = clip.duration;
      const originalSourceOut = clip.sourceOut;

      runCommand({
        do: () =>
          set((state) => ({
            tracks: insertClip(
              replaceClip(state.tracks, clipId, (c) => ({
                ...c,
                duration: trimmedDuration,
                sourceOut: trimmedSourceOut,
              })),
              newClip,
            ),
          })),
        undo: () =>
          set((state) => ({
            tracks: replaceClip(removeClipFromTracks(state.tracks, newClip.id), clipId, (c) => ({
              ...c,
              duration: originalDuration,
              sourceOut: originalSourceOut,
            })),
          })),
      });
      return true;
    },

    removeClip: (clipId, mode) => {
      const found = findClip(get().tracks, clipId);
      if (!found || found.track.locked) return;
      const { clip, track } = found;

      if (mode === 'lift') {
        runCommand({
          do: () =>
            set((state) => ({
              tracks: removeClipFromTracks(state.tracks, clipId),
              selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
            })),
          undo: () => set((state) => ({ tracks: insertClip(state.tracks, clip) })),
        });
        return;
      }

      const clipEndTime = clip.startTime + clip.duration;
      const affected = track.clips.filter((c) => c.id !== clipId && c.startTime >= clipEndTime);
      const shiftAmount = clip.duration;

      runCommand({
        do: () =>
          set((state) => {
            let tracks = removeClipFromTracks(state.tracks, clipId);
            for (const affectedClip of affected) {
              tracks = replaceClip(tracks, affectedClip.id, (c) => ({
                ...c,
                startTime: c.startTime - shiftAmount,
              }));
            }
            return {
              tracks,
              selectedClipId: state.selectedClipId === clipId ? null : state.selectedClipId,
            };
          }),
        undo: () =>
          set((state) => {
            let tracks = state.tracks;
            for (const affectedClip of affected) {
              tracks = replaceClip(tracks, affectedClip.id, (c) => ({
                ...c,
                startTime: c.startTime + shiftAmount,
              }));
            }
            return { tracks: insertClip(tracks, clip) };
          }),
      });
    },

    toggleTrackMute: (trackId) => {
      const track = get().tracks.find((t) => t.id === trackId);
      if (!track) return;
      const prevMuted = track.muted;
      runCommand({
        do: () =>
          set((state) => ({
            tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, muted: !prevMuted } : t)),
          })),
        undo: () =>
          set((state) => ({
            tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, muted: prevMuted } : t)),
          })),
      });
    },

    toggleTrackLock: (trackId) => {
      const track = get().tracks.find((t) => t.id === trackId);
      if (!track) return;
      const prevLocked = track.locked;
      runCommand({
        do: () =>
          set((state) => ({
            tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, locked: !prevLocked } : t)),
          })),
        undo: () =>
          set((state) => ({
            tracks: state.tracks.map((t) => (t.id === trackId ? { ...t, locked: prevLocked } : t)),
          })),
      });
    },

    undo: () => {
      const { past } = get();
      if (past.length === 0) return;
      const command = past[past.length - 1];
      command.undo();
      set((state) => ({ past: state.past.slice(0, -1), future: [...state.future, command] }));
    },

    redo: () => {
      const { future } = get();
      if (future.length === 0) return;
      const command = future[future.length - 1];
      command.do();
      set((state) => ({ future: state.future.slice(0, -1), past: [...state.past, command] }));
    },

    canUndo: () => get().past.length > 0,
    canRedo: () => get().future.length > 0,
  };
});
