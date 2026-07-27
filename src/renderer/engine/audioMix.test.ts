import { describe, it, expect } from 'vitest';
import { dbToGain, isTrackAudible, isTrackActiveAt, computeClipVolumeAt, computeEffectiveGain } from './audioMix';
import type { Clip, Track } from '@shared/types';

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? 'clip-1',
    mediaAssetId: 'asset-1',
    trackId: 'track-1',
    startTime: 0,
    duration: 10,
    sourceIn: 0,
    sourceOut: 10,
    speed: 1,
    volume: 1,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
    keyframes: {},
    colorCorrection: { brightness: 0, contrast: 0, saturation: 0, exposure: 0, lutIntensity: 1 },
    ...overrides,
  };
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'a1',
    type: 'audio',
    index: 0,
    muted: false,
    solo: false,
    locked: false,
    clips: [],
    ...overrides,
  };
}

describe('dbToGain', () => {
  it('converts 0dB to unity gain', () => {
    expect(dbToGain(0)).toBeCloseTo(1);
  });

  it('converts -6dB (reduction of 6) to roughly half gain', () => {
    expect(dbToGain(6)).toBeCloseTo(0.501, 2);
  });

  it('converts a large reduction toward silence', () => {
    expect(dbToGain(60)).toBeCloseTo(0.001, 3);
  });
});

describe('isTrackAudible', () => {
  it('is audible by default', () => {
    const track = makeTrack();
    expect(isTrackAudible(track, [track])).toBe(true);
  });

  it('a muted track is never audible', () => {
    const track = makeTrack({ muted: true });
    expect(isTrackAudible(track, [track])).toBe(false);
  });

  it('when any track is soloed, only soloed tracks are audible', () => {
    const soloed = makeTrack({ id: 'a1', solo: true });
    const other = makeTrack({ id: 'a2', solo: false });
    const tracks = [soloed, other];
    expect(isTrackAudible(soloed, tracks)).toBe(true);
    expect(isTrackAudible(other, tracks)).toBe(false);
  });

  it('a muted track stays inaudible even if soloed', () => {
    const track = makeTrack({ muted: true, solo: true });
    expect(isTrackAudible(track, [track])).toBe(false);
  });

  it('a soloed video track does not silence unrelated audio tracks', () => {
    const soloedVideo = makeTrack({ id: 'v1', type: 'video', solo: true });
    const audio = makeTrack({ id: 'a1', type: 'audio', solo: false });
    const tracks = [soloedVideo, audio];
    expect(isTrackAudible(audio, tracks)).toBe(true);
  });
});

describe('isTrackActiveAt', () => {
  it('is false for a video track', () => {
    const track = makeTrack({ type: 'video', clips: [makeClip({ startTime: 0, duration: 5 })] });
    expect(isTrackActiveAt(track, 2, [track])).toBe(false);
  });

  it('is true when a clip is active at the given time', () => {
    const track = makeTrack({ clips: [makeClip({ startTime: 0, duration: 5 })] });
    expect(isTrackActiveAt(track, 2, [track])).toBe(true);
    expect(isTrackActiveAt(track, 10, [track])).toBe(false);
  });

  it('is false when the track is not audible (muted)', () => {
    const track = makeTrack({ muted: true, clips: [makeClip({ startTime: 0, duration: 5 })] });
    expect(isTrackActiveAt(track, 2, [track])).toBe(false);
  });
});

describe('computeClipVolumeAt', () => {
  it('returns the static volume when there are no volume keyframes', () => {
    const clip = makeClip({ volume: 0.7 });
    expect(computeClipVolumeAt(clip, 3)).toBe(0.7);
  });

  it('interpolates volume keyframes', () => {
    const clip = makeClip({
      keyframes: {
        volume: [
          { time: 0, value: 0, easing: 'linear' },
          { time: 10, value: 1, easing: 'linear' },
        ],
      },
    });
    expect(computeClipVolumeAt(clip, 5)).toBeCloseTo(0.5);
  });
});

describe('computeEffectiveGain', () => {
  it('is 0 when the track is not audible', () => {
    const track = makeTrack({ muted: true });
    const clip = makeClip();
    expect(computeEffectiveGain(clip, 0, track, [track], 0)).toBe(0);
  });

  it('equals the clip volume with no ducking rule', () => {
    const track = makeTrack();
    const clip = makeClip({ volume: 0.8 });
    expect(computeEffectiveGain(clip, 0, track, [track], 0)).toBeCloseTo(0.8);
  });

  it('applies ducking reduction when the trigger track has active audio', () => {
    const trigger = makeTrack({ id: 'a1', clips: [makeClip({ id: 'trigger-clip', startTime: 0, duration: 10 })] });
    const target = makeTrack({
      id: 'a2',
      duckingTriggerTrackId: 'a1',
      duckingReductionDb: 20,
    });
    const clip = makeClip({ id: 'target-clip', volume: 1 });
    const tracks = [trigger, target];

    const gain = computeEffectiveGain(clip, 0, target, tracks, 5);
    expect(gain).toBeCloseTo(dbToGain(20));
  });

  it('does not duck when the trigger track has no active clip at the current time', () => {
    const trigger = makeTrack({ id: 'a1', clips: [makeClip({ id: 'trigger-clip', startTime: 0, duration: 2 })] });
    const target = makeTrack({ id: 'a2', duckingTriggerTrackId: 'a1', duckingReductionDb: 20 });
    const clip = makeClip({ volume: 1 });
    const tracks = [trigger, target];

    const gain = computeEffectiveGain(clip, 0, target, tracks, 5); // trigger clip ended at t=2
    expect(gain).toBeCloseTo(1);
  });
});
