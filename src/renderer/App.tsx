import { useState } from 'react';
import { MediaBin } from './components/MediaBin/MediaBin';
import { PreviewPlayer } from './components/PreviewPlayer/PreviewPlayer';
import { Timeline } from './components/Timeline/Timeline';
import { PropertiesPanel } from './components/PropertiesPanel/PropertiesPanel';
import { ExportDialog } from './components/ExportDialog/ExportDialog';

export default function App(): JSX.Element {
  const [exportOpen, setExportOpen] = useState(false);

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-200">
      <div className="h-10 flex items-center justify-between px-3 border-b border-neutral-800 bg-neutral-900 text-sm">
        <span className="font-medium">Video Editor</span>
        <button
          className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs"
          onClick={() => setExportOpen(true)}
        >
          Export
        </button>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="w-64 shrink-0">
          <MediaBin />
        </div>

        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0">
            <PreviewPlayer />
          </div>
          <div className="h-64 shrink-0">
            <Timeline />
          </div>
        </div>

        <div className="w-72 shrink-0">
          <PropertiesPanel />
        </div>
      </div>

      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />
    </div>
  );
}
