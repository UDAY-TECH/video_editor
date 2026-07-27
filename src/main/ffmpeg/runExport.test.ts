import { describe, it, expect, vi } from 'vitest';
import { parseProgressBlock, FfmpegProgressParser } from './runExport';

describe('parseProgressBlock', () => {
  it('computes percent from out_time_us relative to total duration', () => {
    const block = ['frame=100', 'out_time_us=5000000', 'speed=1.2x', 'progress=continue'].join('\n');
    const result = parseProgressBlock(block, 10);
    expect(result.outTimeSeconds).toBe(5);
    expect(result.percent).toBe(50);
    expect(result.speed).toBeCloseTo(1.2);
    expect(result.done).toBe(false);
  });

  it('reports 100% and done=true on progress=end regardless of out_time_us', () => {
    const block = ['out_time_us=9999999', 'progress=end'].join('\n');
    const result = parseProgressBlock(block, 10);
    expect(result.percent).toBe(100);
    expect(result.done).toBe(true);
  });

  it('clamps percent to [0, 100]', () => {
    const over = parseProgressBlock(['out_time_us=20000000', 'progress=continue'].join('\n'), 10);
    expect(over.percent).toBe(100);
  });

  it('returns 0 percent when total duration is 0 (avoids divide by zero)', () => {
    const result = parseProgressBlock(['out_time_us=5000000', 'progress=continue'].join('\n'), 0);
    expect(result.percent).toBe(0);
  });

  it('treats a missing/malformed speed as null rather than NaN', () => {
    const result = parseProgressBlock(['out_time_us=1000000', 'progress=continue'].join('\n'), 10);
    expect(result.speed).toBeNull();
  });
});

describe('FfmpegProgressParser', () => {
  it('invokes onProgress once per complete block, buffering across chunk boundaries', () => {
    const onProgress = vi.fn();
    const parser = new FfmpegProgressParser(10, onProgress);

    // Split a single progress block across two feed() calls, mid-line.
    parser.feed('frame=1\nout_time_us=2000000\nspe');
    expect(onProgress).not.toHaveBeenCalled();
    parser.feed('ed=1.0x\nprogress=continue\n');
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress.mock.calls[0][0].outTimeSeconds).toBe(2);
  });

  it('handles multiple complete blocks arriving in a single chunk', () => {
    const onProgress = vi.fn();
    const parser = new FfmpegProgressParser(10, onProgress);

    parser.feed(
      'out_time_us=1000000\nprogress=continue\nout_time_us=2000000\nprogress=continue\nout_time_us=10000000\nprogress=end\n',
    );

    expect(onProgress).toHaveBeenCalledTimes(3);
    expect(onProgress.mock.calls[2][0].done).toBe(true);
  });
});
