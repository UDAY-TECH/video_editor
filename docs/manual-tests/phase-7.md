# Phase 7 Manual Test Checklist

This phase adds real audio playback for the first time (previous phases were
silent) plus per-clip volume, mute/solo, waveforms, and ducking. I could not
hear or visually verify any of this myself — please check carefully.

Run `npm run dev`, import an audio file (WAV/MP3/AAC) and a video with sound,
place some audio clips on the audio tracks, then walk through:

## Waveforms
- [ ] After importing an audio file, its Media Bin thumbnail area shows a generic placeholder (audio has no visual thumbnail, as before).
- [ ] Drag the audio asset onto an audio track — the resulting clip shows a waveform rendered inside the clip block shortly after being placed (may take a moment for extraction the first time).
- [ ] Trim the clip's edges — the visible waveform slice updates to show only the trimmed portion of the audio.
- [ ] Zoom the timeline in/out — the waveform stretches with the clip rather than disappearing or looking broken.
- [ ] Save the project, close and reopen — the waveform reappears (reusing the cached peaks file, not regenerating from scratch — should be fast).

## Playback and volume
- [ ] Click Play with an audio clip on the timeline — you actually hear audio now (this is new; previously the app was always silent).
- [ ] Select an audio clip, adjust its Volume in the Properties Panel — the audible level changes accordingly during playback.
- [ ] Enable keyframing on Volume (◆ toggle), set different volume values at two points in the clip — playback fades the volume up/down between them rather than jumping abruptly.
- [ ] Scrubbing the timeline (not pressing Play) stays silent — this is intentional, matching most editors.
- [ ] A video clip's own embedded audio does **not** play in preview — this is a known, explicitly scoped-out limitation for this phase (see code comments in PreviewPlayer.tsx); only clips placed on dedicated audio tracks produce sound.
- [ ] Set a clip's Speed away from 1x (if/when a speed control is exposed) — audio pitch/rate changes accordingly rather than staying at normal speed while video plays sped up.
- [ ] Volume tops out at 1 (100%) in the Properties Panel — this is intentional, not a bug: `HTMLMediaElement.volume` is spec-limited to 0–1, so a "boost above 100%" isn't achievable without a Web Audio rewrite, which this phase doesn't attempt.

## Mute / Solo
- [ ] Click **M** on an audio track — its clips go silent during playback.
- [ ] Click **S** (Solo) on one audio track while others have clips playing — only the soloed track is audible; all others go silent, even if not individually muted.
- [ ] Muting a soloed track still keeps it silent (mute always wins over solo).

## Ducking
- [ ] On an audio track's header, use the "Duck: ..." dropdown to pick another audio track as the trigger, and set a dB value (e.g. 12).
- [ ] Place a clip on the trigger track and an overlapping clip on the ducked track — during playback, the ducked track's volume audibly drops while the trigger track has an active clip, and returns to normal once the trigger clip ends.
- [ ] Set "Duck: none" to clear the rule — the target track's volume stays constant regardless of the other track.

## Regression check
- [ ] Everything from Phases 2-6 still works: import, thumbnails, timeline drag/trim/split/ripple/undo, project save/load (including that volume/solo/ducking round-trip through save and reload), transforms/keyframes/transitions, and text clips.
- [ ] Open a project saved by **Phase 6 or earlier** — it still loads correctly (schema auto-migrates from 1.0.0/1.1.0 to 1.2.0, injecting default volume=1 and solo=false onto old clips/tracks).
