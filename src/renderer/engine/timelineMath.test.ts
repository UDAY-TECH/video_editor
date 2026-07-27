import { describe, it, expect } from 'vitest';
import {
  pxToTime,
  timeToPx,
  clipEnd,
  hasOverlap,
  collectSnapPoints,
  snapTime,
} from './timelineMath';
import type { Clip, Track } from '@shared/types';

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? 'clip-1',
    mediaAssetId: 'asset-1',
    trackId: 'track-1',
    startTime: 0,
    duration: 5,
    sourceIn: 0,
    sourceOut: 5,
    speed: 1,
    volume: 1,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
    keyframes: {},
    ...overrides,
  };
}

function makeTrack(clips: Clip[]): Track {
  return { id: 'track-1', type: 'video', index: 0, muted: false, solo: false, locked: false, clips };
}

describe('pxToTime / timeToPx', () => {
  it('are inverses of each other at a given zoom', () => {
    expect(timeToPx(2, 50)).toBe(100);
    expect(pxToTime(100, 50)).toBe(2);
  });
});

describe('clipEnd', () => {
  it('sums startTime and duration', () => {
    expect(clipEnd({ startTime: 3, duration: 4 })).toBe(7);
  });
});

describe('hasOverlap', () => {
  it('detects overlap with an existing clip on the track', () => {
    const track = makeTrack([makeClip({ id: 'a', startTime: 0, duration: 5 })]);
    expect(hasOverlap(track, null, 3, 2)).toBe(true);
  });

  it('returns false for adjacent (touching) clips', () => {
    const track = makeTrack([makeClip({ id: 'a', startTime: 0, duration: 5 })]);
    expect(hasOverlap(track, null, 5, 2)).toBe(false);
  });

  it('excludes the given clip id from the overlap check', () => {
    const track = makeTrack([makeClip({ id: 'a', startTime: 0, duration: 5 })]);
    expect(hasOverlap(track, 'a', 0, 5)).toBe(false);
  });

  it('returns false when there is no overlap at all', () => {
    const track = makeTrack([makeClip({ id: 'a', startTime: 0, duration: 5 })]);
    expect(hasOverlap(track, null, 10, 2)).toBe(false);
  });
});

describe('collectSnapPoints', () => {
  it('collects clip start/end times, the playhead, and zero, excluding the given clip', () => {
    const tracks: Track[] = [
      makeTrack([makeClip({ id: 'a', startTime: 2, duration: 3 }), makeClip({ id: 'b', startTime: 10, duration: 1 })]),
    ];
    const points = collectSnapPoints(tracks, 'b', 20);
    expect(points.sort((x, y) => x - y)).toEqual([0, 2, 5, 20]);
  });
});

describe('snapTime', () => {
  it('snaps to the nearest point within the threshold', () => {
    expect(snapTime(5.2, [0, 5, 10], 0.5)).toBe(5);
  });

  it('leaves the time unchanged when nothing is within the threshold', () => {
    expect(snapTime(7, [0, 5, 10], 0.5)).toBe(7);
  });
});
