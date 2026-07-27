# Phase 9 Manual Test Checklist

This phase adds the export pipeline (Section 5.9): the Export dialog, hardware
encoder detection, and the FFmpeg filter-graph builder that turns the timeline
into a real video file. The filter-graph builder is heavily unit-tested (over
40 string-assertion tests), and I additionally ran a real end-to-end export
through the actual bundled ffmpeg binary during development (multi-track,
transform, color correction, LUT, text, and audio all together) to confirm the
generated command actually works, not just that the strings look right — this
caught and fixed a real Windows-path-escaping bug in how LUT/font file paths
are embedded in the filter graph. I could not, however, visually verify the
exported video's picture/audio quality myself - please check carefully.

Run `npm run dev`, build a small project with at least: two video tracks (one
clip with a transform - position/scale/rotation/opacity - and color
correction/LUT applied, one plain clip, maybe a text clip), and an audio
track with a clip at non-1.0 volume, then walk through:

## Export dialog
- [ ] Click "Export" - the dialog now shows real settings (container, codec, resolution, fps, quality) instead of the old "not implemented yet" placeholder.
- [ ] Click "YouTube 1080p" - resolution snaps to 1920x1080, container/codec to MP4/H.264, quality to a bitrate mode.
- [ ] Click "Instagram Reel (vertical)" - resolution snaps to 1080x1920.
- [ ] Switch Quality mode between CRF and Bitrate - the appropriate single input field appears for each.
- [ ] Click Export - a native Save dialog appears with the extension matching the selected container.

## Running an export
- [ ] After picking a save location, the dialog switches to a progress view with a percentage and moving progress bar.
- [ ] Progress reaches 100% and switches to a "Export complete" screen showing the output path.
- [ ] Open the exported file in a media player (e.g. VLC or Windows' built-in player) - it plays, with picture and sound.
- [ ] Click "Cancel Export" mid-run on a longer project - the export stops and the dialog returns to the settings form (no partial/corrupt file left open by the app, though ffmpeg may leave a partial file on disk at the output path - that's expected for a canceled run).

## Visual fidelity (compare exported video against the Preview Player)
- [ ] Multi-track stacking: a clip on the higher (upper) video track appears on top of a clip on the lower track, matching the preview.
- [ ] Transform: position offset, scale, and rotation on a clip look the same in the export as in the preview (static value, not animated - see Known Limitations below).
- [ ] Opacity: a clip with reduced opacity shows the layer below through it, matching the preview.
- [ ] Color correction: brightness/contrast/saturation/exposure changes are visible in the export and are in the same direction/rough magnitude as the preview (exact color science won't be pixel-identical between the Canvas approximation and FFmpeg's `eq`/`exposure` filters - that's expected).
- [ ] LUT: an imported LUT's look is visible in the exported video, blended by the LUT Intensity slider's value.
- [ ] Text clip: content, font, size, color, and alignment show up correctly, positioned per the clip's transform.
- [ ] Image clip: displays for its full duration, correctly scaled/positioned.
- [ ] Audio: per-clip volume, and per-track mute/solo, are respected in the exported audio.

## Hardware encoder detection
- [ ] Export with H.264 selected - it completes successfully regardless of whether your machine has an NVENC/QSV-capable GPU (falls back to libx264 automatically when no hardware encoder is available). If you do have an NVIDIA or Intel GPU, the export should still work correctly using whichever encoder was picked - I could not verify actual hardware-encoder output quality/correctness myself since I don't know this machine's GPU situation.

## Known limitations (by design for this phase - not bugs)
- [ ] **Transitions** (fade/dissolve/wipe) are not reproduced in export - clips with a transitionIn/transitionOut render as a hard cut. This is the most complex remaining piece of Section 5.9 and is deferred to a future pass.
- [ ] **Keyframed properties** (transform, opacity, volume, color correction) export using only their static base/current value - keyframe animation itself is not baked into the exported video.
- [ ] **Audio ducking** rules are not applied in export (only per-clip volume and per-track mute/solo).
- [ ] **Text entrance/exit animations** (fade/slide) don't play in export - text appears/disappears abruptly at its clip boundaries. Text also doesn't support rotation/scale in export (drawtext limitation), only position.
- [ ] A video clip's own embedded audio still doesn't play in the export (same scope cut as the Phase 7 preview - only clips on dedicated audio tracks produce sound).
- [ ] Input trimming uses fast (keyframe-approximate) seeking rather than frame-exact seeking, for export speed - trim points may be off by up to a fraction of a second on sources with widely spaced keyframes.

## Regression check
- [ ] Everything from Phases 2-8 still works: import, thumbnails, timeline drag/trim/split/ripple/undo, project save/load, transforms/keyframes/transitions in the *preview*, text clips, audio tools, and color correction/LUT in the *preview*.
