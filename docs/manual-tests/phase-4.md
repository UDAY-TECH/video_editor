# Phase 4 Manual Test Checklist

Run `npm run dev`, then walk through:

- [ ] Import a couple of clips and place some on the timeline, then click **Save** — a native save dialog appears (defaulting to `Untitled Project.veproj`); pick a location and confirm the file is written there.
- [ ] After that first save, edit the timeline again and click **Save** — it saves directly to the same file with no dialog this time.
- [ ] Click **Save As** — a dialog appears again even though a file path is already known, and saving updates the title bar to the new path/name.
- [ ] Click **New** with unsaved changes present — a confirm prompt appears; canceling leaves the project untouched, confirming resets to an empty project (default 2 video + 2 audio tracks, empty Media Bin).
- [ ] Click **Open**, pick a previously saved `.veproj` file — the Media Bin and Timeline repopulate to match exactly what was saved (same clips, positions, trims).
- [ ] After opening a project, thumbnails reappear in the Media Bin (regenerated if the cache was cleared, or reused if still present).
- [ ] The project name / dirty indicator (•) in the top bar appears after any edit and clears after a successful save.
- [ ] Keyboard shortcuts: **Ctrl+S** saves, **Ctrl+Shift+S** forces Save As, **Ctrl+O** opens.
- [ ] Manually edit a saved `.veproj` file's `"version"` field to something bogus and try to open it — the app shows an error alert instead of crashing.
- [ ] Manually corrupt a saved `.veproj` file's clip (e.g. delete a clip's `transform` field) and try to open it — the app shows an error alert instead of crashing or silently loading a broken clip.
- [ ] Make an edit (dirty indicator appears), then close the app window via the title bar's X button — a "You have unsaved changes" prompt appears; Cancel keeps the app open, OK quits.
- [ ] With no unsaved changes, close the app window via the X button — it quits immediately with no prompt.
- [ ] After opening or creating a new project, confirm the dirty indicator does *not* reappear on its own a moment later (this was a bug: background thumbnail regeneration used to falsely mark the project dirty right after a clean load).
