import { describe, it, expect } from 'vitest';
import { parseCubeLut } from './lut';

const VALID_2X2X2_CUBE = `
TITLE "Test LUT"
# a comment line
DOMAIN_MIN 0.0 0.0 0.0
DOMAIN_MAX 1.0 1.0 1.0
LUT_3D_SIZE 2
0.0 0.0 0.0
1.0 0.0 0.0
0.0 1.0 0.0
1.0 1.0 0.0
0.0 0.0 1.0
1.0 0.0 1.0
0.0 1.0 1.0
1.0 1.0 1.0
`;

describe('parseCubeLut', () => {
  it('parses a valid 2x2x2 cube, ignoring TITLE/comment/DOMAIN lines', () => {
    const lut = parseCubeLut(VALID_2X2X2_CUBE);
    expect(lut.size).toBe(2);
    expect(lut.data).toHaveLength(2 * 2 * 2 * 3);
    // First entry: (r=0,g=0,b=0) -> black.
    expect([...lut.data.slice(0, 3)]).toEqual([0, 0, 0]);
    // Last entry: (r=1,g=1,b=1) -> white.
    expect([...lut.data.slice(21, 24)]).toEqual([1, 1, 1]);
  });

  it('throws when LUT_3D_SIZE is missing', () => {
    expect(() => parseCubeLut('0.0 0.0 0.0\n1.0 1.0 1.0')).toThrow(/LUT_3D_SIZE/);
  });

  it('throws for a 1D LUT', () => {
    expect(() => parseCubeLut('LUT_1D_SIZE 2\n0.0 0.0 0.0\n1.0 1.0 1.0')).toThrow(/1D LUTs are not supported/);
  });

  it('throws when the data length does not match the declared size', () => {
    const truncated = `LUT_3D_SIZE 2\n0.0 0.0 0.0\n1.0 0.0 0.0`;
    expect(() => parseCubeLut(truncated)).toThrow(/LUT data length mismatch/);
  });
});
