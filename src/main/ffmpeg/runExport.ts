import { spawn } from 'child_process';
import { getFfmpegPath } from './binaries';

export interface FfmpegProgress {
  percent: number;
  outTimeSeconds: number;
  speed: number | null;
  done: boolean;
}

// Parses ONE complete `-progress pipe:1` block: a run of `key=value` lines
// ending with the `progress=continue`/`progress=end` line that terminates
// each update ffmpeg emits.
export function parseProgressBlock(block: string, totalDurationSeconds: number): FfmpegProgress {
  const fields: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }

  const outTimeUs = fields['out_time_us'] ? parseInt(fields['out_time_us'], 10) : NaN;
  const outTimeSeconds = Number.isFinite(outTimeUs) ? Math.max(0, outTimeUs) / 1_000_000 : 0;
  const done = fields['progress'] === 'end';
  const rawPercent = totalDurationSeconds > 0 ? (outTimeSeconds / totalDurationSeconds) * 100 : 0;
  const percent = done ? 100 : Math.max(0, Math.min(100, rawPercent));

  const parsedSpeed = fields['speed'] ? parseFloat(fields['speed']) : NaN;
  const speed = Number.isFinite(parsedSpeed) ? parsedSpeed : null;

  return { percent, outTimeSeconds, speed, done };
}

// Buffers a raw stdout stream (fed chunk by chunk, since chunk boundaries
// don't align with progress-block boundaries) and invokes onProgress once
// per complete block.
export class FfmpegProgressParser {
  private buffer = '';
  private pendingLines: string[] = [];

  constructor(
    private readonly totalDurationSeconds: number,
    private readonly onProgress: (progress: FfmpegProgress) => void,
  ) {}

  feed(chunk: string): void {
    this.buffer += chunk;
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex);
      this.buffer = this.buffer.slice(newlineIndex + 1);
      this.pendingLines.push(line);
      if (line.startsWith('progress=')) {
        this.onProgress(parseProgressBlock(this.pendingLines.join('\n'), this.totalDurationSeconds));
        this.pendingLines = [];
      }
    }
  }
}

export interface ExportRun {
  promise: Promise<void>;
  cancel: () => void;
}

// Spawns ffmpeg with the given args (as produced by buildExportCommand),
// inserting `-progress pipe:1` just before the output path so progress lines
// arrive on stdout without polluting the encode's own stderr logging. Not
// unit-testable (real process spawning) - covered by a manual smoke test and
// the manual test checklist instead, same as the other ffmpeg spawn wrappers.
export function runExport(
  args: string[],
  totalDurationSeconds: number,
  onProgress: (progress: FfmpegProgress) => void,
): ExportRun {
  const outputPath = args[args.length - 1];
  const withProgress = [...args.slice(0, -1), '-progress', 'pipe:1', '-nostats', outputPath];

  const proc = spawn(getFfmpegPath(), withProgress);
  const parser = new FfmpegProgressParser(totalDurationSeconds, onProgress);
  let stderrTail = '';
  let canceled = false;

  proc.stdout.on('data', (chunk: Buffer) => parser.feed(chunk.toString()));
  proc.stderr.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-4000);
  });

  const promise = new Promise<void>((resolve, reject) => {
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (canceled) {
        reject(new Error('Export canceled'));
        return;
      }
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}: ${stderrTail}`));
        return;
      }
      resolve();
    });
  });

  return {
    promise,
    cancel: () => {
      canceled = true;
      proc.kill();
    },
  };
}
