// Section 5.2/6: a 4K+ source can stutter during scrubbing at full
// resolution - only footage above this width gets a proxy; anything at or
// below 1080p decodes comfortably already, so generating one would just
// burn CPU/disk for no scrubbing benefit.
export const PROXY_RESOLUTION_THRESHOLD_WIDTH = 1920;
export const PROXY_TARGET_WIDTH = 960;

export function shouldGenerateProxy(resolution: { width: number; height: number } | undefined): boolean {
  return !!resolution && resolution.width > PROXY_RESOLUTION_THRESHOLD_WIDTH;
}

// Deliberately simple and fast rather than high-quality: a proxy only needs
// to be good enough for scrubbing/preview (it's never used for export - see
// filterGraph.ts's buildClipInputs, which always reads MediaAsset.filePath).
// -preset veryfast keeps generation itself quick, which matters more here
// than for the export pipeline's own quality-focused encode.
export function buildProxyArgs(inputPath: string, outputPath: string): string[] {
  return [
    '-y',
    '-i',
    inputPath,
    '-vf',
    `scale=${PROXY_TARGET_WIDTH}:-2`,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '28',
    '-c:a',
    'aac',
    '-b:a',
    '128k',
    outputPath,
  ];
}
