import { spawn } from 'child_process';
import { getFfmpegPath } from './binaries';
import type { ExportCodec, ExportQuality } from '../../shared/types';

// Parses `ffmpeg -encoders` output. Lines listing an encoder look like:
//   " V..... libx264              libx264 H.264 / AVC / MPEG-4 AVC ..."
//   " V..... h264_nvenc           NVIDIA NVENC H.264 encoder"
// preceded by a header/legend block that doesn't match this shape.
export function parseEncodersOutput(stdout: string): Set<string> {
  const names = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s*[VAS][A-Z.]{5}\s+(\S+)/.exec(line);
    if (match) names.add(match[1]);
  }
  return names;
}

const CODEC_CANDIDATES: Record<ExportCodec, { hardware: string[]; software: string }> = {
  h264: { hardware: ['h264_nvenc', 'h264_qsv'], software: 'libx264' },
  h265: { hardware: ['hevc_nvenc', 'hevc_qsv'], software: 'libx265' },
  // No commonly-available hardware VP9 encoder to prefer - always software.
  vp9: { hardware: [], software: 'libvpx-vp9' },
};

// Section 5.8: prefer a hardware encoder (NVENC, then QSV) when available,
// falling back to the software encoder for the requested codec otherwise.
export function pickVideoEncoder(codec: ExportCodec, availableEncoders: Set<string>): string {
  const candidates = CODEC_CANDIDATES[codec];
  for (const hardware of candidates.hardware) {
    if (availableEncoders.has(hardware)) return hardware;
  }
  return candidates.software;
}

export function isHardwareEncoder(encoderName: string): boolean {
  return encoderName.endsWith('_nvenc') || encoderName.endsWith('_qsv');
}

// Maps our quality setting onto the flags each encoder family actually
// understands - CRF isn't a universal concept (NVENC/QSV use their own
// constant-quality flags). Hardware-encoder flag choices here are a
// best-effort mapping based on documented ffmpeg conventions; they haven't
// been verified against real NVENC/QSV hardware.
export function buildQualityArgs(encoderName: string, quality: ExportQuality): string[] {
  if (quality.mode === 'bitrate') {
    return ['-b:v', `${quality.kbps}k`];
  }
  if (encoderName.endsWith('_nvenc')) {
    return ['-rc', 'vbr', '-cq', String(quality.value)];
  }
  if (encoderName.endsWith('_qsv')) {
    return ['-global_quality', String(quality.value)];
  }
  if (encoderName === 'libvpx-vp9') {
    // -b:v 0 switches libvpx-vp9 into constant-quality (CRF-only) mode.
    return ['-crf', String(quality.value), '-b:v', '0'];
  }
  return ['-crf', String(quality.value), '-preset', 'medium'];
}

export function buildEncodersProbeArgs(): string[] {
  return ['-hide_banner', '-encoders'];
}

// Never rejects - a failed detection just means "assume no hardware
// encoders," falling back to the always-available software encoder.
export function detectAvailableEncoders(): Promise<Set<string>> {
  return new Promise((resolve) => {
    const proc = spawn(getFfmpegPath(), buildEncodersProbeArgs());
    let stdout = '';
    proc.stdout.on('data', (chunk) => (stdout += chunk));
    proc.on('error', () => resolve(new Set()));
    proc.on('close', () => resolve(parseEncodersOutput(stdout)));
  });
}
