export function PropertiesPanel(): JSX.Element {
  return (
    <div className="flex h-full flex-col bg-neutral-900 border-l border-neutral-800">
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-400 border-b border-neutral-800">
        Properties
      </div>
      <div className="flex-1 p-3 text-sm text-neutral-500">No clip selected.</div>
    </div>
  );
}
