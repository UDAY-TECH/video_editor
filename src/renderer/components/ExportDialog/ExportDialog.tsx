interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ExportDialog({ open, onClose }: ExportDialogProps): JSX.Element | null {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 w-96 text-sm">
        <div className="font-semibold mb-2">Export</div>
        <div className="text-neutral-500 mb-4">Export pipeline not implemented yet (Phase 9).</div>
        <button
          className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs"
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </div>
  );
}
