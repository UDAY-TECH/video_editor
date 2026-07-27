import { describe, it, expect } from 'vitest';
import { toMediaUrl, fromMediaUrl } from './mediaUrl';

describe('mediaUrl', () => {
  it('round-trips a Windows absolute path', () => {
    const filePath = 'C:\\Users\\uday\\Videos\\clip.mp4';
    expect(fromMediaUrl(toMediaUrl(filePath))).toBe(filePath);
  });

  it('round-trips a path with spaces and special characters', () => {
    const filePath = 'C:\\Users\\uday\\My Videos\\clip #1 (final).mp4';
    expect(fromMediaUrl(toMediaUrl(filePath))).toBe(filePath);
  });
});
