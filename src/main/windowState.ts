import { app, screen } from 'electron';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const DEFAULT_SIZE = { width: 1440, height: 900 };
const MIN_VISIBLE_PX = 50;

function windowStatePath(): string {
  return join(app.getPath('userData'), 'window-state.json');
}

export function readWindowStateFile(): Rect | null {
  try {
    const raw = readFileSync(windowStatePath(), 'utf-8');
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.x === 'number' &&
      typeof parsed?.y === 'number' &&
      typeof parsed?.width === 'number' &&
      typeof parsed?.height === 'number'
    ) {
      return parsed as Rect;
    }
  } catch {
    // No saved state yet, or it's corrupted - fall back to defaults.
  }
  return null;
}

export function writeWindowStateFile(bounds: Rect): void {
  try {
    writeFileSync(windowStatePath(), JSON.stringify(bounds));
  } catch {
    // Best-effort - a failed write just means bounds aren't remembered next launch.
  }
}

// A saved position "counts" as visible if it meaningfully overlaps at least
// one currently-connected display - avoids restoring a window off-screen
// after a second monitor it was last placed on gets disconnected.
export function boundsVisibleOnAnyDisplay(bounds: Rect, displays: Rect[]): boolean {
  return displays.some((display) => {
    const overlapWidth =
      Math.min(bounds.x + bounds.width, display.x + display.width) - Math.max(bounds.x, display.x);
    const overlapHeight =
      Math.min(bounds.y + bounds.height, display.y + display.height) - Math.max(bounds.y, display.y);
    return overlapWidth >= MIN_VISIBLE_PX && overlapHeight >= MIN_VISIBLE_PX;
  });
}

// Pulls bounds fully onto `display` - used when a saved position overlaps a
// display (per boundsVisibleOnAnyDisplay) but isn't entirely on it, e.g. a
// second monitor with a different resolution/position than when it was last
// saved. Shrinks width/height to fit if the display itself is smaller than
// the saved size, rather than leaving any edge off-screen.
function clampToDisplay(bounds: Rect, display: Rect): Rect {
  const width = Math.min(bounds.width, display.width);
  const height = Math.min(bounds.height, display.height);
  const x = Math.min(Math.max(bounds.x, display.x), display.x + display.width - width);
  const y = Math.min(Math.max(bounds.y, display.y), display.y + display.height - height);
  return { x, y, width, height };
}

export function resolveInitialBounds(saved: Rect | null, displays: Rect[]): Rect | typeof DEFAULT_SIZE {
  if (!saved) return DEFAULT_SIZE;
  const overlapping = displays.find((display) => boundsVisibleOnAnyDisplay(saved, [display]));
  if (!overlapping) return DEFAULT_SIZE;
  return clampToDisplay(saved, overlapping);
}

export function getInitialWindowBounds(): Rect | typeof DEFAULT_SIZE {
  const saved = readWindowStateFile();
  const displays = screen.getAllDisplays().map((d) => d.bounds);
  return resolveInitialBounds(saved, displays);
}
