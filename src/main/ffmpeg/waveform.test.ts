import { describe, it, expect } from 'vitest';
import { buildWaveformArgs, computePeaksFromPCM } from './waveform';

describe('buildWaveformArgs', () => {
  it('extracts mono PCM at the fixed sample rate to stdout', () => {
    const args = buildWaveformArgs('in.mp4');
    expect(args).toContain('in.mp4');
    expect(args).toContain('-ac');
    expect(args).toContain('1');
    expect(args).toContain('pcm_s16le');
    expect(args[args.length - 1]).toBe('-');
  });
});

describe('computePeaksFromPCM', () => {
  function makePCM(samples: number[]): Buffer {
    const buf = Buffer.alloc(samples.length * 2);
    samples.forEach((s, i) => buf.writeInt16LE(s, i * 2));
    return buf;
  }

  it('returns an all-zero array for empty input', () => {
    expect(computePeaksFromPCM(Buffer.alloc(0), 10)).toEqual(new Array(10).fill(0));
  });

  it('returns an empty array when peakCount is 0', () => {
    expect(computePeaksFromPCM(makePCM([100, 200]), 0)).toEqual([]);
  });

  it('computes the max absolute amplitude per window, normalized to 0-1', () => {
    // 4 samples, 2 peaks -> 2 samples per peak.
    const buf = makePCM([100, -32768, 16384, 0]);
    const peaks = computePeaksFromPCM(buf, 2);
    expect(peaks).toHaveLength(2);
    expect(peaks[0]).toBeCloseTo(1); // max(|100|, |-32768|) / 32768 = 1
    expect(peaks[1]).toBeCloseTo(0.5); // max(|16384|, |0|) / 32768 = 0.5
  });

  it('produces exactly the requested peak count regardless of sample count', () => {
    const buf = makePCM(new Array(37).fill(1000));
    expect(computePeaksFromPCM(buf, 10)).toHaveLength(10);
  });
});
