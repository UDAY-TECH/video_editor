# Phase 5 Manual Test Checklist

This phase replaces the Preview Player's raw single-clip playback with a real
canvas-based timeline compositor. I could not visually verify any of this
myself (no GUI automation applies to the native Electron window) - please
check all of the below carefully before considering this phase done.

Run `npm run dev`, import a couple of video clips and an image, place them on
the timeline, then walk through:

## Basic compositing
- [ ] With one clip on a video track, the Preview Player shows that clip's frame at the playhead (not black, not frozen on the wrong frame).
- [ ] Place a second clip on the *other* video track overlapping the same time range as the first — the top track's clip should visually cover/overlay the bottom track's clip.
- [ ] Scrub the seek bar / ruler — the preview updates to match the frame under the playhead for whichever clip(s) are active there.
- [ ] Click Play — playback advances smoothly-ish and stops automatically at the end of the last clip. (Known limitation: pooled video elements are always explicitly seeked rather than left to play natively, so this may be choppier than expected on heavier footage — flag if it's unusably bad, not just "not perfectly smooth.")
- [ ] Frame step (⏮/⏭) moves the playhead by exactly one frame at the project's fps (default 30).
- [ ] There is no audio during timeline playback — this is intentional (Phase 7 adds audio).

## Transforms (Properties Panel)
- [ ] Select a clip on the timeline — the Properties Panel shows Position X/Y, Scale, Rotation, Opacity for it.
- [ ] Change Position X/Y — the clip visibly shifts in the Preview Player.
- [ ] Change Scale — the clip visibly grows/shrinks (around center).
- [ ] Change Rotation — the clip visibly rotates (around center).
- [ ] Change Opacity to 0.5 — the clip appears semi-transparent (over black, or over whatever's on a lower track).
- [ ] Undo (Ctrl+Z) after a transform change reverts it; redo (Ctrl+Y) reapplies it.
- [ ] Selecting a clip on a **locked** track shows read-only controls (inputs disabled).

## Keyframing
- [ ] With a clip selected, move the playhead to some point within it, click the ◆ (keyframe toggle) next to Opacity — it turns on (highlighted) and a mini-timeline strip with one diamond marker appears below.
- [ ] Move the playhead elsewhere within the clip and change the Opacity value — a second keyframe marker appears at that position.
- [ ] Scrub the playhead between the two keyframes — Opacity in the Preview Player interpolates smoothly, not just jumping between the two set values.
- [ ] Click a keyframe marker (diamond) — it's removed; if it was the only one left, the property reverts to a static (non-keyframed) value.
- [ ] Click the ◆ toggle again while keyframed — all keyframes for that property are cleared and it bakes in whatever value was showing at the current playhead position.
- [ ] Try easing: this isn't directly exposed in the UI yet (all keyframes created via the panel default to `linear`) — this is a known gap, not a bug, since Section 5.4 only requires the keyframe toggle + markers, not an easing picker.

## Transitions
- [ ] On the Clip data model there's no dedicated UI yet to *set* `transitionIn`/`transitionOut` from the Properties Panel (out of this phase's explicit scope — Section 5.4 doesn't call for a transitions UI, only "basic transitions" support in the compositor/model). If you want to verify transition rendering, this currently requires manually editing a saved `.veproj` file's clip to add a `transitionOut`/`transitionIn` field (e.g. `{ "type": "fade", "duration": 1 }`) between two adjacent clips on the same track, then reloading the project.
- [ ] With a `fade`/`dissolve` transition set, scrubbing across the boundary between the two clips shows a crossfade blend rather than a hard cut.
- [ ] With a `wipe` transition set, scrubbing across the boundary shows a left-to-right reveal rather than a crossfade.

## Regression check
- [ ] Everything from Phases 2-4 still works: media import or drag-drop, thumbnails, timeline drag/trim/split/ripple/undo, and project save/load (including that keyframes/transforms round-trip correctly through save and reload).
