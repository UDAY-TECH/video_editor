# Phase 8 Manual Test Checklist

This phase adds color correction (brightness/contrast/saturation/exposure)
and 3D LUT (`.cube`) import/application. Both are **preview approximations**:
brightness/contrast/saturation/exposure use Canvas 2D's `filter`, and LUTs are
applied via a WebGL shader pass. Accurate output happens via FFmpeg's `eq`/
`lut3d` filters at export time (Phase 9, not yet built) - I could not verify
the actual visual result myself, please check carefully.

Run `npm run dev`, import a video or image clip, place it on the timeline,
select it, then walk through:

## Basic color correction
- [ ] Select a video/image clip - a "Color Correction" section appears in the Properties Panel with Brightness/Contrast/Saturation/Exposure rows, all starting at 0.
- [ ] Drag Brightness up/down - the preview visibly brightens/darkens in real time (no need to press Play).
- [ ] Do the same for Contrast and Saturation - contrast and color intensity change visibly. Saturation at -100 should look fully greyscale-ish (close to it; exact greyscale requires the export-time filter, this is an approximation).
- [ ] Adjust Exposure (range -3 to +3) - each whole step roughly doubles/halves brightness (it's stops, not a percentage).
- [ ] A text clip does **not** show a Color Correction section (out of scope for text/generated overlays).
- [ ] Enable keyframing (◆) on Brightness, set different values at two points in the clip - playback animates smoothly between them rather than jumping.
- [ ] Undo/redo works for color correction edits, including on a locked track (should be a no-op there, same as other properties).

## LUT import and application
- [ ] Click "Import LUT..." in the Color Correction section and pick a `.cube` file (any 3D LUT, e.g. a free one downloaded for testing) - after a moment, the preview visibly changes to the graded look.
- [ ] The LUT filename appears next to the Import/Remove buttons.
- [ ] A "LUT Intensity" slider appears once a LUT is set - dragging it from 0 to 1 fades between the ungraded and fully-graded look.
- [ ] Click "Remove" - the preview reverts to ungraded, and the LUT Intensity slider disappears.
- [ ] Brightness/Contrast/Saturation/Exposure still apply on top of an active LUT (order: LUT graded first, then these).
- [ ] Look closely at very saturated/extreme colors near the edges of the LUT's color cube for faint banding/seams - this is a known, accepted limitation of the preview's LUT packing technique (see comments in `lutGl.ts`), not a bug to fix.
- [ ] If your GPU/browser somehow can't create a WebGL context, the app should still run fine with LUTs simply not applying (check the DevTools console for a "WebGL LUT preview unavailable" warning in that case, no crash).

## Save/load
- [ ] Save the project, close and reopen - color correction values and the LUT reference/intensity round-trip correctly.
- [ ] Open a project saved by **Phase 7 or earlier** - it still loads correctly (schema auto-migrates from 1.2.0 to 1.3.0, injecting neutral color correction defaults on old clips).

## Regression check
- [ ] Everything from Phases 2-7 still works: import, thumbnails, timeline drag/trim/split/ripple/undo, project save/load, transforms/keyframes/transitions, text clips, and audio (volume/mute/solo/waveforms/ducking).
