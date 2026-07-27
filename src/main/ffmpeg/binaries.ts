import { app } from 'electron';
import { join } from 'path';

// In dev these are inlined by electron.vite.config.ts (define) from
// ffmpeg-static/ffprobe-static. In a packaged build the binaries ship under
// resources/bin via electron-builder's extraResources (see electron-builder.yml).
declare const __FFMPEG_DEV_PATH__: string;
declare const __FFPROBE_DEV_PATH__: string;

export function getFfmpegPath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'bin', 'ffmpeg.exe') : __FFMPEG_DEV_PATH__;
}

export function getFfprobePath(): string {
  return app.isPackaged ? join(process.resourcesPath, 'bin', 'ffprobe.exe') : __FFPROBE_DEV_PATH__;
}
