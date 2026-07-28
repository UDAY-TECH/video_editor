# Phase 10 Manual Test Checklist

This is the final planned phase: polish across four unrelated areas -
keyboard shortcuts, resizable panels, window/multi-monitor state, and a proxy
workflow for 4K+ footage. I could not verify any of the visual/interactive
behavior myself (drag-resize feel, window placement across real monitors, or
actual scrubbing smoothness with a real 4K file) - please check carefully.

Run `npm run dev` for most of this; window-state/multi-monitor checks need
the packaged `.exe` (see the build steps I ran) or `npm run dev` restarted a
few times.

## Keyboard shortcuts
- [ ] Press `?` - a "Keyboard Shortcuts" reference modal opens listing all bindings below; press it again (or click the toolbar `?` button) to close.
- [ ] With the Preview Player visible (not typing in a text field), press Space - playback starts/stops.
- [ ] Press Left/Right arrow - the playhead steps exactly one frame back/forward (pauses playback if it was running).
- [ ] Press Home / End - the playhead jumps to the start / end of the timeline.
- [ ] With a clip selected, press `S` - splits it at the playhead (unchanged from Phase 3, still works).
- [ ] Press `+` / `-` (no clip needs to be selected) - the timeline zooms in/out.
- [ ] Delete / Shift+Delete on a selected clip still lift/ripple-delete as before; Ctrl+Z/Ctrl+Shift+Z/Ctrl+Y still undo/redo.
- [ ] None of the above shortcuts fire while typing in a text field (e.g. the text clip content box, the Export dialog's number inputs) - typing a literal `s`, space, or `+`/`-` there should just type normally.

## Resizable panels
- [ ] Drag the thin vertical divider between the Media Bin and the center column - the Media Bin's width changes live.
- [ ] Drag the thin vertical divider between the center column and the Properties Panel - its width changes live, growing/shrinking in the opposite direction from the Media Bin one (since it's anchored to the right edge).
- [ ] Drag the thin horizontal divider between the Preview Player and the Timeline - the Timeline's height changes live.
- [ ] Close and reopen the app (or just `npm run dev` again) - all three panel sizes are remembered from where you left them.
- [ ] Try dragging a panel to an extreme size - it stops at a sane minimum/maximum rather than collapsing to zero or growing off-screen.

## Window state / multi-monitor
- [ ] Move and resize the app window, then close it via the titlebar X (confirming any unsaved-changes prompt) - reopen the app - it comes back at the same position and size.
- [ ] **If you have a second monitor:** drag the window onto it, close, reopen - it reopens on that same monitor.
- [ ] **If you have a second monitor:** move the window onto it, close the app, then **disconnect** the second monitor (or just simulate by trusting the logic - this is hard to test without real extra hardware) and reopen - the window should NOT reopen off-screen/invisible; it falls back to the default centered size on the remaining display. I could not physically test the disconnect scenario myself - this is the part I'd most appreciate you verifying if you have a multi-monitor setup, since the fallback logic only runs against real `Electron.screen` data I don't have access to.

## Proxy workflow (4K)
- [ ] Import a video at 1080p or below - the Media Bin shows no proxy indicator (proxies are 4K-and-up only, by design).
- [ ] Import a 4K (3840x2160 or wider) video - the Media Bin briefly shows "Generating proxy..." next to it, then switches to a "Proxy" indicator once done.
- [ ] Scrub the timeline/preview with that 4K clip active - it should feel noticeably smoother than scrubbing the original 4K file directly would (the preview is now decoding a ~960px-wide proxy file instead). I don't have a real 4K source to test this against myself - please try with an actual 4K clip if you have one.
- [ ] Save the project, close and reopen it - the 4K clip's proxy is detected as already cached (no regeneration, no "Generating proxy..." flash) and scrubbing is still smooth.
- [ ] **Export a project containing a 4K clip** - open the exported file and confirm it's full 4K resolution, not the ~960px proxy (the export pipeline always reads the original file - this is important to verify since a bug here would silently degrade export quality).

## Regression check
- [ ] Everything from Phases 2-9 still works: import, thumbnails, waveforms, timeline drag/trim/split/ripple/undo, project save/load, transforms/keyframes/transitions, text clips, audio tools, color correction/LUT, and export.
