import { describe, it, expect } from 'vitest';
import { parseEncodersOutput, pickVideoEncoder, isHardwareEncoder, buildQualityArgs } from './encoder';

const SAMPLE_ENCODERS_OUTPUT = `Encoders:
 V..... = Video
 A..... = Audio
 S..... = Subtitle
 .F.... = Frame-level multithreading
 ..S... = Slice-level multithreading
 ...X.. = Codec is experimental
 ....B. = Supports draw_horiz_band
 .....D = Supports direct rendering method 1
 ------
 V..... libx264              libx264 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (codec h264)
 V..... h264_nvenc           NVIDIA NVENC H.264 encoder (codec h264)
 V..... libx265              libx265 H.265 / HEVC (codec hevc)
 V..... libvpx-vp9           libvpx VP9 (codec vp9)
 A..... aac                  AAC (Advanced Audio Coding)
`;

describe('parseEncodersOutput', () => {
  it('extracts encoder names, skipping the header/legend lines', () => {
    const encoders = parseEncodersOutput(SAMPLE_ENCODERS_OUTPUT);
    expect(encoders.has('libx264')).toBe(true);
    expect(encoders.has('h264_nvenc')).toBe(true);
    expect(encoders.has('libx265')).toBe(true);
    expect(encoders.has('libvpx-vp9')).toBe(true);
    expect(encoders.has('aac')).toBe(true);
    expect(encoders.has('Encoders:')).toBe(false);
    expect(encoders.has('Video')).toBe(false);
  });

  it('returns an empty set for empty input', () => {
    expect(parseEncodersOutput('').size).toBe(0);
  });
});

describe('pickVideoEncoder', () => {
  it('prefers NVENC when available for h264', () => {
    const available = new Set(['libx264', 'h264_nvenc', 'h264_qsv']);
    expect(pickVideoEncoder('h264', available)).toBe('h264_nvenc');
  });

  it('falls back to QSV when NVENC is unavailable', () => {
    const available = new Set(['libx264', 'h264_qsv']);
    expect(pickVideoEncoder('h264', available)).toBe('h264_qsv');
  });

  it('falls back to the software encoder when no hardware encoder is available', () => {
    const available = new Set(['libx264']);
    expect(pickVideoEncoder('h264', available)).toBe('libx264');
  });

  it('always uses the software encoder for vp9', () => {
    const available = new Set(['libvpx-vp9']);
    expect(pickVideoEncoder('vp9', available)).toBe('libvpx-vp9');
  });

  it('prefers hevc_nvenc for h265 when available', () => {
    const available = new Set(['libx265', 'hevc_nvenc']);
    expect(pickVideoEncoder('h265', available)).toBe('hevc_nvenc');
  });
});

describe('isHardwareEncoder', () => {
  it('identifies nvenc and qsv encoders as hardware', () => {
    expect(isHardwareEncoder('h264_nvenc')).toBe(true);
    expect(isHardwareEncoder('hevc_qsv')).toBe(true);
  });

  it('identifies software encoders as not hardware', () => {
    expect(isHardwareEncoder('libx264')).toBe(false);
    expect(isHardwareEncoder('libvpx-vp9')).toBe(false);
  });
});

describe('buildQualityArgs', () => {
  it('builds bitrate args regardless of encoder', () => {
    expect(buildQualityArgs('libx264', { mode: 'bitrate', kbps: 8000 })).toEqual(['-b:v', '8000k']);
    expect(buildQualityArgs('h264_nvenc', { mode: 'bitrate', kbps: 8000 })).toEqual(['-b:v', '8000k']);
  });

  it('builds CRF+preset args for a software encoder', () => {
    expect(buildQualityArgs('libx264', { mode: 'crf', value: 23 })).toEqual(['-crf', '23', '-preset', 'medium']);
  });

  it('builds NVENC-specific constant-quality args', () => {
    expect(buildQualityArgs('h264_nvenc', { mode: 'crf', value: 23 })).toEqual(['-rc', 'vbr', '-cq', '23']);
  });

  it('builds QSV-specific constant-quality args', () => {
    expect(buildQualityArgs('h264_qsv', { mode: 'crf', value: 23 })).toEqual(['-global_quality', '23']);
  });

  it('builds libvpx-vp9 constant-quality args with -b:v 0', () => {
    expect(buildQualityArgs('libvpx-vp9', { mode: 'crf', value: 31 })).toEqual(['-crf', '31', '-b:v', '0']);
  });
});
