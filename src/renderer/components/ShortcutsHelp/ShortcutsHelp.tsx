import { SHORTCUTS } from '../../shortcuts';

interface ShortcutsHelpProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsHelp({ open, onClose }: ShortcutsHelpProps): JSX.Element | null {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 w-96 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-semibold mb-3">Keyboard Shortcuts</div>
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-neutral-400">{shortcut.description}</span>
              <span className="shrink-0 px-1.5 py-0.5 rounded bg-neutral-800 font-mono">{shortcut.keys}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-3">
          <button className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
