# Phase 6 Manual Test Checklist

Run `npm run dev`. I could not visually verify any of this myself.

## Text clips
- [ ] Click **+Text** in the Timeline toolbar — a purple "Text" clip appears at the playhead on the topmost video track.
- [ ] Select the text clip — the Properties Panel shows a Text section (content textarea, font family dropdown, font size, color picker, alignment buttons, entrance/exit animation dropdowns) above the usual transform controls.
- [ ] Edit the content — the Preview Player shows your text over black (or over whatever's on a lower track).
- [ ] Change font family/size/color/alignment — each visibly updates in the Preview Player.
- [ ] Set Entrance to "fade" — scrubbing from the clip's start shows the text fading in over ~0.5s. Set it to "slide" — the text slides in from off-screen instead.
- [ ] Set Exit to "fade"/"slide" similarly and scrub near the clip's end — same effect in reverse.
- [ ] Trim a text clip down to ~0.5s (shorter than the 1s combined entrance+exit window) with both entrance and exit set to "fade" — the two animations should not visibly fight each other (each is capped to half the clip's duration, so they never overlap).
- [ ] A text clip supports the same transform controls (position/scale/rotation/opacity) and keyframing as a media clip.
- [ ] A text clip can be dragged, trimmed, split (S), and ripple/lift-deleted just like a regular clip; each is a single undo step.
- [ ] Try **+Text** on a track that's locked, or on an audio track (edit a saved `.veproj` to move a text clip's trackId there, or just note there's no drag target) — it's rejected.
- [ ] Save the project, close and reopen it — the text clip's content, styling, transform, and keyframes all round-trip correctly.
- [ ] Open a project saved by **Phase 4/5** (before this phase) — it still loads correctly (schema migrated from 1.0.0 to 1.1.0 automatically).

## Image overlays
This should already work from earlier phases (Media Bin import + Timeline placement + compositor were built generically, without regard to media type) — this section is a regression check, not new functionality.
- [ ] Import a PNG/JPG into the Media Bin, drag it onto a video track — it becomes a clip with a default ~5s duration.
- [ ] Place a video clip on a lower video track and an image clip on a higher video track, overlapping in time — the image renders on top of the video in the Preview Player.
- [ ] The image clip supports the same transform/keyframe controls as any other clip (e.g., shrink and reposition it like a watermark/logo).
