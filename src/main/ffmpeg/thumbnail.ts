import { spawn } from 'child_process';
import { getFfmpegPath } from './binaries';

export function buildThumbnailArgs(
  inputPath: string,
  outputPath: string,
  seekSeconds?: number,
): string[] {
  const args: string[] = [];
  if (typeof seekSeconds === 'number' && seekSeconds > 0) {
    args.push('-ss', seekSeconds.toFixed(2));
  }
  args.push('-i', inputPath, '-frames:v', '1', '-vf', 'scale=320:-1', '-y', outputPath);
  return args;
}

export function generateThumbnail(
  inputPath: string,
  outputPath: string,
  seekSeconds?: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), buildThumbnailArgs(inputPath, outputPath, seekSeconds));
    let stderr = '';
    proc.stderr.on('data', (chunk) => (stderr += chunk));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
      else resolve();
    });
  });
}
