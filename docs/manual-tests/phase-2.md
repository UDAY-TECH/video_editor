# Phase 2 Manual Test Checklist

Run `npm run dev`, then walk through:

- [ ] Click **Import**, select a video (MP4/MOV/AVI/WebM), audio (WAV/MP3/AAC), and image (PNG/JPG) — all appear in the Media Bin with filename, duration, and resolution (where applicable).
- [ ] Drag a video file from Windows Explorer onto the Media Bin — it imports the same way as the dialog.
- [ ] Thumbnails appear shortly after import for video/image assets (without blocking the list from showing immediately); audio assets show a placeholder instead of a thumbnail.
- [ ] Click a video asset in the Media Bin — it loads in the Preview Player.
- [ ] Preview Player: play/pause, seek bar drag, frame step forward/back, and current/total time all behave correctly.
- [ ] Click an image asset — it displays in the Preview Player without transport controls.
- [ ] Click the ✕ on a Media Bin item — it's removed from the bin; the source file on disk is untouched.
- [ ] Import a large/long video and confirm the Media Bin list isn't blocked while its thumbnail generates.
