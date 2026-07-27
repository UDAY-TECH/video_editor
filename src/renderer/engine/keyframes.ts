import type { Keyframe, Transform } from '@shared/types';

// The easing on a keyframe describes the curve of the segment leading INTO
// it (i.e. easing on keyframe B shapes the A -> B transition).
function ease(t: number, easing: Keyframe['easing']): number {
  switch (easing) {
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return 1 - (1 - t) * (1 - t);
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'linear':
    default:
      return t;
  }
}

// Expects `keyframes` already sorted by time (timelineStore.setKeyframe
// maintains this invariant on write) - this runs on the compositor's hot path
// (once per animated property per layer per rendered frame), so it doesn't
// defensively re-sort on every call.
export function interpolateKeyframes(keyframes: Keyframe[], time: number, fallback: number): number {
  if (!keyframes || keyframes.length === 0) return fallback;

  if (time <= keyframes[0].time) return keyframes[0].value;
  const last = keyframes[keyframes.length - 1];
  if (time >= last.time) return last.value;

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (time >= a.time && time <= b.time) {
      const span = b.time - a.time;
      const t = span === 0 ? 1 : (time - a.time) / span;
      return a.value + (b.value - a.value) * ease(t, b.easing);
    }
  }
  return fallback;
}

const TRANSFORM_KEYS = ['x', 'y', 'scale', 'rotation', 'opacity'] as const;

export function resolveTransformAtTime(
  baseTransform: Transform,
  keyframes: Record<string, Keyframe[]>,
  localTime: number,
): Transform {
  const resolved = { ...baseTransform };
  for (const key of TRANSFORM_KEYS) {
    const trackKeyframes = keyframes[key];
    if (trackKeyframes && trackKeyframes.length > 0) {
      resolved[key] = interpolateKeyframes(trackKeyframes, localTime, baseTransform[key]);
    }
  }
  return resolved;
}
