import { useEffect, useRef, useState } from 'react';
import { useProjectStore } from '../../state/projectStore';
import { buildProjectFile } from '../../state/projectIO';
import type { ExportContainer, ExportCodec, ExportSettings } from '@shared/types';

interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

interface Preset {
  label: string;
  resolution: { width: number; height: number };
  container: ExportContainer;
  codec: ExportCodec;
  quality: ExportSettings['quality'];
}

const PRESETS: Preset[] = [
  {
    label: 'YouTube 1080p',
    resolution: { width: 1920, height: 1080 },
    container: 'mp4',
    codec: 'h264',
    quality: { mode: 'bitrate', kbps: 8000 },
  },
  {
    label: 'Instagram Reel (vertical)',
    resolution: { width: 1080, height: 1920 },
    container: 'mp4',
    codec: 'h264',
    quality: { mode: 'bitrate', kbps: 6000 },
  },
];

type DialogState =
  | { phase: 'form' }
  | { phase: 'running'; jobId: string; percent: number; message: string }
  | { phase: 'done'; outputPath: string }
  | { phase: 'error'; message: string };

export function ExportDialog({ open, onClose }: ExportDialogProps): JSX.Element | null {
  const projectName = useProjectStore((s) => s.name);
  const projectSettings = useProjectStore((s) => s.settings);

  const [container, setContainer] = useState<ExportContainer>('mp4');
  const [codec, setCodec] = useState<ExportCodec>('h264');
  const [resolution, setResolution] = useState(projectSettings.resolution);
  const [fps, setFps] = useState(projectSettings.fps);
  const [quality, setQuality] = useState<ExportSettings['quality']>({ mode: 'crf', value: 20 });
  const [state, setState] = useState<DialogState>({ phase: 'form' });

  const unsubscribersRef = useRef<Array<() => void>>([]);

  useEffect(() => {
    if (!open) return;
    setState({ phase: 'form' });
    setResolution(projectSettings.resolution);
    setFps(projectSettings.fps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => {
      for (const unsub of unsubscribersRef.current) unsub();
    };
  }, []);

  if (!open) return null;

  function applyPreset(preset: Preset): void {
    setContainer(preset.container);
    setCodec(preset.codec);
    setResolution(preset.resolution);
    setQuality(preset.quality);
  }

  async function handleStart(): Promise<void> {
    const outputPath = await window.api.export.pickOutputPath(projectName || 'export', container);
    if (!outputPath) return;

    // Retrying after an error re-enters this function on the same mounted
    // dialog - clear out the previous run's listeners first so they don't
    // leak (they'd otherwise just accumulate on every retry).
    for (const unsub of unsubscribersRef.current) unsub();
    unsubscribersRef.current = [];

    const settings: ExportSettings = { outputPath, container, codec, resolution, fps, quality };
    const project = buildProjectFile();
    const { jobId } = await window.api.export.start(project, settings);
    setState({ phase: 'running', jobId, percent: 0, message: 'Starting...' });

    const unsubProgress = window.api.export.onProgress((event) => {
      if (event.jobId !== jobId) return;
      setState({ phase: 'running', jobId, percent: event.percent, message: event.message });
    });
    const unsubComplete = window.api.export.onComplete((event) => {
      if (event.jobId !== jobId) return;
      setState({ phase: 'done', outputPath: event.outputPath });
    });
    const unsubError = window.api.export.onError((event) => {
      if (event.jobId !== jobId) return;
      setState({ phase: 'error', message: event.message });
    });
    unsubscribersRef.current = [unsubProgress, unsubComplete, unsubError];
  }

  function handleCancel(): void {
    if (state.phase !== 'running') return;
    window.api.export.cancel(state.jobId);
    for (const unsub of unsubscribersRef.current) unsub();
    unsubscribersRef.current = [];
    setState({ phase: 'form' });
  }

  function handleClose(): void {
    if (state.phase === 'running') return;
    for (const unsub of unsubscribersRef.current) unsub();
    unsubscribersRef.current = [];
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center">
      <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-4 w-[28rem] text-sm space-y-3">
        <div className="font-semibold">Export</div>

        {state.phase === 'form' && (
          <>
            <div className="space-y-1">
              <span className="text-xs text-neutral-400">Presets</span>
              <div className="flex gap-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    className="flex-1 px-2 py-1 rounded bg-neutral-800 hover:bg-neutral-700 text-xs"
                    onClick={() => applyPreset(preset)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-xs text-neutral-400">Container</span>
                <select
                  className="w-full bg-neutral-800 rounded px-2 py-1 text-xs"
                  value={container}
                  onChange={(e) => setContainer(e.target.value as ExportContainer)}
                >
                  <option value="mp4">MP4</option>
                  <option value="mov">MOV</option>
                  <option value="webm">WebM</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-neutral-400">Codec</span>
                <select
                  className="w-full bg-neutral-800 rounded px-2 py-1 text-xs"
                  value={codec}
                  onChange={(e) => setCodec(e.target.value as ExportCodec)}
                >
                  <option value="h264">H.264</option>
                  <option value="h265">H.265</option>
                  <option value="vp9">VP9</option>
                </select>
              </label>
              <label className="space-y-1">
                <span className="text-xs text-neutral-400">Width</span>
                <input
                  type="number"
                  className="w-full bg-neutral-800 rounded px-2 py-1 text-xs"
                  value={resolution.width}
                  min={2}
                  onChange={(e) => setResolution((r) => ({ ...r, width: parseInt(e.target.value, 10) || r.width }))}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-neutral-400">Height</span>
                <input
                  type="number"
                  className="w-full bg-neutral-800 rounded px-2 py-1 text-xs"
                  value={resolution.height}
                  min={2}
                  onChange={(e) =>
                    setResolution((r) => ({ ...r, height: parseInt(e.target.value, 10) || r.height }))
                  }
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-neutral-400">FPS</span>
                <input
                  type="number"
                  className="w-full bg-neutral-800 rounded px-2 py-1 text-xs"
                  value={fps}
                  min={1}
                  onChange={(e) => setFps(parseInt(e.target.value, 10) || fps)}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs text-neutral-400">Quality mode</span>
                <select
                  className="w-full bg-neutral-800 rounded px-2 py-1 text-xs"
                  value={quality.mode}
                  onChange={(e) =>
                    setQuality(
                      e.target.value === 'crf' ? { mode: 'crf', value: 20 } : { mode: 'bitrate', kbps: 8000 },
                    )
                  }
                >
                  <option value="crf">Quality (CRF)</option>
                  <option value="bitrate">Bitrate</option>
                </select>
              </label>
              {quality.mode === 'crf' ? (
                <label className="space-y-1">
                  <span className="text-xs text-neutral-400">CRF (lower = better)</span>
                  <input
                    type="number"
                    className="w-full bg-neutral-800 rounded px-2 py-1 text-xs"
                    value={quality.value}
                    min={0}
                    max={51}
                    onChange={(e) => setQuality({ mode: 'crf', value: parseInt(e.target.value, 10) || 0 })}
                  />
                </label>
              ) : (
                <label className="space-y-1">
                  <span className="text-xs text-neutral-400">Bitrate (kbps)</span>
                  <input
                    type="number"
                    className="w-full bg-neutral-800 rounded px-2 py-1 text-xs"
                    value={quality.kbps}
                    min={100}
                    onChange={(e) => setQuality({ mode: 'bitrate', kbps: parseInt(e.target.value, 10) || 0 })}
                  />
                </label>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs" onClick={handleClose}>
                Cancel
              </button>
              <button
                className="px-3 py-1 rounded bg-blue-700 hover:bg-blue-600 text-xs"
                onClick={() => void handleStart()}
              >
                Export
              </button>
            </div>
          </>
        )}

        {state.phase === 'running' && (
          <>
            <div className="text-neutral-400">Exporting... {state.message}</div>
            <div className="h-2 bg-neutral-800 rounded overflow-hidden">
              <div className="h-full bg-blue-600" style={{ width: `${state.percent}%` }} />
            </div>
            <div className="text-xs text-neutral-500">{state.percent.toFixed(0)}%</div>
            <div className="flex justify-end pt-2">
              <button className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs" onClick={handleCancel}>
                Cancel Export
              </button>
            </div>
          </>
        )}

        {state.phase === 'done' && (
          <>
            <div className="text-green-400">Export complete.</div>
            <div className="text-xs text-neutral-500 break-all">{state.outputPath}</div>
            <div className="flex justify-end pt-2">
              <button className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs" onClick={handleClose}>
                Close
              </button>
            </div>
          </>
        )}

        {state.phase === 'error' && (
          <>
            <div className="text-red-400">Export failed.</div>
            <div className="text-xs text-neutral-500 break-all max-h-40 overflow-y-auto">{state.message}</div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs"
                onClick={() => setState({ phase: 'form' })}
              >
                Back
              </button>
              <button className="px-3 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs" onClick={handleClose}>
                Close
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
