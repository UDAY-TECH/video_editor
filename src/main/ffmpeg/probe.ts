import { spawn } from 'child_process';
import { getFfprobePath } from './binaries';

export interface FfprobeStream {
  codec_type: string;
  width?: number;
  height?: number;
}

export interface FfprobeOutput {
  format?: { duration?: string };
  streams?: FfprobeStream[];
}

export function buildProbeArgs(filePath: string): string[] {
  return ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath];
}

export function parseProbeOutput(json: FfprobeOutput): {
  duration: number;
  resolution?: { width: number; height: number };
} {
  const duration = json.format?.duration ? parseFloat(json.format.duration) : 0;
  const videoStream = json.streams?.find((s) => s.codec_type === 'video');
  const resolution =
    videoStream?.width && videoStream?.height
      ? { width: videoStream.width, height: videoStream.height }
      : undefined;
  return { duration: Number.isFinite(duration) ? duration : 0, resolution };
}

export function runProbe(filePath: string): Promise<FfprobeOutput> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfprobePath(), buildProbeArgs(filePath));
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk) => (stdout += chunk));
    proc.stderr.on('data', (chunk) => (stderr += chunk));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(stdout));
      } catch (err) {
        reject(err);
      }
    });
  });
}
