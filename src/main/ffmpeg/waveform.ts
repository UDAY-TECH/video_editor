import { spawn } from 'child_process';
import { getFfmpegPath } from './binaries';

// Fixed peak count regardless of source duration (standard practice for
// waveform display, e.g. audiowaveform/wavesurfer.js) — the renderer maps
// this fixed-resolution array proportionally onto however many timeline
// pixels the clip currently occupies, so it stays correct across zoom/trim
// without needing to regenerate anything.
export const WAVEFORM_SAMPLE_RATE = 8000;
export const WAVEFORM_PEAK_COUNT = 1000;

export function buildWaveformArgs(inputPath: string): string[] {
  return ['-i', inputPath, '-ac', '1', '-ar', String(WAVEFORM_SAMPLE_RATE), '-f', 's16le', '-acodec', 'pcm_s16le', '-'];
}

export function computePeaksFromPCM(buffer: Buffer, peakCount: number): number[] {
  if (peakCount <= 0) return [];
  const sampleCount = Math.floor(buffer.length / 2);
  if (sampleCount === 0) return new Array(peakCount).fill(0);

  const samplesPerPeak = Math.max(1, Math.floor(sampleCount / peakCount));
  const peaks: number[] = [];
  for (let i = 0; i < peakCount; i++) {
    const start = i * samplesPerPeak;
    if (start >= sampleCount) {
      peaks.push(0);
      continue;
    }
    const end = Math.min(start + samplesPerPeak, sampleCount);
    let max = 0;
    for (let j = start; j < end; j++) {
      const sample = Math.abs(buffer.readInt16LE(j * 2));
      if (sample > max) max = sample;
    }
    peaks.push(max / 32768);
  }
  return peaks;
}

export function extractWaveformPeaks(
  inputPath: string,
  peakCount: number = WAVEFORM_PEAK_COUNT,
): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const proc = spawn(getFfmpegPath(), buildWaveformArgs(inputPath));
    const chunks: Buffer[] = [];
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on('data', (chunk) => (stderr += chunk));
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
        return;
      }
      resolve(computePeaksFromPCM(Buffer.concat(chunks), peakCount));
    });
  });
}
