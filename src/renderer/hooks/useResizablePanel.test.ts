import { describe, it, expect } from 'vitest';
import { clampSize } from './useResizablePanel';

describe('clampSize', () => {
  it('leaves a value within range unchanged', () => {
    expect(clampSize(300, 100, 500)).toBe(300);
  });

  it('clamps below the minimum', () => {
    expect(clampSize(50, 100, 500)).toBe(100);
  });

  it('clamps above the maximum', () => {
    expect(clampSize(900, 100, 500)).toBe(500);
  });
});
