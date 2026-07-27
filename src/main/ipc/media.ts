import { ipcMain, dialog, app } from 'electron';
import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { access, mkdir, writeFile } from 'fs/promises';
import { runProbe, parseProbeOutput } from '../ffmpeg/probe';
import { generateThumbnail } from '../ffmpeg/thumbnail';
import { extractWaveformPeaks } from '../ffmpeg/waveform';
import type { MediaAsset } from '../../shared/types';

const VIDEO_EXT = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
const AUDIO_EXT = ['.wav', '.mp3', '.aac'];
const IMAGE_EXT = ['.png', '.jpg', '.jpeg'];

function detectType(filePath: string): MediaAsset['type'] | null {
  const ext = extname(filePath).toLowerCase();
  if (VIDEO_EXT.includes(ext)) return 'video';
  if (AUDIO_EXT.includes(ext)) return 'audio';
  if (IMAGE_EXT.includes(ext)) return 'image';
  return null;
}

async function buildMediaAsset(filePath: string): Promise<MediaAsset | null> {
  const type = detectType(filePath);
  if (!type) return null;
  try {
    const probeJson = await runProbe(filePath);
    const { duration, resolution } = parseProbeOutput(probeJson);
    return { id: randomUUID(), filePath, type, duration, resolution };
  } catch (err) {
    console.warn(`Failed to probe ${filePath}:`, err);
    return null;
  }
}

function thumbnailDir(): string {
  return join(app.getPath('userData'), 'thumbnails');
}

function waveformDir(): string {
  return join(app.getPath('userData'), 'waveforms');
}

export function registerMediaIpc(): void {
  ipcMain.handle('media:import', async (_event, paths?: string[]) => {
    let filePaths = paths;
    if (!filePaths || filePaths.length === 0) {
      const result = await dialog.showOpenDialog({
        properties: ['openFile', 'multiSelections'],
        filters: [
          {
            name: 'Media',
            extensions: [...VIDEO_EXT, ...AUDIO_EXT, ...IMAGE_EXT].map((ext) => ext.slice(1)),
          },
        ],
      });
      if (result.canceled) return [];
      filePaths = result.filePaths;
    }

    const assets = await Promise.all(filePaths.map(buildMediaAsset));
    return assets.filter((asset): asset is MediaAsset => asset !== null);
  });

  ipcMain.handle(
    'media:generateThumbnail',
    async (_event, asset: Pick<MediaAsset, 'id' | 'filePath' | 'type' | 'duration'>) => {
      if (asset.type === 'audio') return null;

      await mkdir(thumbnailDir(), { recursive: true });
      const outputPath = join(thumbnailDir(), `${asset.id}.jpg`);

      try {
        await access(outputPath);
        return outputPath;
      } catch {
        // Doesn't exist yet - fall through and generate it.
      }

      const seek = asset.type === 'video' ? Math.min(1, asset.duration / 2) : undefined;
      try {
        await generateThumbnail(asset.filePath, outputPath, seek);
        return outputPath;
      } catch (err) {
        console.warn(`Failed to generate thumbnail for ${asset.filePath}:`, err);
        return null;
      }
    },
  );

  ipcMain.handle(
    'media:generateWaveform',
    async (_event, asset: Pick<MediaAsset, 'id' | 'filePath' | 'type'>) => {
      // Only audio-type assets ever show a waveform (ClipBlock.tsx renders it
      // only for clips on audio tracks) - skip video/image to avoid a wasted
      // full ffmpeg PCM decode + disk write with no consumer.
      if (asset.type !== 'audio') return null;

      await mkdir(waveformDir(), { recursive: true });
      const outputPath = join(waveformDir(), `${asset.id}.json`);

      try {
        await access(outputPath);
        return outputPath;
      } catch {
        // Doesn't exist yet - fall through and generate it.
      }

      try {
        const peaks = await extractWaveformPeaks(asset.filePath);
        await writeFile(outputPath, JSON.stringify(peaks));
        return outputPath;
      } catch (err) {
        console.warn(`Failed to generate waveform for ${asset.filePath}:`, err);
        return null;
      }
    },
  );
}
