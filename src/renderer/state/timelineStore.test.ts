import { beforeEach, describe, expect, it } from 'vitest';
import { useTimelineStore } from './timelineStore';
import type { MediaAsset, Track } from '@shared/types';

function seedTracks(): Track[] {
  return [
    { id: 'v1', type: 'video', index: 0, muted: false, locked: false, clips: [] },
    { id: 'v2', type: 'video', index: 1, muted: false, locked: false, clips: [] },
    { id: 'a1', type: 'audio', index: 0, muted: false, locked: false, clips: [] },
    { id: 'a2', type: 'audio', index: 1, muted: false, locked: false, clips: [] },
  ];
}

const asset: MediaAsset = {
  id: 'asset-1',
  filePath: 'C:\\videos\\clip.mp4',
  type: 'video',
  duration: 10,
  resolution: { width: 1920, height: 1080 },
};

beforeEach(() => {
  useTimelineStore.setState({
    tracks: seedTracks(),
    selectedClipId: null,
    playheadTime: 0,
    past: [],
    future: [],
  });
});

function trackClips(trackId: string) {
  return useTimelineStore.getState().tracks.find((t) => t.id === trackId)!.clips;
}

function firstClip() {
  for (const track of useTimelineStore.getState().tracks) {
    if (track.clips.length > 0) return track.clips[0];
  }
  return undefined;
}

describe('addClip', () => {
  it('adds a clip to the given track and is undoable', () => {
    const ok = useTimelineStore.getState().addClip('v1', asset, 0);
    expect(ok).toBe(true);
    expect(trackClips('v1')).toHaveLength(1);

    useTimelineStore.getState().undo();
    expect(trackClips('v1')).toHaveLength(0);
  });

  it('rejects when it would overlap an existing clip', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    const ok = useTimelineStore.getState().addClip('v1', asset, 5);
    expect(ok).toBe(false);
    expect(trackClips('v1')).toHaveLength(1);
  });

  it('rejects on a locked track', () => {
    useTimelineStore.getState().toggleTrackLock('v1');
    const ok = useTimelineStore.getState().addClip('v1', asset, 0);
    expect(ok).toBe(false);
  });

  it('rejects an audio asset on a video track and a video asset on an audio track', () => {
    const audioAsset: MediaAsset = { ...asset, id: 'asset-audio', type: 'audio' };
    expect(useTimelineStore.getState().addClip('v1', audioAsset, 0)).toBe(false);
    expect(useTimelineStore.getState().addClip('a1', asset, 0)).toBe(false);
  });

  it('allows an image asset on a video track', () => {
    const imageAsset: MediaAsset = { ...asset, id: 'asset-image', type: 'image', duration: 0 };
    expect(useTimelineStore.getState().addClip('v1', imageAsset, 0)).toBe(true);
  });
});

describe('moveClip', () => {
  it('moves a clip and is undoable', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    const clipId = firstClip()!.id;

    const ok = useTimelineStore.getState().moveClip(clipId, 'v1', 20);
    expect(ok).toBe(true);
    expect(firstClip()!.startTime).toBe(20);

    useTimelineStore.getState().undo();
    expect(firstClip()!.startTime).toBe(0);
  });

  it('rejects a move that would overlap another clip on the target track', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    useTimelineStore.getState().addClip('v1', asset, 20);
    const clipToMove = [...trackClips('v1')].sort((a, b) => a.startTime - b.startTime)[0];

    const ok = useTimelineStore.getState().moveClip(clipToMove.id, 'v1', 15);
    expect(ok).toBe(false);
    expect(trackClips('v1').find((c) => c.id === clipToMove.id)!.startTime).toBe(0);
  });
});

describe('trimClipStart / trimClipEnd', () => {
  it('trims the start, shrinking duration and advancing sourceIn, and is undoable', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    const clipId = firstClip()!.id;

    const ok = useTimelineStore.getState().trimClipStart(clipId, 2);
    expect(ok).toBe(true);
    const trimmed = firstClip()!;
    expect(trimmed.startTime).toBe(2);
    expect(trimmed.duration).toBe(8);
    expect(trimmed.sourceIn).toBe(2);

    useTimelineStore.getState().undo();
    const restored = firstClip()!;
    expect(restored.startTime).toBe(0);
    expect(restored.duration).toBe(10);
    expect(restored.sourceIn).toBe(0);
  });

  it('trims the end, shrinking duration and pulling in sourceOut, and is undoable', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    const clipId = firstClip()!.id;

    const ok = useTimelineStore.getState().trimClipEnd(clipId, 6);
    expect(ok).toBe(true);
    const trimmed = firstClip()!;
    expect(trimmed.duration).toBe(6);
    expect(trimmed.sourceOut).toBe(6);

    useTimelineStore.getState().undo();
    const restored = firstClip()!;
    expect(restored.duration).toBe(10);
    expect(restored.sourceOut).toBe(10);
  });

  it('rejects a trim that would shrink duration to zero or below', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    const clipId = firstClip()!.id;
    expect(useTimelineStore.getState().trimClipEnd(clipId, 0)).toBe(false);
  });

  it('rejects extending the end past the source media duration (maxSourceOut)', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    const clipId = firstClip()!.id;
    // Clip already covers the full 10s source; trimming to 15 would need sourceOut=15 > maxSourceOut=10.
    expect(useTimelineStore.getState().trimClipEnd(clipId, 15, asset.duration)).toBe(false);
    expect(firstClip()!.duration).toBe(10);
  });
});

describe('splitClipAt', () => {
  it('splits a clip into two at the given time and is undoable', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    const clipId = firstClip()!.id;

    const ok = useTimelineStore.getState().splitClipAt(clipId, 4);
    expect(ok).toBe(true);
    const clips = trackClips('v1');
    expect(clips).toHaveLength(2);
    const [left, right] = [...clips].sort((a, b) => a.startTime - b.startTime);
    expect(left.startTime).toBe(0);
    expect(left.duration).toBe(4);
    expect(left.sourceOut).toBe(4);
    expect(right.startTime).toBe(4);
    expect(right.duration).toBe(6);
    expect(right.sourceIn).toBe(4);

    useTimelineStore.getState().undo();
    const afterUndo = trackClips('v1');
    expect(afterUndo).toHaveLength(1);
    expect(afterUndo[0].duration).toBe(10);
  });

  it('rejects a split outside the clip bounds', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    const clipId = firstClip()!.id;
    expect(useTimelineStore.getState().splitClipAt(clipId, 0)).toBe(false);
    expect(useTimelineStore.getState().splitClipAt(clipId, 10)).toBe(false);
  });
});

describe('removeClip', () => {
  it('lift: removes the clip without shifting others, and is undoable', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    useTimelineStore.getState().addClip('v1', asset, 20);
    const firstId = [...trackClips('v1')].sort((a, b) => a.startTime - b.startTime)[0].id;

    useTimelineStore.getState().removeClip(firstId, 'lift');
    const afterRemove = trackClips('v1');
    expect(afterRemove).toHaveLength(1);
    expect(afterRemove[0].startTime).toBe(20);

    useTimelineStore.getState().undo();
    expect(trackClips('v1')).toHaveLength(2);
  });

  it('ripple: removes the clip and shifts later clips back, and is undoable', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    useTimelineStore.getState().addClip('v1', asset, 20);
    const firstId = [...trackClips('v1')].sort((a, b) => a.startTime - b.startTime)[0].id;

    useTimelineStore.getState().removeClip(firstId, 'ripple');
    const afterRemove = trackClips('v1');
    expect(afterRemove).toHaveLength(1);
    expect(afterRemove[0].startTime).toBe(10);

    useTimelineStore.getState().undo();
    const afterUndo = trackClips('v1');
    expect(afterUndo).toHaveLength(2);
    const restoredSorted = [...afterUndo].sort((a, b) => a.startTime - b.startTime);
    expect(restoredSorted[0].startTime).toBe(0);
    expect(restoredSorted[1].startTime).toBe(20);
  });
});

describe('undo/redo stack', () => {
  it('redo replays an undone command', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    useTimelineStore.getState().undo();
    expect(trackClips('v1')).toHaveLength(0);

    useTimelineStore.getState().redo();
    expect(trackClips('v1')).toHaveLength(1);
  });

  it('clears the redo stack once a new command is executed after an undo', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    useTimelineStore.getState().undo();
    expect(useTimelineStore.getState().canRedo()).toBe(true);

    useTimelineStore.getState().addClip('v2', asset, 0);
    expect(useTimelineStore.getState().canRedo()).toBe(false);
  });
});

describe('track mute/lock', () => {
  it('toggles mute and is undoable', () => {
    useTimelineStore.getState().toggleTrackMute('v1');
    expect(useTimelineStore.getState().tracks.find((t) => t.id === 'v1')!.muted).toBe(true);
    useTimelineStore.getState().undo();
    expect(useTimelineStore.getState().tracks.find((t) => t.id === 'v1')!.muted).toBe(false);
  });

  it('toggles lock and is undoable', () => {
    useTimelineStore.getState().toggleTrackLock('v1');
    expect(useTimelineStore.getState().tracks.find((t) => t.id === 'v1')!.locked).toBe(true);
    useTimelineStore.getState().undo();
    expect(useTimelineStore.getState().tracks.find((t) => t.id === 'v1')!.locked).toBe(false);
  });
});

describe('updateClipTransform', () => {
  it('patches the transform and is undoable', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    const clipId = firstClip()!.id;

    useTimelineStore.getState().updateClipTransform(clipId, { x: 50, opacity: 0.5 });
    expect(firstClip()!.transform.x).toBe(50);
    expect(firstClip()!.transform.opacity).toBe(0.5);
    expect(firstClip()!.transform.y).toBe(0);

    useTimelineStore.getState().undo();
    expect(firstClip()!.transform.x).toBe(0);
    expect(firstClip()!.transform.opacity).toBe(1);
  });

  it('is a no-op on a locked track', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    const clipId = firstClip()!.id;
    useTimelineStore.getState().toggleTrackLock('v1');

    useTimelineStore.getState().updateClipTransform(clipId, { x: 999 });
    expect(firstClip()!.transform.x).toBe(0);
  });
});

describe('setKeyframe / removeKeyframe / clearKeyframesForProperty', () => {
  it('adds a keyframe and is undoable', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    const clipId = firstClip()!.id;

    useTimelineStore.getState().setKeyframe(clipId, 'opacity', 2, 0.5, 'easeIn');
    expect(firstClip()!.keyframes.opacity).toEqual([{ time: 2, value: 0.5, easing: 'easeIn' }]);

    useTimelineStore.getState().undo();
    expect(firstClip()!.keyframes.opacity).toBeUndefined();
  });

  it('replaces an existing keyframe at (nearly) the same time instead of duplicating it', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    const clipId = firstClip()!.id;

    useTimelineStore.getState().setKeyframe(clipId, 'opacity', 2, 0.5);
    useTimelineStore.getState().setKeyframe(clipId, 'opacity', 2, 0.9);

    expect(firstClip()!.keyframes.opacity).toHaveLength(1);
    expect(firstClip()!.keyframes.opacity[0].value).toBe(0.9);
  });

  it('keeps keyframes sorted by time', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    const clipId = firstClip()!.id;

    useTimelineStore.getState().setKeyframe(clipId, 'opacity', 5, 1);
    useTimelineStore.getState().setKeyframe(clipId, 'opacity', 1, 0);

    expect(firstClip()!.keyframes.opacity.map((k) => k.time)).toEqual([1, 5]);
  });

  it('removes a single keyframe and is undoable', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    const clipId = firstClip()!.id;
    useTimelineStore.getState().setKeyframe(clipId, 'opacity', 1, 0);
    useTimelineStore.getState().setKeyframe(clipId, 'opacity', 5, 1);

    useTimelineStore.getState().removeKeyframe(clipId, 'opacity', 1);
    expect(firstClip()!.keyframes.opacity).toHaveLength(1);
    expect(firstClip()!.keyframes.opacity[0].time).toBe(5);

    useTimelineStore.getState().undo();
    expect(firstClip()!.keyframes.opacity).toHaveLength(2);
  });

  it('deletes the property entry entirely once its last keyframe is removed', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    const clipId = firstClip()!.id;
    useTimelineStore.getState().setKeyframe(clipId, 'opacity', 1, 0);

    useTimelineStore.getState().removeKeyframe(clipId, 'opacity', 1);
    expect(firstClip()!.keyframes.opacity).toBeUndefined();
  });

  it('clearKeyframesForProperty removes all keyframes and bakes a static value, and is undoable', () => {
    useTimelineStore.getState().addClip('v1', asset, 0);
    const clipId = firstClip()!.id;
    useTimelineStore.getState().setKeyframe(clipId, 'opacity', 1, 0);
    useTimelineStore.getState().setKeyframe(clipId, 'opacity', 5, 1);

    useTimelineStore.getState().clearKeyframesForProperty(clipId, 'opacity', 0.75);
    expect(firstClip()!.keyframes.opacity).toBeUndefined();
    expect(firstClip()!.transform.opacity).toBe(0.75);

    useTimelineStore.getState().undo();
    expect(firstClip()!.keyframes.opacity).toHaveLength(2);
    expect(firstClip()!.transform.opacity).toBe(1);
  });
});

describe('addTextClip / updateTextContent', () => {
  it('adds a text clip with default content and is undoable', () => {
    const ok = useTimelineStore.getState().addTextClip('v1', 0);
    expect(ok).toBe(true);
    const clip = firstClip()!;
    expect(clip.mediaAssetId).toBeUndefined();
    expect(clip.text?.content).toBe('Text');
    expect(clip.text?.fontFamily).toBe('Arial');

    useTimelineStore.getState().undo();
    expect(trackClips('v1')).toHaveLength(0);
  });

  it('accepts a partial content override', () => {
    useTimelineStore.getState().addTextClip('v1', 0, { content: 'Hello', fontSize: 96 });
    const clip = firstClip()!;
    expect(clip.text?.content).toBe('Hello');
    expect(clip.text?.fontSize).toBe(96);
    expect(clip.text?.fontFamily).toBe('Arial'); // unspecified fields keep the default
  });

  it('rejects placement on an audio track', () => {
    const ok = useTimelineStore.getState().addTextClip('a1', 0);
    expect(ok).toBe(false);
  });

  it('rejects placement on a locked track', () => {
    useTimelineStore.getState().toggleTrackLock('v1');
    const ok = useTimelineStore.getState().addTextClip('v1', 0);
    expect(ok).toBe(false);
  });

  it('rejects overlapping an existing clip', () => {
    useTimelineStore.getState().addTextClip('v1', 0);
    const ok = useTimelineStore.getState().addTextClip('v1', 2);
    expect(ok).toBe(false);
  });

  it('updateTextContent patches the text and is undoable', () => {
    useTimelineStore.getState().addTextClip('v1', 0);
    const clipId = firstClip()!.id;

    useTimelineStore.getState().updateTextContent(clipId, { content: 'Updated', color: '#ff0000' });
    expect(firstClip()!.text?.content).toBe('Updated');
    expect(firstClip()!.text?.color).toBe('#ff0000');

    useTimelineStore.getState().undo();
    expect(firstClip()!.text?.content).toBe('Text');
  });

  it('is a no-op on a locked track', () => {
    useTimelineStore.getState().addTextClip('v1', 0);
    const clipId = firstClip()!.id;
    useTimelineStore.getState().toggleTrackLock('v1');

    useTimelineStore.getState().updateTextContent(clipId, { content: 'Nope' });
    expect(firstClip()!.text?.content).toBe('Text');
  });

  it('works with the generic move/trim/split/remove actions like any other clip', () => {
    useTimelineStore.getState().addTextClip('v1', 0);
    const clipId = firstClip()!.id;

    expect(useTimelineStore.getState().moveClip(clipId, 'v1', 3)).toBe(true);
    expect(firstClip()!.startTime).toBe(3);

    expect(useTimelineStore.getState().splitClipAt(clipId, 5)).toBe(true);
    expect(trackClips('v1')).toHaveLength(2);
    // Both halves are still valid text clips.
    for (const clip of trackClips('v1')) {
      expect(clip.text?.content).toBe('Text');
    }
  });
});
