import type { Clip, Track } from '@shared/types';

export function pxToTime(px: number, zoom: number): number {
  return px / zoom;
}

export function timeToPx(time: number, zoom: number): number {
  return time * zoom;
}

export function clipEnd(clip: Pick<Clip, 'startTime' | 'duration'>): number {
  return clip.startTime + clip.duration;
}

export function sortedClips(track: Track): Clip[] {
  return [...track.clips].sort((a, b) => a.startTime - b.startTime);
}

export function hasOverlap(
  track: Track,
  excludeClipId: string | null,
  startTime: number,
  duration: number,
): boolean {
  const end = startTime + duration;
  return track.clips.some((clip) => {
    if (clip.id === excludeClipId) return false;
    const clipEndTime = clip.startTime + clip.duration;
    return startTime < clipEndTime && end > clip.startTime;
  });
}

export function collectSnapPoints(
  tracks: Track[],
  excludeClipId: string | null,
  playheadTime: number,
): number[] {
  const points = new Set<number>([playheadTime, 0]);
  for (const track of tracks) {
    for (const clip of track.clips) {
      if (clip.id === excludeClipId) continue;
      points.add(clip.startTime);
      points.add(clipEnd(clip));
    }
  }
  return [...points];
}

export function snapTime(time: number, snapPoints: number[], thresholdSeconds: number): number {
  let closest = time;
  let closestDistance = thresholdSeconds;
  for (const point of snapPoints) {
    const distance = Math.abs(point - time);
    if (distance <= closestDistance) {
      closest = point;
      closestDistance = distance;
    }
  }
  return closest;
}
