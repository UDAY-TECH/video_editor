import { describe, it, expect } from 'vitest';
import { buildProbeArgs, parseProbeOutput } from './probe';

describe('buildProbeArgs', () => {
  it('includes the input file path and json output flags', () => {
    const args = buildProbeArgs('C:/videos/clip.mp4');
    expect(args).toContain('C:/videos/clip.mp4');
    expect(args).toContain('-show_streams');
    expect(args).toContain('-show_format');
  });
});

describe('parseProbeOutput', () => {
  it('extracts duration and resolution from a video stream', () => {
    const result = parseProbeOutput({
      format: { duration: '12.5' },
      streams: [{ codec_type: 'audio' }, { codec_type: 'video', width: 1920, height: 1080 }],
    });
    expect(result.duration).toBe(12.5);
    expect(result.resolution).toEqual({ width: 1920, height: 1080 });
  });

  it('falls back to duration 0 when format/duration is missing', () => {
    const result = parseProbeOutput({});
    expect(result.duration).toBe(0);
    expect(result.resolution).toBeUndefined();
  });

  it('leaves resolution undefined when there is no video stream', () => {
    const result = parseProbeOutput({
      format: { duration: '3.2' },
      streams: [{ codec_type: 'audio' }],
    });
    expect(result.duration).toBe(3.2);
    expect(result.resolution).toBeUndefined();
  });
});
