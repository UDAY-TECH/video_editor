// Single source of truth for the app's keyboard shortcuts reference (shown in
// ShortcutsHelp.tsx). This list is descriptive, not a dispatcher - each
// binding is still implemented locally in the component it operates on
// (PreviewPlayer.tsx, Timeline.tsx, App.tsx), so keep this in sync by hand
// whenever a binding changes.
export interface ShortcutEntry {
  keys: string;
  description: string;
}

export const SHORTCUTS: ShortcutEntry[] = [
  { keys: 'Space', description: 'Play / pause' },
  { keys: '← / →', description: 'Step one frame back / forward' },
  { keys: 'Home / End', description: 'Jump to start / end of timeline' },
  { keys: 'S', description: 'Split selected clip at playhead' },
  { keys: 'Delete', description: 'Delete selected clip (leaves a gap)' },
  { keys: 'Shift+Delete', description: 'Ripple delete selected clip (closes the gap)' },
  { keys: '+ / -', description: 'Zoom timeline in / out' },
  { keys: 'Ctrl+Z', description: 'Undo' },
  { keys: 'Ctrl+Shift+Z / Ctrl+Y', description: 'Redo' },
  { keys: 'Ctrl+S', description: 'Save project' },
  { keys: 'Ctrl+Shift+S', description: 'Save project as...' },
  { keys: 'Ctrl+O', description: 'Open project' },
  { keys: '?', description: 'Show this shortcuts reference' },
];
