import { useEffect, useRef, useState } from 'react';
import { useTimelineStore, findClip } from '../../state/timelineStore';
import { useMediaBinStore } from '../../state/mediaBinStore';
import { pxToTime, timeToPx, collectSnapPoints, snapTime, getTimelineEnd } from '../../engine/timelineMath';
import { ClipBlock } from './ClipBlock';
import type { Clip } from '@shared/types';

const RULER_HEIGHT = 24;
const LANE_HEIGHT = 64;
const HEADER_WIDTH = 176;
const MIN_CONTENT_SECONDS = 120;
const CONTENT_PADDING_SECONDS = 30;
const SNAP_PX_THRESHOLD = 10;
const MIN_CLIP_DURATION = 0.1;

type DragState =
  | {
      type: 'move';
      clipId: string;
      startClientX: number;
      originStartTime: number;
      trackId: string;
      previewStartTime: number;
      snapPoints: number[];
    }
  | {
      type: 'trimStart';
      clipId: string;
      startClientX: number;
      originStartTime: number;
      originDuration: number;
      previewStartTime: number;
      previewDuration: number;
      snapPoints: number[];
    }
  | {
      type: 'trimEnd';
      clipId: string;
      startClientX: number;
      originStartTime: number;
      originDuration: number;
      originSourceIn: number;
      maxSourceOut: number;
      previewDuration: number;
      snapPoints: number[];
    }
  | { type: 'playhead' };

function previewFor(
  clip: Clip,
  dragState: DragState | null,
): { startTime?: number; duration?: number } {
  if (!dragState || !('clipId' in dragState) || dragState.clipId !== clip.id) return {};
  if (dragState.type === 'move') return { startTime: dragState.previewStartTime };
  if (dragState.type === 'trimStart') {
    return { startTime: dragState.previewStartTime, duration: dragState.previewDuration };
  }
  if (dragState.type === 'trimEnd') return { duration: dragState.previewDuration };
  return {};
}

export function Timeline(): JSX.Element {
  const tracks = useTimelineStore((s) => s.tracks);
  const selectedClipId = useTimelineStore((s) => s.selectedClipId);
  const zoom = useTimelineStore((s) => s.zoom);
  const snappingEnabled = useTimelineStore((s) => s.snappingEnabled);
  const playheadTime = useTimelineStore((s) => s.playheadTime);
  const selectClip = useTimelineStore((s) => s.selectClip);
  const setPlayhead = useTimelineStore((s) => s.setPlayhead);
  const setZoom = useTimelineStore((s) => s.setZoom);
  const toggleSnapping = useTimelineStore((s) => s.toggleSnapping);
  const addTrack = useTimelineStore((s) => s.addTrack);
  const addClip = useTimelineStore((s) => s.addClip);
  const addTextClip = useTimelineStore((s) => s.addTextClip);
  const moveClip = useTimelineStore((s) => s.moveClip);
  const trimClipStart = useTimelineStore((s) => s.trimClipStart);
  const trimClipEnd = useTimelineStore((s) => s.trimClipEnd);
  const splitClipAt = useTimelineStore((s) => s.splitClipAt);
  const removeClip = useTimelineStore((s) => s.removeClip);
  const toggleTrackMute = useTimelineStore((s) => s.toggleTrackMute);
  const toggleTrackSolo = useTimelineStore((s) => s.toggleTrackSolo);
  const toggleTrackLock = useTimelineStore((s) => s.toggleTrackLock);
  const setDuckingRule = useTimelineStore((s) => s.setDuckingRule);
  const undo = useTimelineStore((s) => s.undo);
  const redo = useTimelineStore((s) => s.redo);
  const canUndo = useTimelineStore((s) => s.canUndo());
  const canRedo = useTimelineStore((s) => s.canRedo());

  const assets = useMediaBinStore((s) => s.assets);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  dragStateRef.current = dragState;

  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const snappingRef = useRef(snappingEnabled);
  snappingRef.current = snappingEnabled;
  const playheadRef = useRef(playheadTime);
  playheadRef.current = playheadTime;
  const selectedClipIdRef = useRef(selectedClipId);
  selectedClipIdRef.current = selectedClipId;

  function labelForClip(clip: Clip): string {
    if (clip.text) return clip.text.content || 'Text';
    const asset = assets.find((a) => a.id === clip.mediaAssetId);
    return asset ? (asset.filePath.split(/[\\/]/).pop() ?? 'Clip') : 'Clip';
  }

  function clientXToTime(clientX: number): number {
    const el = scrollRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const px = clientX - rect.left + el.scrollLeft;
    return Math.max(0, pxToTime(px, zoomRef.current));
  }

  const selectedTrackLocked = selectedClipId
    ? (findClip(tracks, selectedClipId)?.track.locked ?? false)
    : false;

  function handleMoveStart(clipId: string, clientX: number): void {
    const found = findClip(tracks, clipId);
    if (!found) return;
    setDragState({
      type: 'move',
      clipId,
      startClientX: clientX,
      originStartTime: found.clip.startTime,
      trackId: found.clip.trackId,
      previewStartTime: found.clip.startTime,
      snapPoints: collectSnapPoints(tracks, clipId, playheadTime),
    });
  }

  function handleTrimStartEdgeStart(clipId: string, clientX: number): void {
    const found = findClip(tracks, clipId);
    if (!found) return;
    setDragState({
      type: 'trimStart',
      clipId,
      startClientX: clientX,
      originStartTime: found.clip.startTime,
      originDuration: found.clip.duration,
      previewStartTime: found.clip.startTime,
      previewDuration: found.clip.duration,
      snapPoints: collectSnapPoints(tracks, clipId, playheadTime),
    });
  }

  function handleTrimEndEdgeStart(clipId: string, clientX: number): void {
    const found = findClip(tracks, clipId);
    if (!found) return;
    const asset = assets.find((a) => a.id === found.clip.mediaAssetId);
    const maxSourceOut = asset && asset.type !== 'image' && asset.duration > 0 ? asset.duration : Infinity;
    setDragState({
      type: 'trimEnd',
      clipId,
      startClientX: clientX,
      originStartTime: found.clip.startTime,
      originDuration: found.clip.duration,
      originSourceIn: found.clip.sourceIn,
      maxSourceOut,
      previewDuration: found.clip.duration,
      snapPoints: collectSnapPoints(tracks, clipId, playheadTime),
    });
  }

  useEffect(() => {
    if (!dragState) return;

    function handleMouseMove(e: MouseEvent): void {
      const current = dragStateRef.current;
      if (!current) return;
      const zoom = zoomRef.current;
      const snapThreshold = pxToTime(SNAP_PX_THRESHOLD, zoom);
      const snappingEnabled = snappingRef.current;

      if (current.type === 'move') {
        const delta = pxToTime(e.clientX - current.startClientX, zoom);
        let candidate = Math.max(0, current.originStartTime + delta);
        if (snappingEnabled) {
          candidate = snapTime(candidate, current.snapPoints, snapThreshold);
        }
        setDragState({ ...current, previewStartTime: Math.max(0, candidate) });
      } else if (current.type === 'trimStart') {
        const delta = pxToTime(e.clientX - current.startClientX, zoom);
        const maxStart = current.originStartTime + current.originDuration - MIN_CLIP_DURATION;
        let candidate = current.originStartTime + delta;
        if (snappingEnabled) {
          candidate = snapTime(candidate, current.snapPoints, snapThreshold);
        }
        candidate = Math.max(0, Math.min(candidate, maxStart));
        const previewDuration = current.originStartTime + current.originDuration - candidate;
        setDragState({ ...current, previewStartTime: candidate, previewDuration });
      } else if (current.type === 'trimEnd') {
        const delta = pxToTime(e.clientX - current.startClientX, zoom);
        const minEnd = current.originStartTime + MIN_CLIP_DURATION;
        const maxEnd = current.originStartTime + (current.maxSourceOut - current.originSourceIn);
        let candidateEnd = current.originStartTime + current.originDuration + delta;
        if (snappingEnabled) {
          candidateEnd = snapTime(candidateEnd, current.snapPoints, snapThreshold);
        }
        candidateEnd = Math.max(minEnd, Math.min(candidateEnd, maxEnd));
        setDragState({ ...current, previewDuration: candidateEnd - current.originStartTime });
      } else if (current.type === 'playhead') {
        setPlayhead(clientXToTime(e.clientX));
      }
    }

    function handleMouseUp(): void {
      const current = dragStateRef.current;
      if (current) {
        if (current.type === 'move') {
          moveClip(current.clipId, current.trackId, current.previewStartTime);
        } else if (current.type === 'trimStart') {
          trimClipStart(current.clipId, current.previewStartTime);
        } else if (current.type === 'trimEnd') {
          trimClipEnd(
            current.clipId,
            current.originStartTime + current.previewDuration,
            current.maxSourceOut,
          );
        }
      }
      setDragState(null);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    // Intentionally only re-run when a drag starts/ends; live values are read
    // via refs above so the listeners always see fresh state without needing
    // to be torn down and reattached on every mousemove-driven update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragState !== null]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
        return;
      }
      const selectedClipId = selectedClipIdRef.current;
      if (!selectedClipId) return;
      if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        splitClipAt(selectedClipId, playheadRef.current);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeClip(selectedClipId, e.shiftKey ? 'ripple' : 'lift');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, splitClipAt, removeClip]);

  const contentSeconds = Math.max(MIN_CONTENT_SECONDS, getTimelineEnd(tracks) + CONTENT_PADDING_SECONDS);
  const contentWidth = timeToPx(contentSeconds, zoom);

  const actionsDisabled = !selectedClipId || selectedTrackLocked;

  return (
    <div className="flex h-full flex-col bg-neutral-900 border-t border-neutral-800">
      <div className="px-3 py-1.5 flex items-center gap-2 border-b border-neutral-800 text-xs text-neutral-300 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400 mr-2">
          Timeline
        </span>
        <button
          className="px-2 py-0.5 rounded hover:bg-neutral-800 disabled:opacity-40"
          onClick={undo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          Undo
        </button>
        <button
          className="px-2 py-0.5 rounded hover:bg-neutral-800 disabled:opacity-40"
          onClick={redo}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
        >
          Redo
        </button>
        <button
          className="px-2 py-0.5 rounded hover:bg-neutral-800 disabled:opacity-40"
          onClick={() => selectedClipId && splitClipAt(selectedClipId, playheadTime)}
          disabled={actionsDisabled}
          title={selectedTrackLocked ? 'Track is locked' : 'Split at playhead (S)'}
        >
          Split
        </button>
        <button
          className="px-2 py-0.5 rounded hover:bg-neutral-800 disabled:opacity-40"
          onClick={() => selectedClipId && removeClip(selectedClipId, 'lift')}
          disabled={actionsDisabled}
          title={selectedTrackLocked ? 'Track is locked' : 'Delete, leaves a gap (Delete)'}
        >
          Delete
        </button>
        <button
          className="px-2 py-0.5 rounded hover:bg-neutral-800 disabled:opacity-40"
          onClick={() => selectedClipId && removeClip(selectedClipId, 'ripple')}
          disabled={actionsDisabled}
          title={selectedTrackLocked ? 'Track is locked' : 'Ripple delete, closes the gap (Shift+Delete)'}
        >
          Ripple Delete
        </button>
        <button
          className={`px-2 py-0.5 rounded ${snappingEnabled ? 'bg-neutral-700' : 'hover:bg-neutral-800'}`}
          onClick={toggleSnapping}
          title="Toggle snapping"
        >
          Snap
        </button>
        <button className="px-2 py-0.5 rounded hover:bg-neutral-800" onClick={() => addTrack('video')}>
          +Video
        </button>
        <button className="px-2 py-0.5 rounded hover:bg-neutral-800" onClick={() => addTrack('audio')}>
          +Audio
        </button>
        <button
          className="px-2 py-0.5 rounded hover:bg-neutral-800"
          title="Add a text clip at the playhead, on the topmost video track"
          onClick={() => {
            // Highest `index` renders last / on top in the compositor
            // (see computeCompositeFrame's sort) - match that here rather
            // than relying on array position, which isn't guaranteed to
            // agree with index for a loaded/hand-edited project file.
            const topTrack = tracks
              .filter((t) => t.type === 'video')
              .sort((a, b) => b.index - a.index)[0];
            if (topTrack) addTextClip(topTrack.id, playheadTime);
          }}
        >
          +Text
        </button>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-neutral-500">Zoom</span>
          <input
            type="range"
            min={5}
            max={200}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
          />
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="shrink-0 flex flex-col" style={{ width: HEADER_WIDTH }}>
          <div
            style={{ height: RULER_HEIGHT }}
            className="border-b border-r border-neutral-800 bg-neutral-900"
          />
          {tracks.map((track) => {
            const otherAudioTracks = tracks.filter((t) => t.type === 'audio' && t.id !== track.id);
            return (
              <div
                key={track.id}
                className="flex flex-col justify-center gap-1 px-2 border-b border-r border-neutral-800 bg-neutral-900 text-[11px] text-neutral-400"
                style={{ height: LANE_HEIGHT }}
              >
                <div className="flex items-center gap-1">
                  <span className="uppercase font-medium">
                    {track.type} {track.index + 1}
                  </span>
                  <button
                    className={`ml-auto px-1 rounded ${
                      track.muted ? 'bg-red-800 text-red-100' : 'hover:bg-neutral-800'
                    }`}
                    onClick={() => toggleTrackMute(track.id)}
                    title="Mute"
                  >
                    M
                  </button>
                  <button
                    className={`px-1 rounded ${
                      track.solo ? 'bg-green-800 text-green-100' : 'hover:bg-neutral-800'
                    }`}
                    onClick={() => toggleTrackSolo(track.id)}
                    title="Solo"
                  >
                    S
                  </button>
                  <button
                    className={`px-1 rounded ${
                      track.locked ? 'bg-yellow-800 text-yellow-100' : 'hover:bg-neutral-800'
                    }`}
                    onClick={() => toggleTrackLock(track.id)}
                    title="Lock"
                  >
                    L
                  </button>
                </div>
                {track.type === 'audio' && (
                  <div className="flex items-center gap-1 text-[9px]">
                    <select
                      className="flex-1 min-w-0 bg-neutral-800 rounded px-0.5 py-0.5"
                      value={track.duckingTriggerTrackId ?? ''}
                      title="Duck this track's gain when the selected track has audio"
                      onChange={(e) => {
                        const triggerId = e.target.value || null;
                        setDuckingRule(track.id, triggerId, track.duckingReductionDb ?? 12);
                      }}
                    >
                      <option value="">Duck: none</option>
                      {otherAudioTracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          Duck: audio {t.index + 1}
                        </option>
                      ))}
                    </select>
                    {track.duckingTriggerTrackId && (
                      <input
                        type="number"
                        className="w-10 bg-neutral-800 rounded px-0.5 py-0.5 text-right"
                        value={track.duckingReductionDb ?? 12}
                        min={0}
                        title="Reduction in dB while triggered"
                        onChange={(e) => {
                          const db = parseFloat(e.target.value);
                          if (Number.isFinite(db)) {
                            setDuckingRule(track.id, track.duckingTriggerTrackId ?? null, db);
                          }
                        }}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-auto relative">
          <div style={{ width: contentWidth }}>
            <div
              style={{ height: RULER_HEIGHT, width: contentWidth }}
              className="relative border-b border-neutral-800 bg-neutral-900 cursor-pointer"
              onMouseDown={(e) => {
                setPlayhead(clientXToTime(e.clientX));
                setDragState({ type: 'playhead' });
              }}
            />

            {tracks.map((track) => (
              <div
                key={track.id}
                className="relative border-b border-neutral-800 bg-neutral-950"
                style={{ height: LANE_HEIGHT, width: contentWidth }}
                onClick={(e) => {
                  if (e.target === e.currentTarget) selectClip(null);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const assetId = e.dataTransfer.getData('application/x-media-asset-id');
                  if (!assetId) return;
                  const asset = assets.find((a) => a.id === assetId);
                  if (!asset) return;
                  addClip(track.id, asset, clientXToTime(e.clientX));
                }}
              >
                {track.clips.map((clip) => {
                  const preview = previewFor(clip, dragState);
                  return (
                    <ClipBlock
                      key={clip.id}
                      clip={clip}
                      label={labelForClip(clip)}
                      zoom={zoom}
                      selected={clip.id === selectedClipId}
                      asset={assets.find((a) => a.id === clip.mediaAssetId)}
                      previewStartTime={preview.startTime}
                      previewDuration={preview.duration}
                      onSelect={() => selectClip(clip.id)}
                      onMoveStart={handleMoveStart}
                      onTrimStartEdgeStart={handleTrimStartEdgeStart}
                      onTrimEndEdgeStart={handleTrimEndEdgeStart}
                    />
                  );
                })}
              </div>
            ))}

            <div
              className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none z-10"
              style={{ left: timeToPx(playheadTime, zoom) }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
