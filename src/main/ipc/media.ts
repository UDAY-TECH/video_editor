import { ipcMain, dialog, app, BrowserWindow } from 'electron';
import { randomUUID } from 'crypto';
import { extname, join } from 'path';
import { access, mkdir, unlink, writeFile } from 'fs/promises';
import { runProbe, parseProbeOutput } from '../ffmpeg/probe';
import { generateThumbnail } from '../ffmpeg/thumbnail';
import { extractWaveformPeaks } from '../ffmpeg/waveform';
import { shouldGenerateProxy, buildProxyArgs } from '../ffmpeg/proxy';
import { runExport, type ExportRun } from '../ffmpeg/runExport';
import type { MediaAsset } from '../../shared/types';
import type { ProxyStartResult } from '../../shared/api';

const activeProxyJobs = new Map<string, ExportRun>();
// Tracked separately from activeProxyJobs (which is keyed by jobId) so a
// second generateProxy call for the same asset - e.g. reopening the same
// project twice before the first proxy finishes - doesn't kick off a
// duplicate ffmpeg encode racing to write the same output file.
const activeProxyAssetIds = new Set<string>();

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

function proxyDir(): string {
  return join(app.getPath('userData'), 'proxies');
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

  ipcMain.handle('media:importLut', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'LUT files', extensions: ['cube'] }],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle(
    'media:generateProxy',
    async (
      event,
      asset: Pick<MediaAsset, 'id' | 'filePath' | 'type' | 'duration' | 'resolution'>,
    ): Promise<ProxyStartResult> => {
      if (asset.type !== 'video' || !shouldGenerateProxy(asset.resolution)) {
        return { jobId: null, proxyPath: null };
      }

      await mkdir(proxyDir(), { recursive: true });
      const outputPath = join(proxyDir(), `${asset.id}.mp4`);

      try {
        await access(outputPath);
        return { jobId: null, proxyPath: outputPath };
      } catch {
        // Doesn't exist yet - fall through and generate it.
      }

      if (activeProxyAssetIds.has(asset.id)) {
        // Already generating (from an earlier call for this asset) - the
        // caller that started it will broadcast media:proxyComplete/Error,
        // which mediaBinStore's pendingProxyAssetIds tracks by assetId, so
        // this caller doesn't need its own jobId to see the indicator clear.
        return { jobId: null, proxyPath: null };
      }
      activeProxyAssetIds.add(asset.id);

      const jobId = randomUUID();
      const win = BrowserWindow.fromWebContents(event.sender);

      void (async () => {
        try {
          const args = buildProxyArgs(asset.filePath, outputPath);
          const run = runExport(args, asset.duration, () => {
            // No progress UI for proxies in v1 - only completion/error matter.
          });
          activeProxyJobs.set(jobId, run);
          await run.promise;
          activeProxyJobs.delete(jobId);
          activeProxyAssetIds.delete(asset.id);
          if (win && !win.isDestroyed()) {
            win.webContents.send('media:proxyComplete', { jobId, assetId: asset.id, proxyPath: outputPath });
          }
        } catch (err) {
          activeProxyJobs.delete(jobId);
          activeProxyAssetIds.delete(asset.id);
          // A canceled/failed encode can leave a truncated file behind -
          // delete it so the next access() check above doesn't treat it as
          // a valid cached proxy.
          await unlink(outputPath).catch(() => {});
          if (win && !win.isDestroyed()) {
            win.webContents.send('media:proxyError', {
              jobId,
              assetId: asset.id,
              message: (err as Error).message,
            });
          }
        }
      })();

      return { jobId, proxyPath: null };
    },
  );
}

// Mirrors cancelAllExportJobs (see ipc/export.ts) - called right before the
// app is actually allowed to close/quit, so an in-progress proxy encode
// doesn't get orphaned running in the background after the window is gone.
export function cancelAllProxyJobs(): void {
  for (const job of activeProxyJobs.values()) job.cancel();
  activeProxyJobs.clear();
}
