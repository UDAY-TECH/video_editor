# Phase 3 Manual Test Checklist

Run `npm run dev`, import a couple of video/audio clips, then walk through:

- [ ] Drag a clip from the Media Bin onto a video track — it creates a clip at the drop position.
- [ ] Drag a clip onto a spot that overlaps an existing clip — the drop is rejected (no clip created).
- [ ] Drag a clip's body left/right within its track — it moves; dropping on an overlapping spot snaps back to its original position.
- [ ] Drag a clip's left edge — it trims the in-point (shrinks from the left); drag its right edge — it trims the out-point.
- [ ] Enable Snap, drag a clip near another clip's edge or the playhead — it snaps into place. Toggle Snap off — dragging no longer snaps.
- [ ] Select a clip, move the playhead inside it, press **S** (or click Split) — it splits into two clips.
- [ ] Select a clip, press **Delete** — it's removed and leaves a gap (lift).
- [ ] Select a clip, press **Shift+Delete** (or click Ripple Delete) — it's removed and later clips on that track shift back to close the gap.
- [ ] Click the ruler / drag across it — the playhead moves accordingly.
- [ ] Adjust the Zoom slider — clips resize accordingly; reload the app — zoom level persists.
- [ ] Click **+Video** / **+Audio** — a new track lane appears.
- [ ] Toggle a track's **M** (mute) and **L** (lock) buttons — a locked track rejects new clips, moves, and trims on it.
- [ ] Press **Ctrl+Z** repeatedly after several edits — each edit undoes one at a time (move/trim/split/delete are each a single undo step, not one per mouse-move tick). Press **Ctrl+Y** to redo.
