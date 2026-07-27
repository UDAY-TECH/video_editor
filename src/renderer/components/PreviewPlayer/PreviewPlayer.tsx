import { useEffect, useRef, useState } from 'react';
import { useTimelineStore } from '../../state/timelineStore';
import { useMediaBinStore } from '../../state/mediaBinStore';
import { useProjectStore } from '../../state/projectStore';
import { toMediaUrl } from '@shared/mediaUrl';
import { computeCompositeFrame, type CompositorLayer } from '../../engine/compositor';
import { getTimelineEnd } from '../../engine/timelineMath';
import { computeEffectiveGain } from '../../engine/audioMix';
import type { MediaAsset } from '@shared/types';

const TEXT_ANIM_DURATION = 0.5;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Renders the timeline's composite at the playhead onto a canvas: each active
// clip (per video track, bottom to top) is sourced from a pooled <video> or
// <img> element, transformed (position/scale/rotation/opacity, resolved
// through any keyframes), and blended for basic fade/dissolve/wipe
// transitions. Known simplification: both scrubbing and playback always seek
// pooled video elements to the exact frame rather than letting them play
// natively, which is simpler to keep in sync with the timeline but can be
// choppier than native playback for heavily compressed footage - a candidate
// for the Phase 10 performance/proxy pass.
//
// Audio (Phase 7) only plays for clips on AUDIO tracks, via a separate pool
// of real <audio> elements that play natively (not seek-per-frame) during
// playback, with gain recomputed every tick from the clip's own (possibly
// keyframed) volume, track mute/solo, and rule-based ducking. Audio is
// silent during scrubbing/pause, matching most editors. Known scope cut:
// a video clip's own embedded audio track is not extracted/played here -
// the video pool above is muted and permanently seek-driven (necessary for
// frame-accurate visual scrubbing), which is fundamentally incompatible with
// continuous audio playback, so video-with-audio stays silent in preview
// for now.
export function PreviewPlayer(): JSX.Element {
  const tracks = useTimelineStore((s) => s.tracks);
  const playheadTime = useTimelineStore((s) => s.playheadTime);
  const setPlayhead = useTimelineStore((s) => s.setPlayhead);
  const assets = useMediaBinStore((s) => s.assets);
  const settings = useProjectStore((s) => s.settings);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const tracksRef = useRef(tracks);
  tracksRef.current = tracks;
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const playheadRef = useRef(playheadTime);
  playheadRef.current = playheadTime;
  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const videoPoolRef = useRef<Map<string, HTMLVideoElement>>(new Map());
  const videoSrcRef = useRef<Map<string, string>>(new Map());
  const imagePoolRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const imageSrcRef = useRef<Map<string, string>>(new Map());
  const audioPoolRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const audioSrcRef = useRef<Map<string, string>>(new Map());
  const activeAudioClipRef = useRef<Map<string, string | null>>(new Map());

  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number | null>(null);

  function scheduleRedraw(): void {
    draw(playheadRef.current);
  }

  function getPooledVideo(clipId: string, src: string): HTMLVideoElement {
    let el = videoPoolRef.current.get(clipId);
    if (!el) {
      el = document.createElement('video');
      el.muted = true;
      el.preload = 'auto';
      el.addEventListener('seeked', scheduleRedraw);
      el.addEventListener('loadeddata', scheduleRedraw);
      videoPoolRef.current.set(clipId, el);
    }
    if (videoSrcRef.current.get(clipId) !== src) {
      el.src = src;
      videoSrcRef.current.set(clipId, src);
    }
    return el;
  }

  function getPooledImage(clipId: string, src: string): HTMLImageElement {
    let el = imagePoolRef.current.get(clipId);
    if (!el) {
      el = new Image();
      el.addEventListener('load', scheduleRedraw);
      imagePoolRef.current.set(clipId, el);
    }
    if (imageSrcRef.current.get(clipId) !== src) {
      el.src = src;
      imageSrcRef.current.set(clipId, src);
    }
    return el;
  }

  // If `clipId` is still the active clip for its track by the time this
  // fires, retries the seek using the current playhead - covers the case
  // where the initial seek in syncAudio threw because the element wasn't
  // ready yet (readyState HAVE_NOTHING), which would otherwise leave it
  // silently playing from position 0 instead of the correct offset.
  function resyncAudioClip(clipId: string): void {
    for (const track of tracksRef.current) {
      if (track.type !== 'audio') continue;
      if (activeAudioClipRef.current.get(track.id) !== clipId) continue;
      const clip = track.clips.find((c) => c.id === clipId);
      const el = audioPoolRef.current.get(clipId);
      if (!clip || !el) continue;
      const localTime = playheadRef.current - clip.startTime;
      try {
        el.currentTime = clip.sourceIn + localTime * clip.speed;
      } catch {
        // Still not ready.
      }
      if (isPlayingRef.current) void el.play().catch(() => {});
    }
  }

  function getPooledAudio(clipId: string, src: string): HTMLAudioElement {
    let el = audioPoolRef.current.get(clipId);
    if (!el) {
      el = new Audio();
      el.addEventListener('loadedmetadata', () => resyncAudioClip(clipId));
      audioPoolRef.current.set(clipId, el);
    }
    if (audioSrcRef.current.get(clipId) !== src) {
      el.src = src;
      audioSrcRef.current.set(clipId, src);
    }
    return el;
  }

  function pauseAllAudio(): void {
    for (const el of audioPoolRef.current.values()) el.pause();
    activeAudioClipRef.current.clear();
  }

  // Called every rAF tick during playback only (never while scrubbing/paused,
  // matching most editors). For each audio track, detects when the active
  // clip changes (pausing the outgoing one and seeking+playing the incoming
  // one natively), and continuously updates the playing element's volume
  // from the clip's own keyframed volume, track mute/solo, and ducking.
  function syncAudio(time: number): void {
    const audioTracks = tracksRef.current.filter((t) => t.type === 'audio');
    for (const track of audioTracks) {
      const activeClip =
        track.clips.find((c) => time >= c.startTime && time < c.startTime + c.duration) ?? null;
      const prevClipId = activeAudioClipRef.current.get(track.id) ?? null;

      if ((activeClip?.id ?? null) !== prevClipId) {
        if (prevClipId) audioPoolRef.current.get(prevClipId)?.pause();
        if (activeClip) {
          const asset = findAsset(activeClip.mediaAssetId ?? '');
          if (asset) {
            const el = getPooledAudio(activeClip.id, toMediaUrl(asset.filePath));
            const localTime = time - activeClip.startTime;
            el.playbackRate = activeClip.speed;
            try {
              el.currentTime = activeClip.sourceIn + localTime * activeClip.speed;
            } catch {
              // Not ready to seek yet - 'loadedmetadata' triggers a retry.
            }
            void el.play().catch(() => {});
          }
        }
        activeAudioClipRef.current.set(track.id, activeClip?.id ?? null);
      }

      if (activeClip) {
        const el = audioPoolRef.current.get(activeClip.id);
        if (el) {
          const localTime = time - activeClip.startTime;
          el.volume = computeEffectiveGain(activeClip, localTime, track, tracksRef.current, time);
        }
      }
    }
  }

  // Prunes pooled elements for clips no longer present anywhere in the
  // timeline (deleted, or replaced via undo/redo), so the pool tracks the
  // current project rather than growing with every clip.id that ever existed
  // in the edit history.
  function pruneStalePoolEntries(currentClipIds: Set<string>): void {
    for (const clipId of [...videoPoolRef.current.keys()]) {
      if (currentClipIds.has(clipId)) continue;
      const el = videoPoolRef.current.get(clipId);
      el?.removeEventListener('seeked', scheduleRedraw);
      el?.removeEventListener('loadeddata', scheduleRedraw);
      el?.pause();
      el?.removeAttribute('src');
      el?.load();
      videoPoolRef.current.delete(clipId);
      videoSrcRef.current.delete(clipId);
    }
    for (const clipId of [...imagePoolRef.current.keys()]) {
      if (currentClipIds.has(clipId)) continue;
      imagePoolRef.current.get(clipId)?.removeEventListener('load', scheduleRedraw);
      imagePoolRef.current.delete(clipId);
      imageSrcRef.current.delete(clipId);
    }
    for (const clipId of [...audioPoolRef.current.keys()]) {
      if (currentClipIds.has(clipId)) continue;
      const el = audioPoolRef.current.get(clipId);
      el?.pause();
      el?.removeAttribute('src');
      el?.load();
      audioPoolRef.current.delete(clipId);
      audioSrcRef.current.delete(clipId);
      for (const [trackId, activeId] of [...activeAudioClipRef.current.entries()]) {
        if (activeId === clipId) activeAudioClipRef.current.delete(trackId);
      }
    }
  }

  function getNaturalSize(mediaEl: HTMLVideoElement | HTMLImageElement): { width: number; height: number } | null {
    if (mediaEl instanceof HTMLVideoElement) {
      if (!mediaEl.videoWidth || !mediaEl.videoHeight) return null;
      return { width: mediaEl.videoWidth, height: mediaEl.videoHeight };
    }
    if (!mediaEl.naturalWidth || !mediaEl.naturalHeight) return null;
    return { width: mediaEl.naturalWidth, height: mediaEl.naturalHeight };
  }

  // Shared setup for every layer: wipe clip-path, combined alpha (transition
  // alpha * the clip's own opacity * any extra caller-supplied alpha, e.g.
  // a text entrance/exit fade), and the position/rotation/scale transform
  // centered on the frame. Callers draw their content after this and must
  // call ctx.restore() themselves to balance the ctx.save() here.
  function applyLayerTransform(
    ctx: CanvasRenderingContext2D,
    layer: CompositorLayer,
    width: number,
    height: number,
    extraAlpha: number,
    extraOffsetX: number,
  ): void {
    ctx.save();
    if (layer.wipe) {
      ctx.beginPath();
      const revealWidth = width * layer.wipe.t;
      if (layer.wipe.revealingFromLeft) ctx.rect(0, 0, revealWidth, height);
      else ctx.rect(revealWidth, 0, width - revealWidth, height);
      ctx.clip();
    }
    ctx.globalAlpha = layer.alpha * layer.transform.opacity * extraAlpha;

    const cx = width / 2 + layer.transform.x + extraOffsetX;
    const cy = height / 2 + layer.transform.y;
    ctx.translate(cx, cy);
    ctx.rotate((layer.transform.rotation * Math.PI) / 180);
    ctx.scale(layer.transform.scale, layer.transform.scale);
  }

  function drawLayer(
    ctx: CanvasRenderingContext2D,
    mediaEl: HTMLVideoElement | HTMLImageElement,
    layer: CompositorLayer,
    width: number,
    height: number,
  ): void {
    // Fit (not stretch) the source into the frame, preserving its own aspect
    // ratio - falls back to filling the frame if natural size isn't known yet.
    const natural = getNaturalSize(mediaEl);
    const fitScale = natural ? Math.min(width / natural.width, height / natural.height) : 1;
    const drawWidth = natural ? natural.width * fitScale : width;
    const drawHeight = natural ? natural.height * fitScale : height;

    applyLayerTransform(ctx, layer, width, height, 1, 0);
    ctx.drawImage(mediaEl, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  }

  function drawTextLayer(
    ctx: CanvasRenderingContext2D,
    layer: CompositorLayer,
    width: number,
    height: number,
  ): void {
    const text = layer.clip.text;
    if (!text) return;

    // Cap each animation window to at most half the clip's duration so
    // entrance and exit never overlap on a very short clip (which would
    // otherwise compound alpha/offset from both at once).
    const effectiveAnimDuration =
      layer.clip.duration > 0 ? Math.min(TEXT_ANIM_DURATION, layer.clip.duration / 2) : 0;
    const remaining = layer.clip.duration - layer.localTime;

    let animAlpha = 1;
    let slideOffsetX = 0;
    if (effectiveAnimDuration > 0) {
      if (text.entranceAnimation === 'fade' && layer.localTime < effectiveAnimDuration) {
        animAlpha = Math.min(animAlpha, layer.localTime / effectiveAnimDuration);
      } else if (text.exitAnimation === 'fade' && remaining < effectiveAnimDuration) {
        animAlpha = Math.min(animAlpha, Math.max(0, remaining / effectiveAnimDuration));
      }

      if (text.entranceAnimation === 'slide' && layer.localTime < effectiveAnimDuration) {
        slideOffsetX = (1 - layer.localTime / effectiveAnimDuration) * -width * 0.3;
      } else if (text.exitAnimation === 'slide' && remaining < effectiveAnimDuration) {
        slideOffsetX = (1 - remaining / effectiveAnimDuration) * width * 0.3;
      }
    }

    applyLayerTransform(ctx, layer, width, height, animAlpha, slideOffsetX);
    ctx.font = `${text.fontSize}px ${text.fontFamily}`;
    ctx.fillStyle = text.color;
    ctx.textAlign = text.align;
    ctx.textBaseline = 'middle';
    ctx.fillText(text.content, 0, 0);
    ctx.restore();
  }

  function findAsset(assetId: string): MediaAsset | undefined {
    return assetsRef.current.find((a) => a.id === assetId);
  }

  function draw(time: number): void {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = settingsRef.current.resolution;
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);

    const layers = computeCompositeFrame(tracksRef.current, time);
    for (const layer of layers) {
      if (layer.clip.text) {
        drawTextLayer(ctx, layer, width, height);
        continue;
      }
      if (!layer.clip.mediaAssetId) continue;
      const asset = findAsset(layer.clip.mediaAssetId);
      if (!asset) continue;

      if (asset.type === 'image') {
        const img = getPooledImage(layer.clip.id, toMediaUrl(asset.filePath));
        if (!img.complete || img.naturalWidth === 0) continue;
        drawLayer(ctx, img, layer, width, height);
      } else {
        const video = getPooledVideo(layer.clip.id, toMediaUrl(asset.filePath));
        try {
          video.currentTime = layer.sourceTime;
        } catch {
          // Not ready to seek yet - 'loadeddata' will trigger a redraw.
        }
        if (video.readyState < 2) continue;
        drawLayer(ctx, video, layer, width, height);
      }
    }
  }

  useEffect(() => {
    const currentClipIds = new Set(tracks.flatMap((t) => t.clips.map((c) => c.id)));
    pruneStalePoolEntries(currentClipIds);
    draw(playheadTime);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playheadTime, tracks, assets, settings]);

  useEffect(() => {
    if (!isPlaying) {
      pauseAllAudio();
      return;
    }

    function tick(now: number): void {
      if (!isPlayingRef.current) return;
      const last = lastTickRef.current;
      lastTickRef.current = now;
      if (last !== null) {
        const delta = (now - last) / 1000;
        const end = getTimelineEnd(tracksRef.current);
        const next = playheadRef.current + delta;
        if (next >= end) {
          setPlayhead(end);
          setIsPlaying(false);
          pauseAllAudio();
          return;
        }
        setPlayhead(next);
        syncAudio(next);
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    lastTickRef.current = null;
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, setPlayhead]);

  const contentEnd = getTimelineEnd(tracks);
  const fps = settings.fps > 0 ? settings.fps : 30;
  const frameStep = 1 / fps;

  function togglePlay(): void {
    setIsPlaying((prev) => !prev);
  }

  function seekTo(time: number): void {
    setIsPlaying(false);
    setPlayhead(Math.max(0, Math.min(time, contentEnd)));
  }

  function stepFrame(direction: 1 | -1): void {
    seekTo(playheadTime + direction * frameStep);
  }

  return (
    <div className="flex h-full flex-col bg-black">
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        <canvas ref={canvasRef} className="max-h-full max-w-full" />
      </div>

      <div className="h-12 border-t border-neutral-800 flex items-center px-3 text-xs text-neutral-400 gap-2 shrink-0">
        <button className="px-2 py-1 rounded hover:bg-neutral-800" onClick={() => stepFrame(-1)}>
          ⏮
        </button>
        <button className="px-2 py-1 rounded hover:bg-neutral-800" onClick={togglePlay}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button className="px-2 py-1 rounded hover:bg-neutral-800" onClick={() => stepFrame(1)}>
          ⏭
        </button>
        <span className="tabular-nums">{formatTime(playheadTime)}</span>
        <input
          type="range"
          className="flex-1"
          min={0}
          max={contentEnd || 0}
          step={0.01}
          value={playheadTime}
          onChange={(e) => seekTo(parseFloat(e.target.value))}
        />
        <span className="tabular-nums">{formatTime(contentEnd)}</span>
      </div>
    </div>
  );
}
