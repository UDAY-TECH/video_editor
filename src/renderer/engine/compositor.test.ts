import { describe, it, expect } from 'vitest';
import { computeTrackFrame, computeCompositeFrame } from './compositor';
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

function makeTrack(clips: Clip[], overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    type: 'video',
    index: 0,
    muted: false,
    solo: false,
    locked: false,
    clips,
    ...overrides,
  };
}

describe('computeTrackFrame', () => {
  it('returns no layers when nothing is active at the playhead', () => {
    const track = makeTrack([makeClip({ startTime: 0, duration: 5 })]);
    expect(computeTrackFrame(track, 10)).toEqual([]);
  });

  it('shows the last frame when the playhead lands exactly on a clip end with nothing after it', () => {
    const track = makeTrack([makeClip({ startTime: 0, duration: 5, sourceIn: 1 })]);
    const layers = computeTrackFrame(track, 5);
    expect(layers).toHaveLength(1);
    expect(layers[0].sourceTime).toBe(6); // sourceIn(1) + localTime clamped to duration(5)
  });

  it('does not double-match when the playhead sits exactly on the boundary between two adjacent clips', () => {
    const a = makeClip({ id: 'a', startTime: 0, duration: 5 });
    const b = makeClip({ id: 'b', startTime: 5, duration: 5 });
    const track = makeTrack([a, b]);
    const layers = computeTrackFrame(track, 5);
    expect(layers).toHaveLength(1);
    expect(layers[0].clip.id).toBe('b');
  });

  it('returns a single full-alpha layer with no transition nearby', () => {
    const track = makeTrack([makeClip({ startTime: 0, duration: 10, sourceIn: 2 })]);
    const layers = computeTrackFrame(track, 3);
    expect(layers).toHaveLength(1);
    expect(layers[0].alpha).toBe(1);
    expect(layers[0].sourceTime).toBe(5); // sourceIn(2) + localTime(3)
    expect(layers[0].wipe).toBeUndefined();
  });

  it('applies speed when computing sourceTime', () => {
    const track = makeTrack([makeClip({ startTime: 0, duration: 10, sourceIn: 0, speed: 2 })]);
    const layers = computeTrackFrame(track, 3);
    expect(layers[0].sourceTime).toBe(6);
  });

  it('crossfades transitionOut into the next clip near the end of the current clip', () => {
    const a = makeClip({
      id: 'a',
      startTime: 0,
      duration: 10,
      transitionOut: { type: 'fade', duration: 2 },
    });
    const b = makeClip({ id: 'b', startTime: 10, duration: 5 });
    const track = makeTrack([a, b]);

    // Halfway through the 2s transition window (window starts at t=8, so t=9 -> 50%).
    const layers = computeTrackFrame(track, 9);
    expect(layers).toHaveLength(2);
    expect(layers[0].clip.id).toBe('a');
    expect(layers[0].alpha).toBeCloseTo(0.5);
    expect(layers[1].clip.id).toBe('b');
    expect(layers[1].alpha).toBeCloseTo(0.5);
    // The incoming clip is frozen on its first frame during the blend.
    expect(layers[1].sourceTime).toBe(b.sourceIn);
  });

  it('does not apply transitionOut without a next clip to blend into', () => {
    const a = makeClip({
      id: 'a',
      startTime: 0,
      duration: 10,
      transitionOut: { type: 'fade', duration: 2 },
    });
    const track = makeTrack([a]);
    const layers = computeTrackFrame(track, 9);
    expect(layers).toHaveLength(1);
    expect(layers[0].alpha).toBe(1);
  });

  it('does not apply transitionOut when there is a gap before the next clip', () => {
    const a = makeClip({
      id: 'a',
      startTime: 0,
      duration: 10,
      transitionOut: { type: 'fade', duration: 2 },
    });
    const b = makeClip({ id: 'b', startTime: 12, duration: 5 }); // 2s gap, not contiguous
    const track = makeTrack([a, b]);
    const layers = computeTrackFrame(track, 9);
    expect(layers).toHaveLength(1);
    expect(layers[0].clip.id).toBe('a');
    expect(layers[0].alpha).toBe(1);
  });

  it('crossfades transitionIn from the previous clip near the start of the current clip', () => {
    const a = makeClip({ id: 'a', startTime: 0, duration: 10 });
    const b = makeClip({
      id: 'b',
      startTime: 10,
      duration: 5,
      transitionIn: { type: 'dissolve', duration: 2 },
    });
    const track = makeTrack([a, b]);

    // 1s into b's 2s transitionIn window -> 50%.
    const layers = computeTrackFrame(track, 11);
    expect(layers).toHaveLength(2);
    expect(layers[0].clip.id).toBe('a');
    expect(layers[0].alpha).toBeCloseTo(0.5);
    // The outgoing clip is frozen on its last frame during the blend.
    expect(layers[0].sourceTime).toBe(a.sourceIn + a.duration * a.speed);
    expect(layers[1].clip.id).toBe('b');
    expect(layers[1].alpha).toBeCloseTo(0.5);
  });

  it('renders a wipe transition as reveal info rather than alpha blending', () => {
    const a = makeClip({
      id: 'a',
      startTime: 0,
      duration: 10,
      transitionOut: { type: 'wipe', duration: 2 },
    });
    const b = makeClip({ id: 'b', startTime: 10, duration: 5 });
    const track = makeTrack([a, b]);

    const layers = computeTrackFrame(track, 9);
    expect(layers[0].alpha).toBe(1);
    expect(layers[0].wipe).toEqual({ revealingFromLeft: false, t: 0.5 });
    expect(layers[1].alpha).toBe(1);
    expect(layers[1].wipe).toEqual({ revealingFromLeft: true, t: 0.5 });
  });

  it('resolves keyframed transform properties at the clip-local time', () => {
    const clip = makeClip({
      startTime: 0,
      duration: 10,
      keyframes: {
        opacity: [
          { time: 0, value: 0, easing: 'linear' },
          { time: 10, value: 1, easing: 'linear' },
        ],
      },
    });
    const track = makeTrack([clip]);
    const layers = computeTrackFrame(track, 5);
    expect(layers[0].transform.opacity).toBeCloseTo(0.5);
  });

  it('resolves keyframed color correction properties at the clip-local time', () => {
    const clip = makeClip({
      startTime: 0,
      duration: 10,
      keyframes: {
        brightness: [
          { time: 0, value: 0, easing: 'linear' },
          { time: 10, value: 100, easing: 'linear' },
        ],
      },
    });
    const track = makeTrack([clip]);
    const layers = computeTrackFrame(track, 5);
    expect(layers[0].colorCorrection.brightness).toBeCloseTo(50);
  });

  it('passes through the clip\'s LUT reference and intensity', () => {
    const clip = makeClip({
      colorCorrection: { brightness: 0, contrast: 0, saturation: 0, exposure: 0, lutPath: 'C:\\luts\\a.cube', lutIntensity: 0.5 },
    });
    const track = makeTrack([clip]);
    const layers = computeTrackFrame(track, 5);
    expect(layers[0].lutPath).toBe('C:\\luts\\a.cube');
    expect(layers[0].lutIntensity).toBe(0.5);
  });

  it('exposes localTime on the returned layer', () => {
    const track = makeTrack([makeClip({ startTime: 2, duration: 10 })]);
    const layers = computeTrackFrame(track, 5);
    expect(layers[0].localTime).toBe(3);
  });

  it('produces a valid layer for a text clip with no mediaAssetId', () => {
    const textClip = makeClip({
      mediaAssetId: undefined,
      startTime: 0,
      duration: 5,
      text: {
        content: 'Hello',
        fontFamily: 'Arial',
        fontSize: 48,
        color: '#ffffff',
        align: 'center',
        entranceAnimation: 'none',
        exitAnimation: 'none',
      },
    });
    const track = makeTrack([textClip]);
    const layers = computeTrackFrame(track, 2);
    expect(layers).toHaveLength(1);
    expect(layers[0].clip.mediaAssetId).toBeUndefined();
    expect(layers[0].clip.text?.content).toBe('Hello');
    expect(layers[0].localTime).toBe(2);
    expect(layers[0].alpha).toBe(1);
  });
});

describe('computeCompositeFrame', () => {
  it('orders layers bottom-to-top by track index and excludes audio tracks', () => {
    const bottomClip = makeClip({ id: 'bottom', trackId: 'v1' });
    const topClip = makeClip({ id: 'top', trackId: 'v2' });
    const audioClip = makeClip({ id: 'audio-clip', trackId: 'a1' });

    const tracks: Track[] = [
      makeTrack([topClip], { id: 'v2', index: 1 }),
      makeTrack([bottomClip], { id: 'v1', index: 0 }),
      makeTrack([audioClip], { id: 'a1', index: 0, type: 'audio' }),
    ];

    const layers = computeCompositeFrame(tracks, 5);
    expect(layers.map((l) => l.clip.id)).toEqual(['bottom', 'top']);
  });
});
