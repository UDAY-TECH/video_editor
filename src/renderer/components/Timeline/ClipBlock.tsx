import { useEffect, useRef, useState } from 'react';
import type { Clip, MediaAsset } from '@shared/types';
import { toMediaUrl } from '@shared/mediaUrl';
import { timeToPx } from '../../engine/timelineMath';

const EDGE_WIDTH = 8;
const MIN_WIDTH_PX = 6;
const WAVEFORM_CANVAS_WIDTH = 400;
const WAVEFORM_CANVAS_HEIGHT = 32;

interface ClipBlockProps {
  clip: Clip;
  label: string;
  zoom: number;
  selected: boolean;
  asset?: MediaAsset;
  previewStartTime?: number;
  previewDuration?: number;
  onSelect: () => void;
  onMoveStart: (clipId: string, clientX: number) => void;
  onTrimStartEdgeStart: (clipId: string, clientX: number) => void;
  onTrimEndEdgeStart: (clipId: string, clientX: number) => void;
}

export function ClipBlock({
  clip,
  label,
  zoom,
  selected,
  asset,
  previewStartTime,
  previewDuration,
  onSelect,
  onMoveStart,
  onTrimStartEdgeStart,
  onTrimEndEdgeStart,
}: ClipBlockProps): JSX.Element {
  const displayStart = previewStartTime ?? clip.startTime;
  const displayDuration = previewDuration ?? clip.duration;
  const left = timeToPx(displayStart, zoom);
  const width = Math.max(MIN_WIDTH_PX, timeToPx(displayDuration, zoom));
  const isText = Boolean(clip.text);

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>): void {
    e.stopPropagation();
    onSelect();
    const rect = e.currentTarget.getBoundingClientRect();
    const offsetX = e.clientX - rect.left;
    if (offsetX <= EDGE_WIDTH) {
      onTrimStartEdgeStart(clip.id, e.clientX);
    } else if (rect.width - offsetX <= EDGE_WIDTH) {
      onTrimEndEdgeStart(clip.id, e.clientX);
    } else {
      onMoveStart(clip.id, e.clientX);
    }
  }

  return (
    <div
      className={`absolute top-1 bottom-1 rounded border overflow-hidden select-none cursor-grab ${
        isText ? 'bg-purple-900/70' : 'bg-blue-900/70'
      } ${
        selected
          ? isText
            ? 'border-purple-400 ring-1 ring-purple-400'
            : 'border-blue-400 ring-1 ring-blue-400'
          : isText
            ? 'border-purple-800'
            : 'border-blue-800'
      }`}
      style={{ left, width }}
      onMouseDown={handleMouseDown}
    >
      {asset?.type === 'audio' && asset.waveformPath && (
        <WaveformCanvas
          waveformPath={asset.waveformPath}
          assetDuration={asset.duration}
          sourceIn={clip.sourceIn}
          sourceOut={clip.sourceOut}
        />
      )}
      <div
        className={`px-1.5 py-0.5 text-[10px] truncate pointer-events-none relative ${
          isText ? 'text-purple-100' : 'text-blue-100'
        }`}
      >
        {label}
      </div>
      <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize" />
      <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize" />
    </div>
  );
}

function WaveformCanvas({
  waveformPath,
  assetDuration,
  sourceIn,
  sourceOut,
}: {
  waveformPath: string;
  assetDuration: number;
  sourceIn: number;
  sourceOut: number;
}): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(toMediaUrl(waveformPath))
      .then((r) => r.json())
      .then((data: number[]) => {
        if (!cancelled) setPeaks(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [waveformPath]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks || peaks.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, WAVEFORM_CANVAS_WIDTH, WAVEFORM_CANVAS_HEIGHT);

    // Fixed-resolution peaks slice proportionally by sourceIn/sourceOut over
    // the asset's total duration, so trimming shows the correct portion
    // regardless of the clip's on-screen pixel width (CSS stretches this
    // fixed-size buffer to fit, so zoom changes need no redraw).
    const startFrac = assetDuration > 0 ? sourceIn / assetDuration : 0;
    const endFrac = assetDuration > 0 ? sourceOut / assetDuration : 1;
    const startIdx = Math.max(0, Math.floor(startFrac * peaks.length));
    const endIdx = Math.min(peaks.length, Math.max(startIdx + 1, Math.ceil(endFrac * peaks.length)));
    const slice = peaks.slice(startIdx, endIdx);
    if (slice.length === 0) return;

    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    const barWidth = WAVEFORM_CANVAS_WIDTH / slice.length;
    slice.forEach((peak, i) => {
      const barHeight = Math.max(1, peak * WAVEFORM_CANVAS_HEIGHT);
      ctx.fillRect(i * barWidth, (WAVEFORM_CANVAS_HEIGHT - barHeight) / 2, Math.max(1, barWidth - 0.5), barHeight);
    });
  }, [peaks, assetDuration, sourceIn, sourceOut]);

  return (
    <canvas
      ref={canvasRef}
      width={WAVEFORM_CANVAS_WIDTH}
      height={WAVEFORM_CANVAS_HEIGHT}
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}
