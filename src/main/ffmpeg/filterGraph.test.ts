import { describe, it, expect } from 'vitest';
import {
  ffmpegPath,
  ffmpegText,
  buildClipInputs,
  buildClipInputIndex,
  buildVideoClipFilterChain,
  buildDrawTextFilter,
  resolveFontFile,
  buildVideoFilterGraph,
  isTrackAudibleForExport,
  buildAtempoChain,
  buildAudioFilterGraph,
  buildExportCommand,
  getExportDuration,
} from './filterGraph';
import type { Clip, ExportSettings, MediaAsset, Track } from '../../shared/types';

function makeAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'asset-1',
    filePath: 'C:\\videos\\clip.mp4',
    type: 'video',
    duration: 10,
    resolution: { width: 1920, height: 1080 },
    ...overrides,
  };
}

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1',
    mediaAssetId: 'asset-1',
    trackId: 'track-1',
    startTime: 0,
    duration: 10,
    sourceIn: 0,
    sourceOut: 10,
    speed: 1,
    volume: 1,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
    keyframes: {},
    colorCorrection: { brightness: 0, contrast: 0, saturation: 0, exposure: 0, lutIntensity: 1 },
    ...overrides,
  };
}

function makeTrack(clips: Clip[], overrides: Partial<Track> = {}): Track {
  return { id: 'track-1', type: 'video', index: 0, muted: false, solo: false, locked: false, clips, ...overrides };
}

function makeSettings(overrides: Partial<ExportSettings> = {}): ExportSettings {
  return {
    outputPath: 'C:\\out\\video.mp4',
    container: 'mp4',
    codec: 'h264',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    quality: { mode: 'crf', value: 23 },
    ...overrides,
  };
}

describe('ffmpegPath / ffmpegText', () => {
  it('converts backslashes to forward slashes, escapes the drive-letter colon, and single-quotes the result', () => {
    expect(ffmpegPath('C:\\Users\\a.cube')).toBe("'C\\:/Users/a.cube'");
  });

  it('escapes a literal single quote in a path (e.g. an apostrophe in a folder name)', () => {
    expect(ffmpegPath("C:\\Users\\Sam's LUTs\\warm.cube")).toBe("'C\\:/Users/Sam\\'s LUTs/warm.cube'");
  });

  it('wraps text in quotes and escapes special characters', () => {
    expect(ffmpegText("it's: a test")).toBe("'it\\'s\\: a test'");
  });

  it('converts embedded newlines to a literal \\n sequence', () => {
    expect(ffmpegText('line1\nline2')).toBe("'line1\\nline2'");
  });
});

describe('buildClipInputs / buildClipInputIndex', () => {
  it('skips text clips (no backing asset, no input)', () => {
    const textClip = makeClip({
      id: 'text-1',
      mediaAssetId: undefined,
      text: {
        content: 'Hi',
        fontFamily: 'Arial',
        fontSize: 48,
        color: '#fff',
        align: 'center',
        entranceAnimation: 'none',
        exitAnimation: 'none',
      },
    });
    const track = makeTrack([makeClip(), textClip]);
    const inputs = buildClipInputs([track], [makeAsset()]);
    expect(inputs).toHaveLength(1);
    expect(inputs[0].clip.id).toBe('clip-1');
  });

  it('skips a clip whose asset was deleted from the media bin', () => {
    const track = makeTrack([makeClip({ mediaAssetId: 'missing-asset' })]);
    expect(buildClipInputs([track], [makeAsset()])).toHaveLength(0);
  });

  it('builds -loop 1 -t input args for image assets', () => {
    const asset = makeAsset({ type: 'image' });
    const clip = makeClip({ duration: 4 });
    const track = makeTrack([clip]);
    const inputs = buildClipInputs([track], [asset]);
    expect(inputs[0].args).toEqual(['-loop', '1', '-t', '4', '-i', 'C:\\videos\\clip.mp4']);
  });

  it('builds -ss/-t input args scaled by speed for video assets', () => {
    const clip = makeClip({ sourceIn: 2, duration: 5, speed: 2 });
    const track = makeTrack([clip]);
    const inputs = buildClipInputs([track], [makeAsset()]);
    expect(inputs[0].args).toEqual(['-ss', '2', '-t', '10', '-i', 'C:\\videos\\clip.mp4']);
  });

  it('assigns input indices matching array position', () => {
    const clips = [makeClip({ id: 'a', startTime: 0, duration: 2 }), makeClip({ id: 'b', startTime: 2, duration: 2 })];
    const track = makeTrack(clips);
    const inputs = buildClipInputs([track], [makeAsset()]);
    const index = buildClipInputIndex(inputs);
    expect(index.get('a')).toBe(0);
    expect(index.get('b')).toBe(1);
  });
});

describe('buildVideoClipFilterChain', () => {
  it('builds a minimal chain for a neutral clip filling the frame', () => {
    const clip = makeClip();
    const result = buildVideoClipFilterChain(clip, makeAsset(), 0, { width: 1920, height: 1080 }, 'c0');
    expect(result.filters).toEqual(['[0:v]setpts=(PTS-STARTPTS)+0/TB,scale=1920:1080,format=yuva420p[c0]']);
    expect(result.frameSize).toEqual({ width: 1920, height: 1080 });
  });

  it('includes a speed division term when speed is not 1', () => {
    const clip = makeClip({ speed: 2 });
    const result = buildVideoClipFilterChain(clip, makeAsset(), 0, { width: 1920, height: 1080 }, 'c0');
    expect(result.filters[0]).toContain('setpts=(PTS-STARTPTS)/2+0/TB');
  });

  it('shifts onto the master timeline using the clip startTime', () => {
    const clip = makeClip({ startTime: 12.5 });
    const result = buildVideoClipFilterChain(clip, makeAsset(), 0, { width: 1920, height: 1080 }, 'c0');
    expect(result.filters[0]).toContain('+12.5/TB');
  });

  it('fits (not stretches) a smaller source and applies transform.scale on top', () => {
    const asset = makeAsset({ resolution: { width: 960, height: 540 } });
    const clip = makeClip({ transform: { x: 0, y: 0, scale: 0.5, rotation: 0, opacity: 1 } });
    const result = buildVideoClipFilterChain(clip, asset, 0, { width: 1920, height: 1080 }, 'c0');
    // fitScale = 2 (960->1920), then *0.5 transform.scale = 1x -> back to natural size.
    expect(result.filters[0]).toContain('scale=960:540');
    expect(result.frameSize).toEqual({ width: 960, height: 540 });
  });

  it('adds a rotate filter with a JS-computed bounding box when rotated', () => {
    const clip = makeClip({ transform: { x: 0, y: 0, scale: 1, rotation: 90, opacity: 1 } });
    const result = buildVideoClipFilterChain(clip, makeAsset(), 0, { width: 1920, height: 1080 }, 'c0');
    // A 90-degree rotation of a 1920x1080 frame swaps the bounding box to ~1080x1920.
    expect(result.frameSize.width).toBeCloseTo(1080, 0);
    expect(result.frameSize.height).toBeCloseTo(1920, 0);
    expect(result.filters[0]).toMatch(/rotate=1\.5707\d*:ow=1080:oh=1920:fillcolor=black@0\.0/);
  });

  it('adds colorchannelmixer for non-default opacity', () => {
    const clip = makeClip({ transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.5 } });
    const result = buildVideoClipFilterChain(clip, makeAsset(), 0, { width: 1920, height: 1080 }, 'c0');
    expect(result.filters[0]).toContain('colorchannelmixer=aa=0.5');
  });

  it('adds an eq filter for non-neutral brightness/contrast/saturation', () => {
    const clip = makeClip({
      colorCorrection: { brightness: 20, contrast: -10, saturation: 50, exposure: 0, lutIntensity: 1 },
    });
    const result = buildVideoClipFilterChain(clip, makeAsset(), 0, { width: 1920, height: 1080 }, 'c0');
    expect(result.filters[0]).toContain('eq=brightness=0.2:contrast=0.9:saturation=1.5');
  });

  it('adds an exposure filter for non-zero exposure', () => {
    const clip = makeClip({
      colorCorrection: { brightness: 0, contrast: 0, saturation: 0, exposure: 1.5, lutIntensity: 1 },
    });
    const result = buildVideoClipFilterChain(clip, makeAsset(), 0, { width: 1920, height: 1080 }, 'c0');
    expect(result.filters[0]).toContain('exposure=exposure=1.5');
  });

  it('splits into a LUT branch and blends by intensity when a LUT is set', () => {
    const clip = makeClip({
      colorCorrection: {
        brightness: 0,
        contrast: 0,
        saturation: 0,
        exposure: 0,
        lutPath: 'C:\\luts\\a.cube',
        lutIntensity: 0.5,
      },
    });
    const result = buildVideoClipFilterChain(clip, makeAsset(), 0, { width: 1920, height: 1080 }, 'c0');
    expect(result.filters).toHaveLength(4);
    expect(result.filters[0]).toBe('[0:v]setpts=(PTS-STARTPTS)+0/TB,scale=1920:1080,format=yuva420p[c0pre]');
    expect(result.filters[1]).toBe('[c0pre]split=2[c0a][c0b]');
    expect(result.filters[2]).toBe("[c0b]lut3d=file='C\\:/luts/a.cube'[c0graded]");
    expect(result.filters[3]).toBe("[c0a][c0graded]blend=all_expr='A*(1-0.5)+B*0.5'[c0]");
  });
});

describe('resolveFontFile / buildDrawTextFilter', () => {
  it('maps known font families to Windows font files, with a fallback', () => {
    expect(resolveFontFile('Arial')).toBe('C:/Windows/Fonts/arial.ttf');
    expect(resolveFontFile('Georgia')).toBe('C:/Windows/Fonts/georgia.ttf');
    expect(resolveFontFile('Some Unknown Font')).toBe('C:/Windows/Fonts/arial.ttf');
  });

  it('builds a drawtext filter with position, color, and an enable window', () => {
    const clip = makeClip({
      mediaAssetId: undefined,
      startTime: 2,
      duration: 3,
      text: {
        content: 'Hello',
        fontFamily: 'Arial',
        fontSize: 48,
        color: '#ffffff',
        align: 'center',
        entranceAnimation: 'none',
        exitAnimation: 'none',
      },
    });
    const filter = buildDrawTextFilter(clip);
    expect(filter).toContain("text='Hello'");
    expect(filter).toContain('fontsize=48');
    expect(filter).toContain('fontcolor=#ffffff');
    expect(filter).toContain('x=(w-text_w)/2');
    expect(filter).toContain('y=(h-text_h)/2');
    expect(filter).toContain('between(t,2,5)');
  });

  it('offsets position by the clip transform and adds alpha for non-default opacity', () => {
    const clip = makeClip({
      mediaAssetId: undefined,
      transform: { x: 10, y: -20, scale: 1, rotation: 0, opacity: 0.5 },
      text: {
        content: 'Hi',
        fontFamily: 'Arial',
        fontSize: 24,
        color: '#fff',
        align: 'left',
        entranceAnimation: 'none',
        exitAnimation: 'none',
      },
    });
    const filter = buildDrawTextFilter(clip);
    expect(filter).toContain('x=20+10');
    expect(filter).toContain('y=(h-text_h)/2+-20');
    expect(filter).toContain('alpha=0.5');
  });
});

describe('buildVideoFilterGraph', () => {
  it('builds a black base canvas sized/timed to the project settings and timeline', () => {
    const track = makeTrack([makeClip({ duration: 5 })]);
    const result = buildVideoFilterGraph([track], [makeAsset()], makeSettings(), buildClipInputIndex(buildClipInputs([track], [makeAsset()])));
    expect(result.filters[0]).toBe('color=c=black:s=1920x1080:r=30:d=5[base]');
  });

  it('overlays a single clip with an enable window matching its timeline span', () => {
    const track = makeTrack([makeClip({ startTime: 1, duration: 4 })]);
    const inputs = buildClipInputs([track], [makeAsset()]);
    const result = buildVideoFilterGraph([track], [makeAsset()], makeSettings(), buildClipInputIndex(inputs));
    const overlayFilter = result.filters.find((f) => f.includes('overlay='));
    expect(overlayFilter).toContain("enable='between(t,1,5)'");
    expect(result.outputLabel).toBe('t0');
  });

  it('stacks two video tracks bottom-to-top by index', () => {
    const bottom = makeTrack([makeClip({ id: 'bottom', trackId: 'v0' })], { id: 'v0', index: 0 });
    const top = makeTrack([makeClip({ id: 'top', trackId: 'v1' })], { id: 'v1', index: 1 });
    const assets = [makeAsset()];
    const inputs = buildClipInputs([top, bottom], assets); // deliberately out of order in the input array
    const result = buildVideoFilterGraph([top, bottom], assets, makeSettings(), buildClipInputIndex(inputs));
    // Bottom track's overlay must appear before the top track's in the graph,
    // regardless of array order, since it composites first.
    const overlayFilters = result.filters.filter((f) => f.includes('overlay='));
    expect(overlayFilters).toHaveLength(2);
    const bottomIndex = overlayFilters.findIndex((f) => f.startsWith('[base]'));
    expect(bottomIndex).toBe(0);
  });

  it('excludes audio tracks from video compositing', () => {
    const videoTrack = makeTrack([makeClip({ id: 'v', trackId: 'v0' })], { id: 'v0', index: 0 });
    const audioTrack = makeTrack(
      [makeClip({ id: 'a', trackId: 'a0', mediaAssetId: 'audio-asset' })],
      { id: 'a0', index: 0, type: 'audio' },
    );
    const assets = [makeAsset(), makeAsset({ id: 'audio-asset', type: 'audio' })];
    const inputs = buildClipInputs([videoTrack, audioTrack], assets);
    const result = buildVideoFilterGraph([videoTrack, audioTrack], assets, makeSettings(), buildClipInputIndex(inputs));
    expect(result.filters.filter((f) => f.includes('overlay='))).toHaveLength(1);
  });

  it('renders a text clip via drawtext directly on the trunk, with no separate input', () => {
    const textClip = makeClip({
      id: 'text-1',
      mediaAssetId: undefined,
      startTime: 0,
      duration: 3,
      text: {
        content: 'Title',
        fontFamily: 'Arial',
        fontSize: 48,
        color: '#fff',
        align: 'center',
        entranceAnimation: 'none',
        exitAnimation: 'none',
      },
    });
    const track = makeTrack([textClip]);
    const result = buildVideoFilterGraph([track], [], makeSettings(), new Map());
    expect(result.filters).toHaveLength(2);
    expect(result.filters[1]).toContain('drawtext=');
    expect(result.filters[1]).toContain("[base]drawtext=");
  });
});

describe('isTrackAudibleForExport', () => {
  it('is audible by default', () => {
    const track = makeTrack([], { type: 'audio' });
    expect(isTrackAudibleForExport(track, [track])).toBe(true);
  });

  it('is never audible when muted', () => {
    const track = makeTrack([], { type: 'audio', muted: true });
    expect(isTrackAudibleForExport(track, [track])).toBe(false);
  });

  it('when any audio track is soloed, only soloed audio tracks are audible', () => {
    const soloed = makeTrack([], { id: 'a1', type: 'audio', solo: true });
    const other = makeTrack([], { id: 'a2', type: 'audio', solo: false });
    expect(isTrackAudibleForExport(other, [soloed, other])).toBe(false);
    expect(isTrackAudibleForExport(soloed, [soloed, other])).toBe(true);
  });

  it('a soloed video track does not silence audio tracks', () => {
    const soloedVideo = makeTrack([], { id: 'v1', type: 'video', solo: true });
    const audio = makeTrack([], { id: 'a1', type: 'audio', solo: false });
    expect(isTrackAudibleForExport(audio, [soloedVideo, audio])).toBe(true);
  });
});

describe('buildAtempoChain', () => {
  it('is empty for normal speed', () => {
    expect(buildAtempoChain(1)).toEqual([]);
  });

  it('is a single stage within the valid atempo range', () => {
    expect(buildAtempoChain(1.5)).toEqual(['atempo=1.5']);
  });

  it('chains multiple stages above 2x', () => {
    expect(buildAtempoChain(4)).toEqual(['atempo=2.0', 'atempo=2']);
  });

  it('chains multiple stages below 0.5x', () => {
    const chain = buildAtempoChain(0.1);
    expect(chain.filter((f) => f === 'atempo=0.5')).toHaveLength(3);
    expect(chain[chain.length - 1]).toBe('atempo=0.8');
  });
});

describe('buildAudioFilterGraph', () => {
  it('returns a null outputLabel when there is no audible audio', () => {
    const track = makeTrack([], { type: 'audio' });
    const result = buildAudioFilterGraph([track], [], new Map());
    expect(result.outputLabel).toBeNull();
    expect(result.filters).toEqual([]);
  });

  it('uses a single clip stream directly without amix when there is exactly one', () => {
    const clip = makeClip({ mediaAssetId: 'audio-asset', trackId: 'a0' });
    const track = makeTrack([clip], { id: 'a0', type: 'audio' });
    const asset = makeAsset({ id: 'audio-asset', type: 'audio', resolution: undefined });
    const inputs = buildClipInputs([track], [asset]);
    const result = buildAudioFilterGraph([track], [asset], buildClipInputIndex(inputs));
    expect(result.outputLabel).toBe('a0');
    expect(result.filters).toHaveLength(1);
  });

  it('mixes multiple audible clips via amix with normalize=0', () => {
    const clips = [
      makeClip({ id: 'a', mediaAssetId: 'audio-asset', trackId: 'a0', startTime: 0, duration: 2 }),
      makeClip({ id: 'b', mediaAssetId: 'audio-asset', trackId: 'a0', startTime: 2, duration: 2 }),
    ];
    const track = makeTrack(clips, { id: 'a0', type: 'audio' });
    const asset = makeAsset({ id: 'audio-asset', type: 'audio' });
    const inputs = buildClipInputs([track], [asset]);
    const result = buildAudioFilterGraph([track], [asset], buildClipInputIndex(inputs));
    expect(result.outputLabel).toBe('mix');
    expect(result.filters[result.filters.length - 1]).toBe('[a0][a1]amix=inputs=2:duration=longest:normalize=0[mix]');
  });

  it('excludes clips on a muted track', () => {
    const clip = makeClip({ mediaAssetId: 'audio-asset', trackId: 'a0' });
    const track = makeTrack([clip], { id: 'a0', type: 'audio', muted: true });
    const asset = makeAsset({ id: 'audio-asset', type: 'audio' });
    const inputs = buildClipInputs([track], [asset]);
    const result = buildAudioFilterGraph([track], [asset], buildClipInputIndex(inputs));
    expect(result.outputLabel).toBeNull();
  });

  it('adds a volume filter for non-default clip volume and an adelay for non-zero start', () => {
    const clip = makeClip({ mediaAssetId: 'audio-asset', trackId: 'a0', startTime: 3, volume: 0.5 });
    const track = makeTrack([clip], { id: 'a0', type: 'audio' });
    const asset = makeAsset({ id: 'audio-asset', type: 'audio' });
    const inputs = buildClipInputs([track], [asset]);
    const result = buildAudioFilterGraph([track], [asset], buildClipInputIndex(inputs));
    expect(result.filters[0]).toContain('volume=0.5');
    expect(result.filters[0]).toContain('adelay=3000|3000');
  });
});

describe('buildExportCommand', () => {
  it('assembles inputs, filter_complex, maps, encoder, and output path', () => {
    const videoTrack = makeTrack([makeClip({ id: 'v', trackId: 'v0', duration: 5 })], { id: 'v0', index: 0 });
    const audioAsset = makeAsset({ id: 'audio-asset', type: 'audio' });
    const audioTrack = makeTrack(
      [makeClip({ id: 'a', trackId: 'a0', mediaAssetId: 'audio-asset', duration: 5 })],
      { id: 'a0', index: 0, type: 'audio' },
    );
    const project = { tracks: [videoTrack, audioTrack], mediaAssets: [makeAsset(), audioAsset] };
    const args = buildExportCommand(project, makeSettings(), 'libx264');

    expect(args[0]).toBe('-y');
    expect(args).toContain('-filter_complex');
    expect(args).toContain('-map');
    expect(args).toContain('[t0]');
    expect(args).toContain('[a0]');
    expect(args).toContain('-c:v');
    expect(args).toContain('libx264');
    expect(args).toContain('-crf');
    expect(args).toContain('-c:a');
    expect(args).toContain('aac');
    expect(args).toContain('-movflags');
    expect(args[args.length - 1]).toBe('C:\\out\\video.mp4');
  });

  it('omits audio mapping and codec flags when there is no audible audio', () => {
    const videoTrack = makeTrack([makeClip({ duration: 5 })]);
    const project = { tracks: [videoTrack], mediaAssets: [makeAsset()] };
    const args = buildExportCommand(project, makeSettings(), 'libx264');
    expect(args).not.toContain('-c:a');
  });

  it('uses libopus and omits -movflags for webm', () => {
    const videoTrack = makeTrack([makeClip({ id: 'v', trackId: 'v0', duration: 5 })], { id: 'v0', index: 0 });
    const audioAsset = makeAsset({ id: 'audio-asset', type: 'audio' });
    const audioTrack = makeTrack(
      [makeClip({ id: 'a', trackId: 'a0', mediaAssetId: 'audio-asset', duration: 5 })],
      { id: 'a0', index: 0, type: 'audio' },
    );
    const project = { tracks: [videoTrack, audioTrack], mediaAssets: [makeAsset(), audioAsset] };
    const args = buildExportCommand(project, makeSettings({ container: 'webm', codec: 'vp9' }), 'libvpx-vp9');
    expect(args).toContain('libopus');
    expect(args).not.toContain('-movflags');
  });
});

describe('getExportDuration', () => {
  it('returns the timeline end across all tracks', () => {
    const track = makeTrack([makeClip({ startTime: 2, duration: 3 })]);
    expect(getExportDuration([track])).toBe(5);
  });
});
