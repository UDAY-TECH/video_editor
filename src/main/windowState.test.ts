import { describe, it, expect } from 'vitest';
import { boundsVisibleOnAnyDisplay, resolveInitialBounds, type Rect } from './windowState';

const DISPLAY_1: Rect = { x: 0, y: 0, width: 1920, height: 1080 };
const DISPLAY_2: Rect = { x: 1920, y: 0, width: 1920, height: 1080 };

describe('boundsVisibleOnAnyDisplay', () => {
  it('is true when bounds are fully within a display', () => {
    const bounds: Rect = { x: 100, y: 100, width: 800, height: 600 };
    expect(boundsVisibleOnAnyDisplay(bounds, [DISPLAY_1])).toBe(true);
  });

  it('is true when bounds meaningfully overlap a second display', () => {
    const bounds: Rect = { x: 1800, y: 100, width: 800, height: 600 };
    expect(boundsVisibleOnAnyDisplay(bounds, [DISPLAY_1, DISPLAY_2])).toBe(true);
  });

  it('is false when the saved display is no longer connected', () => {
    const bounds: Rect = { x: 2200, y: 100, width: 800, height: 600 };
    expect(boundsVisibleOnAnyDisplay(bounds, [DISPLAY_1])).toBe(false);
  });

  it('is false when only a sliver overlaps (below the minimum visible threshold)', () => {
    const bounds: Rect = { x: 1900, y: 100, width: 800, height: 600 };
    expect(boundsVisibleOnAnyDisplay(bounds, [DISPLAY_1])).toBe(false);
  });
});

describe('resolveInitialBounds', () => {
  it('uses the saved bounds when they are visible', () => {
    const saved: Rect = { x: 100, y: 100, width: 800, height: 600 };
    expect(resolveInitialBounds(saved, [DISPLAY_1])).toEqual(saved);
  });

  it('falls back to the default size when there is no saved state', () => {
    expect(resolveInitialBounds(null, [DISPLAY_1])).toEqual({ width: 1440, height: 900 });
  });

  it('falls back to the default size when the saved display is disconnected', () => {
    const saved: Rect = { x: 2200, y: 100, width: 800, height: 600 };
    expect(resolveInitialBounds(saved, [DISPLAY_1])).toEqual({ width: 1440, height: 900 });
  });

  it('clamps bounds that hang off the edge of an overlapping display back on-screen', () => {
    const saved: Rect = { x: 1700, y: 100, width: 800, height: 600 };
    expect(resolveInitialBounds(saved, [DISPLAY_1])).toEqual({ x: 1120, y: 100, width: 800, height: 600 });
  });

  it('shrinks bounds larger than the display they resolve onto', () => {
    const saved: Rect = { x: 100, y: 100, width: 2000, height: 1200 };
    expect(resolveInitialBounds(saved, [DISPLAY_1])).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });
});
