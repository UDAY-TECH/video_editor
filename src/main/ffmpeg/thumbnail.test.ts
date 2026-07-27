import { describe, it, expect } from 'vitest';
import { buildThumbnailArgs } from './thumbnail';

describe('buildThumbnailArgs', () => {
  it('includes a seek flag when seekSeconds is provided and positive', () => {
    const args = buildThumbnailArgs('in.mp4', 'out.jpg', 1.5);
    expect(args).toEqual([
      '-ss',
      '1.50',
      '-i',
      'in.mp4',
      '-frames:v',
      '1',
      '-vf',
      'scale=320:-1',
      '-y',
      'out.jpg',
    ]);
  });

  it('omits the seek flag when seekSeconds is not provided', () => {
    const args = buildThumbnailArgs('in.png', 'out.jpg');
    expect(args).toEqual(['-i', 'in.png', '-frames:v', '1', '-vf', 'scale=320:-1', '-y', 'out.jpg']);
  });

  it('omits the seek flag when seekSeconds is zero', () => {
    const args = buildThumbnailArgs('in.mp4', 'out.jpg', 0);
    expect(args).not.toContain('-ss');
  });
});
