import type { Clip, ColorCorrection } from '@shared/types';
import { interpolateKeyframes } from './keyframes';

export type ColorCorrectionValues = Pick<ColorCorrection, 'brightness' | 'contrast' | 'saturation' | 'exposure'>;

const CC_KEYS = ['brightness', 'contrast', 'saturation', 'exposure'] as const;

export function computeColorCorrectionAt(clip: Clip, localTime: number): ColorCorrectionValues {
  const base = clip.colorCorrection;
  const resolved: ColorCorrectionValues = {
    brightness: base.brightness,
    contrast: base.contrast,
    saturation: base.saturation,
    exposure: base.exposure,
  };
  for (const key of CC_KEYS) {
    const trackKeyframes = clip.keyframes[key];
    if (trackKeyframes && trackKeyframes.length > 0) {
      resolved[key] = interpolateKeyframes(trackKeyframes, localTime, base[key]);
    }
  }
  return resolved;
}

// Approximates the FFmpeg `eq` filter that Phase 9's export pipeline will use,
// via Canvas 2D's `filter` property. That API only exposes percentage-based
// brightness/contrast/saturate (no exposure-in-stops concept), so exposure is
// folded into brightness as a 2^stops multiplier before converting to a
// percentage. Percentages are clamped at 0 since negative values are invalid
// CSS and would otherwise throw when assigned to ctx.filter.
export function buildCssFilterString(values: ColorCorrectionValues): string {
  const exposureMultiplier = Math.pow(2, values.exposure);
  const brightnessPercent = Math.max(0, (100 + values.brightness) * exposureMultiplier);
  const contrastPercent = Math.max(0, 100 + values.contrast);
  const saturatePercent = Math.max(0, 100 + values.saturation);

  if (brightnessPercent === 100 && contrastPercent === 100 && saturatePercent === 100) return 'none';
  return `brightness(${brightnessPercent}%) contrast(${contrastPercent}%) saturate(${saturatePercent}%)`;
}
