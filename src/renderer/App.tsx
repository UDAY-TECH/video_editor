import { useEffect, useState } from 'react';
import { MediaBin } from './components/MediaBin/MediaBin';
import { PreviewPlayer } from './components/PreviewPlayer/PreviewPlayer';
import { Timeline } from './components/Timeline/Timeline';
import { PropertiesPanel } from './components/PropertiesPanel/PropertiesPanel';
import { ExportDialog } from './components/ExportDialog/ExportDialog';
import { useProjectStore } from './state/projectStore';
import { saveProject, loadProject, resetToNewProject, initDirtyTracking } from './state/projectIO';

export default function App(): JSX.Element {
  const [exportOpen, setExportOpen] = useState(false);
  const projectName = useProjectStore((s) => s.name);
  const isDirty = useProjectStore((s) => s.isDirty);

  useEffect(() => initDirtyTracking(), []);

  useEffect(() => {
    return window.api.app.onCheckUnsavedBeforeClose(() => {
      const shouldClose =
        !useProjectStore.getState().isDirty ||
        window.confirm('You have unsaved changes. Quit anyway?');
      window.api.app.confirmCloseResult(shouldClose);
    });
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA'].includes(target.tagName)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void handleSave(e.shiftKey);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        void handleOpen();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  async function handleSave(saveAs: boolean): Promise<void> {
    try {
      await saveProject(saveAs);
    } catch (err) {
      window.alert(`Failed to save project: ${(err as Error).message}`);
    }
  }

  async function handleOpen(): Promise<void> {
    if (useProjectStore.getState().isDirty) {
      if (!window.confirm('Discard unsaved changes and open a different project?')) return;
    }
    try {
      await loadProject();
    } catch (err) {
      window.alert(`Failed to open project: ${(err as Error).message}`);
    }
  }

  function handleNew(): void {
    if (useProjectStore.getState().isDirty) {
      if (!window.confirm('Discard unsaved changes and start a new project?')) return;
    }
    resetToNewProject();
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-200">
      <div className="h-10 flex items-center justify-between px-3 border-b border-neutral-800 bg-neutral-900 text-sm">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-medium shrink-0">Video Editor</span>
          <span className="text-neutral-500 truncate">
            {projectName}
            {isDirty ? ' •' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button className="px-2 py-1 rounded hover:bg-neutral-800 text-xs" onClick={handleNew}>
            New
          </button>
          <button
            className="px-2 py-1 rounded hover:bg-neutral-800 text-xs"
            onClick={() => void handleOpen()}
          >
            Open
          </button>
          <button
            className="px-2 py-1 rounded hover:bg-neutral-800 text-xs"
            onClick={() => void handleSave(false)}
          >
            Save
          </button>
          <button
            className="px-2 py-1 rounded hover:bg-neutral-800 text-xs"
            onClick={() => void handleSave(true)}
          >
            Save As
          </button>
          <button
            className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs"
            onClick={() => setExportOpen(true)}
          >
            Export
          </button>
        </div>
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
