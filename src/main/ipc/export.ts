import { ipcMain, BrowserWindow, dialog } from 'electron';
import { randomUUID } from 'crypto';
import type { ProjectFile, ExportSettings, ExportContainer } from '../../shared/types';
import type { ExportStartResult } from '../../shared/api';
import { detectAvailableEncoders, pickVideoEncoder } from '../ffmpeg/encoder';
import { buildExportCommand, getExportDuration } from '../ffmpeg/filterGraph';
import { runExport, type ExportRun } from '../ffmpeg/runExport';

const activeJobs = new Map<string, ExportRun>();

export function registerExportIpc(): void {
  ipcMain.handle(
    'export:pickOutputPath',
    async (event, defaultName: string, container: ExportContainer): Promise<string | null> => {
      const win = BrowserWindow.fromWebContents(event.sender);
      const options = {
        defaultPath: `${defaultName}.${container}`,
        filters: [{ name: container.toUpperCase(), extensions: [container] }],
      };
      const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
      if (result.canceled || !result.filePath) return null;
      return result.filePath;
    },
  );

  ipcMain.handle(
    'export:start',
    async (event, project: ProjectFile, settings: ExportSettings): Promise<ExportStartResult> => {
      const jobId = randomUUID();
      const win = BrowserWindow.fromWebContents(event.sender);

      // Kicks off in the background and returns jobId immediately (below) -
      // the renderer polls progress via jobId-tagged events rather than
      // awaiting the whole export, keeping the UI responsive per Section 5.8.
      void (async () => {
        try {
          const availableEncoders = await detectAvailableEncoders();
          const videoEncoder = pickVideoEncoder(settings.codec, availableEncoders);
          const args = buildExportCommand(project, settings, videoEncoder);
          const totalDuration = getExportDuration(project.tracks);

          const run = runExport(args, totalDuration, (progress) => {
            win?.webContents.send('export:progress', {
              jobId,
              percent: progress.percent,
              message: progress.speed ? `${progress.speed.toFixed(2)}x` : 'Encoding...',
            });
          });
          activeJobs.set(jobId, run);
          await run.promise;
          activeJobs.delete(jobId);
          win?.webContents.send('export:complete', { jobId, outputPath: settings.outputPath });
        } catch (err) {
          activeJobs.delete(jobId);
          win?.webContents.send('export:error', { jobId, message: (err as Error).message });
        }
      })();

      return { jobId };
    },
  );

  ipcMain.on('export:cancel', (_event, jobId: string) => {
    activeJobs.get(jobId)?.cancel();
    activeJobs.delete(jobId);
  });
}

// Called right before the app is actually allowed to close/quit, so an
// in-progress export's ffmpeg child process doesn't get orphaned running in
// the background after the window is gone.
export function cancelAllExportJobs(): void {
  for (const job of activeJobs.values()) job.cancel();
  activeJobs.clear();
}
