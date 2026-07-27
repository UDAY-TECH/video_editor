import type { Clip, Track, Transform, Transition } from '@shared/types';
import { resolveTransformAtTime } from './keyframes';
import { sortedClips } from './timelineMath';

export interface CompositorLayer {
  clip: Clip;
  track: Track;
  // Time relative to this clip's own start used to render this layer (equal
  // to the live playhead-relative time for the active clip, but frozen at a
  // clip's boundary - 0 or its duration - for the static partner during a
  // transition). Used both to derive sourceTime below and, for text clips
  // (which have no source media to seek), directly for animation timing.
  localTime: number;
  sourceTime: number;
  transform: Transform;
  alpha: number;
  // Present only for 'wipe' transitions - drawing code should clip to a
  // growing/shrinking rect instead of using `alpha` for these layers.
  wipe?: { revealingFromLeft: boolean; t: number };
}

const EPSILON = 1e-6;

function clipSourceTime(clip: Clip, localTime: number): number {
  return clip.sourceIn + localTime * clip.speed;
}

function isContiguous(earlier: Clip, later: Clip): boolean {
  return Math.abs(later.startTime - (earlier.startTime + earlier.duration)) < EPSILON;
}

function buildLayer(
  clip: Clip,
  track: Track,
  localTime: number,
  alpha: number,
  wipe?: CompositorLayer['wipe'],
): CompositorLayer {
  return {
    clip,
    track,
    localTime,
    sourceTime: clipSourceTime(clip, localTime),
    transform: resolveTransformAtTime(clip.transform, clip.keyframes, localTime),
    alpha,
    wipe,
  };
}

function buildTransitionLayers(
  outgoing: Clip,
  outgoingLocalTime: number,
  incoming: Clip,
  incomingLocalTime: number,
  track: Track,
  t: number,
  type: Transition['type'],
): CompositorLayer[] {
  const clampedT = Math.max(0, Math.min(1, t));
  if (type === 'wipe') {
    return [
      buildLayer(outgoing, track, outgoingLocalTime, 1, { revealingFromLeft: false, t: clampedT }),
      buildLayer(incoming, track, incomingLocalTime, 1, { revealingFromLeft: true, t: clampedT }),
    ];
  }
  // 'fade' and 'dissolve' are both rendered as a basic alpha crossfade in the
  // live preview; a more precise per-type treatment belongs to the export
  // filter graph (Section 5.9), not this approximation.
  return [
    buildLayer(outgoing, track, outgoingLocalTime, 1 - clampedT),
    buildLayer(incoming, track, incomingLocalTime, clampedT),
  ];
}

// Basic transition model for preview purposes: the transition plays out
// entirely within the *incoming* clip's own timeline span (transitionIn) or
// the *outgoing* clip's own span (transitionOut) - it never borrows extra
// footage beyond a clip's trim points. The static partner clip is shown
// frozen on its boundary frame (its last frame for an outgoing partner, its
// first frame for an incoming partner) rather than continuing to advance.
export function computeTrackFrame(track: Track, playheadTime: number): CompositorLayer[] {
  const clips = sortedClips(track);
  let currentIndex = clips.findIndex(
    (c) => playheadTime >= c.startTime && playheadTime < c.startTime + c.duration,
  );
  if (currentIndex === -1) {
    // Playhead sits exactly on (or a hair past, via float drift) the end of a
    // clip with nothing picking up right after - most commonly the very end
    // of the last clip on the track. Show that clip's final frame instead of
    // rendering nothing.
    currentIndex = clips.findIndex((c) => Math.abs(playheadTime - (c.startTime + c.duration)) < EPSILON);
  }
  if (currentIndex === -1) return [];

  const current = clips[currentIndex];
  const localTime = Math.min(playheadTime - current.startTime, current.duration);

  const next = clips[currentIndex + 1];
  if (current.transitionOut && next && isContiguous(current, next)) {
    const windowStart = current.duration - current.transitionOut.duration;
    if (localTime >= windowStart) {
      const t =
        current.transitionOut.duration <= 0 ? 1 : (localTime - windowStart) / current.transitionOut.duration;
      return buildTransitionLayers(current, localTime, next, 0, track, t, current.transitionOut.type);
    }
  }

  const prev = clips[currentIndex - 1];
  if (current.transitionIn && prev && isContiguous(prev, current) && localTime <= current.transitionIn.duration) {
    const t = current.transitionIn.duration <= 0 ? 1 : localTime / current.transitionIn.duration;
    return buildTransitionLayers(prev, prev.duration, current, localTime, track, t, current.transitionIn.type);
  }

  return [buildLayer(current, track, localTime, 1)];
}

export function computeCompositeFrame(tracks: Track[], playheadTime: number): CompositorLayer[] {
  const videoTracks = tracks.filter((t) => t.type === 'video').sort((a, b) => a.index - b.index);
  return videoTracks.flatMap((track) => computeTrackFrame(track, playheadTime));
}
