import type { Clip, Track } from '@shared/types';
import { interpolateKeyframes } from './keyframes';

export function dbToGain(db: number): number {
  return Math.pow(10, -db / 20);
}

// Whether `track` should produce audio at all, given every AUDIO track's
// mute/solo state: solo overrides — if ANY audio track is soloed, only
// soloed audio tracks are audible; a muted track is never audible regardless
// of solo. Video tracks' solo flag (used to isolate footage while scrubbing)
// has no bearing on audio audibility.
export function isTrackAudible(track: Track, tracks: Track[]): boolean {
  if (track.muted) return false;
  const anySoloedAudioTrack = tracks.some((t) => t.type === 'audio' && t.solo);
  return anySoloedAudioTrack ? track.solo : true;
}

// Whether `track` has an active (currently sounding) clip at `time`, used to
// evaluate ducking triggers.
export function isTrackActiveAt(track: Track, time: number, tracks: Track[]): boolean {
  if (track.type !== 'audio') return false;
  if (!isTrackAudible(track, tracks)) return false;
  return track.clips.some((c) => time >= c.startTime && time < c.startTime + c.duration);
}

export function computeClipVolumeAt(clip: Clip, localTime: number): number {
  const keyframes = clip.keyframes.volume;
  if (keyframes && keyframes.length > 0) {
    return interpolateKeyframes(keyframes, localTime, clip.volume);
  }
  return clip.volume;
}

// Combines the clip's own (possibly keyframed) volume with track mute/solo
// audibility and rule-based ducking (Section 5.6): while this track's
// duckingTriggerTrackId has active audio, gain is reduced by duckingReductionDb.
export function computeEffectiveGain(
  clip: Clip,
  localTime: number,
  track: Track,
  tracks: Track[],
  playheadTime: number,
): number {
  if (!isTrackAudible(track, tracks)) return 0;

  let gain = Math.max(0, computeClipVolumeAt(clip, localTime));

  if (track.duckingTriggerTrackId && typeof track.duckingReductionDb === 'number') {
    const triggerTrack = tracks.find((t) => t.id === track.duckingTriggerTrackId);
    if (triggerTrack && isTrackActiveAt(triggerTrack, playheadTime, tracks)) {
      gain *= dbToGain(track.duckingReductionDb);
    }
  }

  return Math.max(0, Math.min(1, gain));
}
