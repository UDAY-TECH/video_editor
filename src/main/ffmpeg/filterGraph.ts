import type { Clip, ExportSettings, MediaAsset, Track, TextClipContent } from '../../shared/types';
import { buildQualityArgs } from './encoder';

// Deliberately reimplemented rather than imported from renderer/engine/timelineMath -
// main should not depend on renderer code (see src/main vs src/renderer module
// boundary in the architecture doc). These two are tiny and stable.
function sortedClips(track: Track): Clip[] {
  return [...track.clips].sort((a, b) => a.startTime - b.startTime);
}

function getTimelineEnd(tracks: Track[]): number {
  let max = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      max = Math.max(max, clip.startTime + clip.duration);
    }
  }
  return max;
}

// Rounds to 6 decimals and strips trailing zeros, so generated filter strings
// are both valid ffmpeg syntax and stable/predictable in tests.
function formatNum(n: number): string {
  return Number(n.toFixed(6)).toString();
}

// Windows paths use `\` and a drive-letter `:`, both special to ffmpeg's
// filtergraph mini-language. Converting backslashes to forward slashes
// (which Windows accepts natively) still leaves the drive-letter colon,
// which - verified empirically against a real ffmpeg build - needs a
// backslash escape even when the whole value is single-quoted (quoting
// alone does not protect it for path-valued options like lut3d's `file` or
// drawtext's `fontfile`).
export function ffmpegPath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  return `'${normalized}'`;
}

export function ffmpegText(text: string): string {
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/\n/g, '\\n');
  return `'${escaped}'`;
}

// ---------------------------------------------------------------------------
// Inputs: every non-text clip gets its own `-i` (even if several clips share
// the same source file with different trims), so a clip's assigned input
// index is just its position in this array.
// ---------------------------------------------------------------------------

export interface ClipInput {
  clip: Clip;
  asset: MediaAsset;
  args: string[];
}

function buildInputArgs(clip: Clip, asset: MediaAsset): string[] {
  if (asset.type === 'image') {
    return ['-loop', '1', '-t', formatNum(clip.duration), '-i', asset.filePath];
  }
  // Reads exactly the source span the compositor's own clipSourceTime formula
  // would (sourceIn + localTime*speed, for localTime up to `duration`), so a
  // speed-adjusted clip's timeline-facing playback matches the preview.
  const sourceSpan = clip.duration * clip.speed;
  return ['-ss', formatNum(clip.sourceIn), '-t', formatNum(sourceSpan), '-i', asset.filePath];
}

// Fast (input-level) seeking is used for -ss, which is keyframe-approximate
// rather than frame-exact for long-GOP sources - an accepted v1 accuracy
// tradeoff in exchange for much faster exports; frame-exact seeking would
// need decoding from the nearest keyframe and discarding leading frames.
export function buildClipInputs(tracks: Track[], assets: MediaAsset[]): ClipInput[] {
  const inputs: ClipInput[] = [];
  for (const track of tracks) {
    for (const clip of sortedClips(track)) {
      if (clip.text) continue;
      const asset = assets.find((a) => a.id === clip.mediaAssetId);
      if (!asset) continue;
      inputs.push({ clip, asset, args: buildInputArgs(clip, asset) });
    }
  }
  return inputs;
}

export function buildClipInputIndex(clipInputs: ClipInput[]): Map<string, number> {
  return new Map(clipInputs.map((input, index) => [input.clip.id, index]));
}

// ---------------------------------------------------------------------------
// Video clip processing (Section 5.9 step 2): trim/speed -> scale/transform
// -> color correction -> LUT. Static values only - keyframe animation and
// per-clip effects beyond color correction are a documented v1 export
// limitation (see docs/manual-tests/phase-9.md).
// ---------------------------------------------------------------------------

export interface VideoClipFilterResult {
  filters: string[];
  frameSize: { width: number; height: number };
}

export function buildVideoClipFilterChain(
  clip: Clip,
  asset: MediaAsset,
  inputIndex: number,
  projectResolution: { width: number; height: number },
  outputLabel: string,
): VideoClipFilterResult {
  const steps: string[] = [];

  const speedSuffix = clip.speed !== 1 ? `/${formatNum(clip.speed)}` : '';
  steps.push(`setpts=(PTS-STARTPTS)${speedSuffix}+${formatNum(clip.startTime)}/TB`);

  // Fit-not-stretch, matching PreviewPlayer's drawLayer fitScale, then the
  // clip's own transform.scale on top.
  const natural = asset.resolution ?? projectResolution;
  const fitScale = Math.min(projectResolution.width / natural.width, projectResolution.height / natural.height);
  const scale = fitScale * clip.transform.scale;
  const scaledW = Math.max(2, Math.round(natural.width * scale));
  const scaledH = Math.max(2, Math.round(natural.height * scale));
  steps.push(`scale=${scaledW}:${scaledH}`);
  steps.push('format=yuva420p');

  // Bounding box computed here in JS (not ffmpeg's rotw()/roth() expressions)
  // so the overlay positioning math in buildVideoFilterGraph always agrees
  // with the frame size this chain actually produces.
  let frameW = scaledW;
  let frameH = scaledH;
  if (clip.transform.rotation !== 0) {
    const radians = (clip.transform.rotation * Math.PI) / 180;
    frameW = Math.max(2, Math.round(Math.abs(scaledW * Math.cos(radians)) + Math.abs(scaledH * Math.sin(radians))));
    frameH = Math.max(2, Math.round(Math.abs(scaledW * Math.sin(radians)) + Math.abs(scaledH * Math.cos(radians))));
    steps.push(`rotate=${formatNum(radians)}:ow=${frameW}:oh=${frameH}:fillcolor=black@0.0`);
  }

  if (clip.transform.opacity !== 1) {
    steps.push(`colorchannelmixer=aa=${formatNum(clip.transform.opacity)}`);
  }

  const cc = clip.colorCorrection;
  if (cc.brightness !== 0 || cc.contrast !== 0 || cc.saturation !== 0) {
    const b = formatNum(cc.brightness / 100);
    const c = formatNum(1 + cc.contrast / 100);
    const s = formatNum(Math.max(0, 1 + cc.saturation / 100));
    steps.push(`eq=brightness=${b}:contrast=${c}:saturation=${s}`);
  }
  if (cc.exposure !== 0) {
    steps.push(`exposure=exposure=${formatNum(cc.exposure)}`);
  }

  const filters: string[] = [];
  const preLutLabel = cc.lutPath ? `${outputLabel}pre` : outputLabel;
  filters.push(`[${inputIndex}:v]${steps.join(',')}[${preLutLabel}]`);

  if (cc.lutPath) {
    const lutFile = ffmpegPath(cc.lutPath);
    const intensity = formatNum(Math.max(0, Math.min(1, cc.lutIntensity)));
    filters.push(`[${preLutLabel}]split=2[${outputLabel}a][${outputLabel}b]`);
    filters.push(`[${outputLabel}b]lut3d=file=${lutFile}[${outputLabel}graded]`);
    filters.push(
      `[${outputLabel}a][${outputLabel}graded]blend=all_expr='A*(1-${intensity})+B*${intensity}'[${outputLabel}]`,
    );
  }

  return { filters, frameSize: { width: frameW, height: frameH } };
}

// ---------------------------------------------------------------------------
// Text clips: drawn directly onto the running trunk via drawtext (no
// separate input needed). Position follows the clip's transform.x/y like
// media layers do, but rotation/scale aren't supported by drawtext and are a
// documented v1 limitation, as are entrance/exit animations.
// ---------------------------------------------------------------------------

// Bundled ffmpeg builds are typically compiled without fontconfig, so
// drawtext's `font=` name lookup isn't reliable - map the app's fixed font
// list (see PropertiesPanel's FONT_FAMILIES) to actual Windows font files.
const WINDOWS_FONT_FILES: Record<string, string> = {
  Arial: 'arial.ttf',
  Helvetica: 'arial.ttf',
  'Times New Roman': 'times.ttf',
  Georgia: 'georgia.ttf',
  'Courier New': 'cour.ttf',
  Verdana: 'verdana.ttf',
  Impact: 'impact.ttf',
  'Comic Sans MS': 'comic.ttf',
};

export function resolveFontFile(fontFamily: string): string {
  return `C:/Windows/Fonts/${WINDOWS_FONT_FILES[fontFamily] ?? 'arial.ttf'}`;
}

function textXExpr(align: TextClipContent['align']): string {
  if (align === 'left') return '20';
  if (align === 'right') return 'w-text_w-20';
  return '(w-text_w)/2';
}

export function buildDrawTextFilter(clip: Clip): string {
  const text = clip.text as TextClipContent;
  const xBase = textXExpr(text.align);
  const x = clip.transform.x !== 0 ? `${xBase}+${formatNum(clip.transform.x)}` : xBase;
  const y = clip.transform.y !== 0 ? `(h-text_h)/2+${formatNum(clip.transform.y)}` : '(h-text_h)/2';
  const clipEnd = clip.startTime + clip.duration;

  const parts = [
    `fontfile=${ffmpegPath(resolveFontFile(text.fontFamily))}`,
    `text=${ffmpegText(text.content)}`,
    `fontsize=${Math.round(text.fontSize)}`,
    `fontcolor=${text.color}`,
    `x=${x}`,
    `y=${y}`,
  ];
  if (clip.transform.opacity !== 1) parts.push(`alpha=${formatNum(clip.transform.opacity)}`);
  parts.push(`enable='between(t,${formatNum(clip.startTime)},${formatNum(clipEnd)})'`);
  return `drawtext=${parts.join(':')}`;
}

// ---------------------------------------------------------------------------
// Video compositing: tracks stack bottom (lowest index) to top, each clip
// overlaid onto a running "trunk" stream restricted to its own timeline
// window via overlay's enable=between(). A clip's own transitionIn/
// transitionOut are intentionally not reproduced (renders as a hard cut) -
// the most complex remaining piece of Section 5.9, deferred to a future pass.
// ---------------------------------------------------------------------------

export interface FilterGraphResult {
  filters: string[];
  outputLabel: string;
}

export function buildVideoFilterGraph(
  tracks: Track[],
  assets: MediaAsset[],
  settings: ExportSettings,
  clipInputIndex: Map<string, number>,
): FilterGraphResult {
  const { width, height } = settings.resolution;
  const duration = Math.max(getTimelineEnd(tracks), 1 / settings.fps);
  const filters: string[] = [];
  let trunk = 'base';
  filters.push(`color=c=black:s=${width}x${height}:r=${settings.fps}:d=${formatNum(duration)}[${trunk}]`);

  const videoTracks = tracks.filter((t) => t.type === 'video').sort((a, b) => a.index - b.index);
  let counter = 0;
  for (const track of videoTracks) {
    for (const clip of sortedClips(track)) {
      const nextTrunk = `t${counter}`;

      if (clip.text) {
        filters.push(`[${trunk}]${buildDrawTextFilter(clip)}[${nextTrunk}]`);
        trunk = nextTrunk;
        counter++;
        continue;
      }

      const asset = assets.find((a) => a.id === clip.mediaAssetId);
      const inputIndex = clipInputIndex.get(clip.id);
      if (!asset || inputIndex === undefined) continue;

      const clipLabel = `c${counter}`;
      const { filters: clipFilters, frameSize } = buildVideoClipFilterChain(
        clip,
        asset,
        inputIndex,
        { width, height },
        clipLabel,
      );
      filters.push(...clipFilters);

      const overlayX = Math.round(width / 2 + clip.transform.x - frameSize.width / 2);
      const overlayY = Math.round(height / 2 + clip.transform.y - frameSize.height / 2);
      const clipEnd = clip.startTime + clip.duration;
      filters.push(
        `[${trunk}][${clipLabel}]overlay=x=${overlayX}:y=${overlayY}:enable='between(t,${formatNum(clip.startTime)},${formatNum(clipEnd)})'[${nextTrunk}]`,
      );
      trunk = nextTrunk;
      counter++;
    }
  }

  return { filters, outputLabel: trunk };
}

// ---------------------------------------------------------------------------
// Audio mixing (Section 5.9 step 5): static per-clip volume and per-track
// mute/solo only - keyframed volume automation and ducking rules are a
// documented v1 export limitation (see docs/manual-tests/phase-9.md). A video
// clip's own embedded audio is intentionally excluded too, carrying forward
// the same scope cut PreviewPlayer made in Phase 7.
// ---------------------------------------------------------------------------

export function isTrackAudibleForExport(track: Track, tracks: Track[]): boolean {
  if (track.muted) return false;
  const anySoloedAudioTrack = tracks.some((t) => t.type === 'audio' && t.solo);
  return anySoloedAudioTrack ? track.solo : true;
}

// atempo only accepts [0.5, 2.0] per stage - chain multiple stages to cover
// any positive speed factor outside that range.
export function buildAtempoChain(speed: number): string[] {
  if (speed === 1) return [];
  const filters: string[] = [];
  let remaining = speed;
  if (remaining > 2) {
    while (remaining > 2) {
      filters.push('atempo=2.0');
      remaining /= 2;
    }
  } else if (remaining < 0.5) {
    while (remaining < 0.5) {
      filters.push('atempo=0.5');
      remaining /= 0.5;
    }
  }
  filters.push(`atempo=${formatNum(remaining)}`);
  return filters;
}

function buildAudioClipFilterChain(clip: Clip, inputIndex: number, outputLabel: string): string {
  const steps = ['aformat=sample_fmts=fltp:channel_layouts=stereo', ...buildAtempoChain(clip.speed)];
  if (clip.volume !== 1) steps.push(`volume=${formatNum(clip.volume)}`);
  const delayMs = Math.round(clip.startTime * 1000);
  if (delayMs > 0) steps.push(`adelay=${delayMs}|${delayMs}`);
  return `[${inputIndex}:a]${steps.join(',')}[${outputLabel}]`;
}

export interface AudioFilterGraphResult {
  filters: string[];
  outputLabel: string | null;
}

export function buildAudioFilterGraph(
  tracks: Track[],
  assets: MediaAsset[],
  clipInputIndex: Map<string, number>,
): AudioFilterGraphResult {
  const audioTracks = tracks.filter((t) => t.type === 'audio');
  const filters: string[] = [];
  const mixLabels: string[] = [];
  let counter = 0;

  for (const track of audioTracks) {
    if (!isTrackAudibleForExport(track, tracks)) continue;
    for (const clip of sortedClips(track)) {
      const asset = assets.find((a) => a.id === clip.mediaAssetId);
      const inputIndex = clipInputIndex.get(clip.id);
      if (!asset || inputIndex === undefined) continue;

      const label = `a${counter}`;
      filters.push(buildAudioClipFilterChain(clip, inputIndex, label));
      mixLabels.push(label);
      counter++;
    }
  }

  if (mixLabels.length === 0) return { filters, outputLabel: null };
  if (mixLabels.length === 1) return { filters, outputLabel: mixLabels[0] };

  const mixInputs = mixLabels.map((label) => `[${label}]`).join('');
  // normalize=0: each clip's loudness is already deliberately set via its own
  // volume - amix's default auto-attenuation-by-input-count would otherwise
  // needlessly quiet everything.
  filters.push(`${mixInputs}amix=inputs=${mixLabels.length}:duration=longest:normalize=0[mix]`);
  return { filters, outputLabel: 'mix' };
}

// ---------------------------------------------------------------------------
// Full command assembly.
// ---------------------------------------------------------------------------

function audioCodecFor(container: ExportSettings['container']): string {
  return container === 'webm' ? 'libopus' : 'aac';
}

export function buildExportCommand(
  project: { tracks: Track[]; mediaAssets: MediaAsset[] },
  settings: ExportSettings,
  videoEncoder: string,
): string[] {
  const clipInputs = buildClipInputs(project.tracks, project.mediaAssets);
  const clipInputIndex = buildClipInputIndex(clipInputs);

  const video = buildVideoFilterGraph(project.tracks, project.mediaAssets, settings, clipInputIndex);
  const audio = buildAudioFilterGraph(project.tracks, project.mediaAssets, clipInputIndex);

  const args: string[] = ['-y'];
  for (const input of clipInputs) args.push(...input.args);

  const filterComplex = [...video.filters, ...audio.filters].join(';');
  args.push('-filter_complex', filterComplex);
  args.push('-map', `[${video.outputLabel}]`);
  if (audio.outputLabel) args.push('-map', `[${audio.outputLabel}]`);

  args.push('-c:v', videoEncoder, ...buildQualityArgs(videoEncoder, settings.quality));
  args.push('-r', String(settings.fps));
  args.push('-pix_fmt', 'yuv420p');
  if (audio.outputLabel) args.push('-c:a', audioCodecFor(settings.container), '-b:a', '192k');
  if (settings.container !== 'webm') args.push('-movflags', '+faststart');
  args.push(settings.outputPath);

  return args;
}

export function getExportDuration(tracks: Track[]): number {
  return getTimelineEnd(tracks);
}
