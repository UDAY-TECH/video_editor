import { describe, it, expect } from 'vitest';
import { shouldGenerateProxy, buildProxyArgs, PROXY_TARGET_WIDTH } from './proxy';

describe('shouldGenerateProxy', () => {
  it('is false when resolution is missing', () => {
    expect(shouldGenerateProxy(undefined)).toBe(false);
  });

  it('is false for 1080p and below', () => {
    expect(shouldGenerateProxy({ width: 1920, height: 1080 })).toBe(false);
    expect(shouldGenerateProxy({ width: 1280, height: 720 })).toBe(false);
  });

  it('is true above 1080p width (4K and up)', () => {
    expect(shouldGenerateProxy({ width: 3840, height: 2160 })).toBe(true);
  });
});

describe('buildProxyArgs', () => {
  it('builds a scale + fast x264 encode targeting the proxy width', () => {
    const args = buildProxyArgs('C:\\in.mp4', 'C:\\out.mp4');
    expect(args).toEqual([
      '-y',
      '-i',
      'C:\\in.mp4',
      '-vf',
      `scale=${PROXY_TARGET_WIDTH}:-2`,
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '28',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      'C:\\out.mp4',
    ]);
  });
});
