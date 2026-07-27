# Technical Specification & Project Requirements Document
## Windows Desktop Video Editor

**Document purpose:** This is the master reference for Claude Code to build against. It defines architecture, data models, module boundaries, and feature requirements. Feed this whole document in once at project start (as context), then drive actual work phase-by-phase using Section 9.

---

## 1. Product Overview

**What:** A desktop video editor for Windows, distributed as a double-click `.exe` installer.

**Who it's for:** Single user, local editing (no cloud/collaboration in v1).

**Core user flow:** Import media → arrange on timeline → trim/apply effects/add text/color correct → export to a shareable video file.

### 1.1 Non-Goals (explicitly out of scope for v1)
- Cloud sync / multi-user collaboration
- Mobile or web version
- Plugin marketplace / third-party plugin SDK
- Multi-cam sync, motion tracking, AI auto-captioning
- macOS/Linux builds (Windows-only for now)

Keeping these explicit prevents Claude Code from "helpfully" scope-creeping into them.

---

## 2. Architecture

### 2.1 High-Level Structure

```
┌─────────────────────────────────────────────┐
│                Electron Main                  │
│  - App lifecycle, window management           │
│  - File system access (project files, media)  │
│  - FFmpeg process spawning (encode/decode)     │
│  - IPC bridge to renderer                      │
└───────────────────┬───────────────────────────┘
                     │ IPC (contextBridge, typed channels)
┌───────────────────▼───────────────────────────┐
│              Electron Renderer (React)         │
│  - UI: Media Bin, Preview, Timeline, Panels    │
│  - State: project state, playback state        │
│  - Canvas/WebGL compositor for preview         │
└─────────────────────────────────────────────────┘
```

**Key principle:** All filesystem and FFmpeg operations happen in the **main process**. The renderer never touches the filesystem or spawns processes directly — it talks to main via IPC. This is both an Electron security best practice and keeps the codebase testable.

### 2.2 Tech Stack

| Layer | Choice |
|---|---|
| Shell | Electron (latest stable) |
| UI | React 18 + TypeScript |
| State management | Zustand |
| Styling | Tailwind CSS (or CSS Modules — Claude Code's call, but be consistent) |
| Video/audio processing | FFmpeg (bundled static binary via `ffmpeg-static` or manually vendored) |
| Preview rendering | HTML5 `<video>` element + Canvas 2D/WebGL overlay for effects compositing |
| Packaging | electron-builder, NSIS target (Windows installer) |
| Testing | Vitest (unit), Playwright (E2E for critical flows) |

### 2.3 Process/Module Boundaries

```
/src
  /main                 → Electron main process
    /ipc                → IPC handler registration, one file per domain (media.ts, project.ts, export.ts)
    /ffmpeg             → FFmpeg command builders, process management, progress parsing
    /project-io         → Save/load/serialize project files
    main.ts             → Entry point, window creation
  /renderer             → React app
    /components
      /MediaBin
      /Timeline
      /PreviewPlayer
      /PropertiesPanel
      /ExportDialog
    /state               → Zustand stores (project, playback, selection, undo-history)
    /engine              → Client-side compositing logic (keyframe interpolation, effect application)
    App.tsx
  /shared                → Types/interfaces shared between main and renderer
    types.ts             → ProjectFile, Clip, Track, Effect, Keyframe, etc.
  /preload               → contextBridge exposure, typed IPC wrappers
```

---

## 3. Data Model (Shared Types)

This is the contract both main and renderer code against. Claude Code should define these first, before any UI or IPC code.

```typescript
interface ProjectFile {
  version: string;               // schema version, for migrations
  id: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  settings: ProjectSettings;
  mediaAssets: MediaAsset[];
  tracks: Track[];
}

interface ProjectSettings {
  resolution: { width: number; height: number };
  fps: number;
  sampleRate: number;
}

interface MediaAsset {
  id: string;
  filePath: string;              // absolute path, project does NOT copy media
  type: 'video' | 'audio' | 'image';
  duration: number;               // seconds
  resolution?: { width: number; height: number };
  thumbnailPath?: string;         // cached generated thumbnail
  proxyPath?: string;             // cached generated low-res proxy, optional
}

interface Track {
  id: string;
  type: 'video' | 'audio';
  index: number;                  // stacking order
  muted: boolean;
  locked: boolean;
  clips: Clip[];
}

interface Clip {
  id: string;
  mediaAssetId: string;
  trackId: string;
  startTime: number;              // position on timeline, seconds
  duration: number;
  sourceIn: number;                // trim in-point within source media
  sourceOut: number;               // trim out-point within source media
  speed: number;                   // 1.0 = normal
  transform: Transform;
  effects: Effect[];
  keyframes: Record<string, Keyframe[]>; // keyed by property name
  transitionIn?: Transition;
  transitionOut?: Transition;
}

interface Transform {
  x: number; y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

interface Effect {
  id: string;
  type: 'brightness' | 'contrast' | 'saturation' | 'blur' | 'lut' | string;
  params: Record<string, number | string>;
}

interface Keyframe {
  time: number;                    // relative to clip start
  value: number;
  easing: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';
}

interface Transition {
  type: 'fade' | 'dissolve' | 'wipe';
  duration: number;
}
```

**Instruction to Claude Code:** treat this schema as versioned. Any future field additions must bump `version` and include a migration function in `project-io`.

---

## 4. IPC Contract

Define typed channels up front rather than ad hoc `ipcRenderer.send` calls. Suggested channel groups:

| Channel | Direction | Purpose |
|---|---|---|
| `media:import` | renderer→main | Open file dialog, return selected file metadata |
| `media:generateThumbnail` | renderer→main | Request thumbnail for a media asset |
| `media:generateProxy` | renderer→main | Request proxy generation, returns progress events |
| `project:save` / `project:load` | renderer→main | Serialize/deserialize project file |
| `export:start` | renderer→main | Kick off render job |
| `export:progress` | main→renderer | Progress events (percent, ETA) |
| `export:complete` / `export:error` | main→renderer | Terminal states |

All main→renderer progress events should use a consistent `{ jobId, percent, message }` shape.

---

## 5. Feature Requirements by Module

### 5.1 Media Bin
- Import via file dialog or drag-and-drop from Windows Explorer
- Supported formats: MP4, MOV, AVI, WebM (video); WAV, MP3, AAC (audio); PNG, JPG (images)
- Display: thumbnail, filename, duration, resolution
- Generate thumbnails via FFmpeg (`-ss` seek + single frame extract) asynchronously, don't block import
- Delete/remove from bin (does not delete source file on disk)

### 5.2 Preview Player
- Render current timeline frame at playhead position
- Playback controls: play/pause, seek bar, current time/total time, frame step forward/back
- Must reflect: trims, transforms, opacity, applied effects, text overlays — i.e., it's a real compositor, not just playing raw media
- Target: smooth scrubbing on 1080p source; acceptable to drop to proxy resolution during scrub if performance requires

### 5.3 Timeline
- Multi-track: minimum 2 video + 2 audio tracks, expandable
- Drag clip from Media Bin → creates Clip on Track
- Trim via edge-drag, split via razor tool (keyboard shortcut + toolbar button)
- Ripple delete vs. lift (leave gap) — both supported, default to lift with explicit ripple action
- Snapping: clip edges snap to other clip edges and playhead, toggleable
- Zoom control (horizontal), persistent across sessions
- Undo/redo covering all timeline mutations (use command pattern, not just state snapshots, to keep memory reasonable)

### 5.4 Properties Panel
- Context-sensitive: shows properties for currently selected clip
- Transform controls (position, scale, rotation, opacity) with numeric input + drag handles on preview
- Keyframe toggle per property; keyframe markers appear on a mini-timeline within this panel
- Effects list: add/remove/reorder effects on selected clip

### 5.5 Text & Overlays
- Add text clip as its own clip type on a video track
- Font family (system fonts), size, color, alignment
- Basic entrance/exit animation presets (fade, slide)
- Image overlay: import via Media Bin, place as clip with transform controls

### 5.6 Audio Tools
- Per-clip volume, keyframeable
- Per-track mute/solo
- Waveform rendering (generate via FFmpeg audio extraction + peak data, cache alongside thumbnails)
- Audio ducking: rule-based (when Track A has audio, reduce Track B gain by X dB) — not ML-based in v1

### 5.7 Color Correction
- Brightness, contrast, saturation, exposure — implemented as FFmpeg filter chain at export time, and as Canvas/WebGL filter approximation for live preview
- LUT import (`.cube` file parsing) and application, same dual approach (preview approximation + accurate FFmpeg filter at export)

### 5.8 Export
- Dialog: output path, container (MP4/MOV/WebM), codec (H.264/H.265/VP9), resolution, bitrate or quality target, fps
- Presets: "YouTube 1080p", "Instagram Reel (vertical)", "Custom"
- Render pipeline: build FFmpeg filter graph from timeline state (this is the most complex piece — see 5.9)
- Background execution with progress reporting; UI remains responsive
- Hardware encoder detection (NVENC/QSV) with automatic fallback to libx264

### 5.9 Render/Export Pipeline (Critical Path — flag for careful design)
This is the hardest engineering problem in the whole app: translating the timeline data model into a single FFmpeg command (or sequence of commands) that reproduces exactly what the preview shows.

Recommended approach:
1. Walk tracks bottom-to-top, clips left-to-right by `startTime`
2. For each clip, build an FFmpeg filter chain segment: trim → speed → scale/transform → effects → opacity
3. Composite layers using `overlay` filter, respecting track stacking order
4. Concatenate/overlay transitions between adjacent clips using `xfade` or crossfade filters
5. Mix audio tracks with per-track/per-clip volume via `amix`/`volume` filters
6. Output via chosen codec/container settings

**Note for Claude Code:** build this incrementally — start with a single-track, single-clip export, then add multi-track compositing, then transitions, then effects. Don't attempt the full filter graph generator in one pass.

---

## 6. Performance Requirements

- App launch to usable UI: < 3 seconds
- Timeline scrubbing: no visible stutter on 1080p H.264 source (proxy generation may be used to guarantee this)
- Export: should saturate hardware encoder (NVENC etc.) when available rather than falling back to slow CPU encode unnecessarily
- Project with 50+ clips across 4 tracks should not degrade UI responsiveness

---

## 7. Packaging & Distribution

- `electron-builder` config targeting `nsis` (Windows installer producing a `.exe`)
- App icon, product name, version set in `package.json` build config
- Bundle FFmpeg binary within the app package (via `extraResources`), so end users need no separate install
- Code signing: out of scope for v1 (unsigned exe is fine for personal/local use; note Windows SmartScreen will warn on first run)

---

## 8. Testing Strategy

- Unit tests (Vitest) for: keyframe interpolation logic, FFmpeg command builders, project file serialization/migration
- E2E tests (Playwright) for critical paths: import media → place on timeline → export produces a valid file
- Manual test checklist maintained per phase (Claude Code should generate one after each phase's feature set is implemented)

---

## 9. Delivery Phases (drive Claude Code with these, one at a time)

| Phase | Deliverable |
|---|---|
| 1 | Electron+React skeleton, panel layout, working electron-builder `.exe` output |
| 2 | Media import, media bin, thumbnails, preview playback of a single clip |
| 3 | Timeline core: multi-track, drag/trim/split/ripple, undo/redo |
| 4 | Project save/load with schema from Section 3 |
| 5 | Transforms + keyframing + basic transitions |
| 6 | Text clips + image overlays |
| 7 | Audio tools (volume, mute/solo, waveforms, ducking) |
| 8 | Color correction + LUT support |
| 9 | Export pipeline (Section 5.9), starting single-clip, building to full multi-track |
| 10 | Polish: shortcuts, dockable panels, multi-monitor, proxy workflow for 4K |

Each phase should end with: a working build, a short manual test pass, and a commit. Don't let Claude Code start Phase N+1 work inside the same session/context as Phase N without confirming Phase N actually builds and runs.

---

## 10. First Prompt to Claude Code

```
I'm providing a full technical specification for a Windows desktop video
editor (Electron + React + TypeScript + FFmpeg, packaged with
electron-builder to a Windows .exe). Read the attached spec in full for
architecture, data model, and IPC contract — treat it as the source of
truth for how modules should be structured.

Do NOT attempt to build all phases now. Implement Phase 1 only from
Section 9: project skeleton, panel layout, and a confirmed working
electron-builder packaging pipeline producing a runnable .exe. Set up the
folder structure exactly as described in Section 2.3, and define the
shared types from Section 3 even though most fields won't be used yet.

Stop after Phase 1 and tell me how to build and run it.
```
