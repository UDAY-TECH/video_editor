import { describe, it, expect } from 'vitest';
import { interpolateKeyframes, resolveTransformAtTime } from './keyframes';
import type { Keyframe, Transform } from '@shared/types';

describe('interpolateKeyframes', () => {
  it('returns the fallback when there are no keyframes', () => {
    expect(interpolateKeyframes([], 5, 42)).toBe(42);
  });

  it('clamps to the first keyframe before its time', () => {
    const kfs: Keyframe[] = [{ time: 2, value: 10, easing: 'linear' }];
    expect(interpolateKeyframes(kfs, 0, 0)).toBe(10);
  });

  it('clamps to the last keyframe after its time', () => {
    const kfs: Keyframe[] = [
      { time: 0, value: 0, easing: 'linear' },
      { time: 2, value: 10, easing: 'linear' },
    ];
    expect(interpolateKeyframes(kfs, 100, 0)).toBe(10);
  });

  it('interpolates linearly between two keyframes', () => {
    const kfs: Keyframe[] = [
      { time: 0, value: 0, easing: 'linear' },
      { time: 10, value: 100, easing: 'linear' },
    ];
    expect(interpolateKeyframes(kfs, 5, 0)).toBe(50);
  });

  it('applies easeIn on the segment leading into the target keyframe', () => {
    const kfs: Keyframe[] = [
      { time: 0, value: 0, easing: 'linear' },
      { time: 10, value: 100, easing: 'easeIn' },
    ];
    // easeIn: t*t, so at t=0.5 progress should be 25% of the way, not 50%.
    expect(interpolateKeyframes(kfs, 5, 0)).toBe(25);
  });

  it('applies easeOut on the segment leading into the target keyframe', () => {
    const kfs: Keyframe[] = [
      { time: 0, value: 0, easing: 'linear' },
      { time: 10, value: 100, easing: 'easeOut' },
    ];
    // easeOut: 1-(1-t)^2, at t=0.5 -> 0.75
    expect(interpolateKeyframes(kfs, 5, 0)).toBe(75);
  });

  it('expects pre-sorted input (the store maintains this invariant on write)', () => {
    const kfs: Keyframe[] = [
      { time: 0, value: 0, easing: 'linear' },
      { time: 10, value: 100, easing: 'linear' },
    ];
    expect(interpolateKeyframes(kfs, 5, 0)).toBe(50);
  });
});

describe('resolveTransformAtTime', () => {
  const base: Transform = { x: 1, y: 2, scale: 1, rotation: 0, opacity: 1 };

  it('returns the base transform untouched when there are no keyframes', () => {
    expect(resolveTransformAtTime(base, {}, 5)).toEqual(base);
  });

  it('overrides only the properties that have keyframes', () => {
    const keyframes = {
      opacity: [
        { time: 0, value: 0, easing: 'linear' as const },
        { time: 2, value: 1, easing: 'linear' as const },
      ],
    };
    const resolved = resolveTransformAtTime(base, keyframes, 1);
    expect(resolved.opacity).toBe(0.5);
    expect(resolved.x).toBe(base.x);
    expect(resolved.y).toBe(base.y);
  });
});
