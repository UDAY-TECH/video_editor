import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { writeProjectFile, readProjectFile, CURRENT_PROJECT_VERSION } from './index';
import type { ProjectFile } from '../../shared/types';

describe('writeProjectFile / readProjectFile', () => {
  it('round-trips a project file to and from disk', async () => {
    const dir = mkdtempSync(join(tmpdir(), 've-project-io-test-'));
    const filePath = join(dir, 'test.veproj');

    const project: ProjectFile = {
      version: CURRENT_PROJECT_VERSION,
      id: 'proj-1',
      name: 'Round Trip',
      createdAt: '2024-01-01T00:00:00.000Z',
      modifiedAt: '2024-01-01T00:00:00.000Z',
      settings: { resolution: { width: 1920, height: 1080 }, fps: 30, sampleRate: 48000 },
      mediaAssets: [
        { id: 'a1', filePath: 'C:\\videos\\clip.mp4', type: 'video', duration: 10 },
      ],
      tracks: [
        {
          id: 't1',
          type: 'video',
          index: 0,
          muted: false,
          solo: false,
          locked: false,
          clips: [
            {
              id: 'c1',
              mediaAssetId: 'a1',
              trackId: 't1',
              startTime: 0,
              duration: 10,
              sourceIn: 0,
              sourceOut: 10,
              speed: 1,
              volume: 1,
              transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
              effects: [],
              keyframes: {},
            },
          ],
        },
      ],
    };

    await writeProjectFile(filePath, project);
    const loaded = await readProjectFile(filePath);

    expect(loaded).toEqual(project);
  });

  it('rejects a corrupted (non-JSON) file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 've-project-io-test-'));
    const filePath = join(dir, 'corrupt.veproj');
    const { writeFileSync } = await import('fs');
    writeFileSync(filePath, 'not valid json{{{');

    await expect(readProjectFile(filePath)).rejects.toThrow();
  });
});
