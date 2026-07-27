export function PreviewPlayer(): JSX.Element {
  return (
    <div className="flex h-full flex-col bg-black">
      <div className="flex-1 flex items-center justify-center text-neutral-600 text-sm">
        Preview
      </div>
      <div className="h-12 border-t border-neutral-800 flex items-center px-3 text-xs text-neutral-500 gap-3">
        <span>00:00:00</span>
        <div className="flex-1 h-1 bg-neutral-800 rounded" />
        <span>00:00:00</span>
      </div>
    </div>
  );
}
