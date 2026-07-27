// Parser for the Adobe/Iridas `.cube` 3D LUT format (Section 5.7). Only the
// subset actually needed for color grading is supported: `TITLE`, `#`
// comments, and `DOMAIN_MIN`/`DOMAIN_MAX` are recognized and ignored (v1
// assumes the standard 0..1 domain); `LUT_1D_SIZE` cube files are rejected
// since this app only applies 3D LUTs.
export interface ParsedLut {
  size: number;
  // R,G,B triples in [0,1], row-major as (b * size * size + g * size + r) * 3 + channel.
  data: Float32Array;
}

export function parseCubeLut(text: string): ParsedLut {
  const lines = text.split(/\r?\n/);
  let size: number | null = null;
  const values: number[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('TITLE') || line.startsWith('DOMAIN_MIN') || line.startsWith('DOMAIN_MAX')) continue;
    if (line.startsWith('LUT_1D_SIZE')) {
      throw new Error('1D LUTs are not supported - import a 3D .cube LUT instead');
    }
    if (line.startsWith('LUT_3D_SIZE')) {
      const parsed = parseInt(line.split(/\s+/)[1], 10);
      if (!Number.isFinite(parsed)) throw new Error('Invalid LUT_3D_SIZE in .cube file');
      size = parsed;
      continue;
    }

    const parts = line.split(/\s+/).map(Number);
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      values.push(parts[0], parts[1], parts[2]);
    }
  }

  if (!size || size < 2) throw new Error('Missing or invalid LUT_3D_SIZE in .cube file');
  const expected = size * size * size * 3;
  if (values.length !== expected) {
    throw new Error(`LUT data length mismatch: expected ${expected} values for size ${size}, got ${values.length}`);
  }

  return { size, data: Float32Array.from(values) };
}
