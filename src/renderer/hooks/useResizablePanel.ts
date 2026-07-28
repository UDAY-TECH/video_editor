import { useState } from 'react';

export function clampSize(size: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, size));
}

function loadSize(storageKey: string, defaultSize: number, min: number, max: number): number {
  if (typeof localStorage === 'undefined') return defaultSize;
  const raw = localStorage.getItem(storageKey);
  const parsed = raw ? parseFloat(raw) : NaN;
  return Number.isFinite(parsed) ? clampSize(parsed, min, max) : defaultSize;
}

// Persists a panel's size (width or height, in px) to localStorage, matching
// the zoom/snapping persistence pattern in timelineStore.ts.
export function useResizablePanel(
  storageKey: string,
  defaultSize: number,
  min: number,
  max: number,
): [number, (size: number | ((prev: number) => number)) => void] {
  const [size, setSizeState] = useState(() => loadSize(storageKey, defaultSize, min, max));

  function setSize(next: number | ((prev: number) => number)): void {
    setSizeState((prev) => {
      const raw = typeof next === 'function' ? next(prev) : next;
      const clamped = clampSize(raw, min, max);
      if (typeof localStorage !== 'undefined') localStorage.setItem(storageKey, String(clamped));
      return clamped;
    });
  }

  return [size, setSize];
}
