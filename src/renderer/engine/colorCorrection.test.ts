import { describe, it, expect } from 'vitest';
import { computeColorCorrectionAt, buildCssFilterString } from './colorCorrection';
import type { Clip } from '@shared/types';

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1',
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

describe('computeColorCorrectionAt', () => {
  it('returns the static base values when there are no keyframes', () => {
    const clip = makeClip({ colorCorrection: { brightness: 10, contrast: -5, saturation: 20, exposure: 0.5, lutIntensity: 1 } });
    expect(computeColorCorrectionAt(clip, 3)).toEqual({ brightness: 10, contrast: -5, saturation: 20, exposure: 0.5 });
  });

  it('interpolates a keyframed property independently of the others', () => {
    const clip = makeClip({
      keyframes: {
        brightness: [
          { time: 0, value: 0, easing: 'linear' },
          { time: 10, value: 100, easing: 'linear' },
        ],
      },
    });
    const result = computeColorCorrectionAt(clip, 5);
    expect(result.brightness).toBeCloseTo(50);
    expect(result.contrast).toBe(0);
  });
});

describe('buildCssFilterString', () => {
  it('returns "none" when all values are neutral', () => {
    expect(buildCssFilterString({ brightness: 0, contrast: 0, saturation: 0, exposure: 0 })).toBe('none');
  });

  it('builds percentage-based brightness/contrast/saturate terms', () => {
    const result = buildCssFilterString({ brightness: 20, contrast: -10, saturation: 50, exposure: 0 });
    expect(result).toBe('brightness(120%) contrast(90%) saturate(150%)');
  });

  it('folds exposure into brightness as a 2^stops multiplier', () => {
    const result = buildCssFilterString({ brightness: 0, contrast: 0, saturation: 0, exposure: 1 });
    expect(result).toBe('brightness(200%) contrast(100%) saturate(100%)');
  });

  it('clamps negative percentages to 0 rather than producing invalid CSS', () => {
    const result = buildCssFilterString({ brightness: -150, contrast: -150, saturation: -150, exposure: 0 });
    expect(result).toBe('brightness(0%) contrast(0%) saturate(0%)');
  });
});
