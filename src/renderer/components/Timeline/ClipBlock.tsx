import type { Clip } from '@shared/types';
import { timeToPx } from '../../engine/timelineMath';

const EDGE_WIDTH = 8;
const MIN_WIDTH_PX = 6;

interface ClipBlockProps {
  clip: Clip;
  label: string;
  zoom: number;
  selected: boolean;
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
      className={`absolute top-1 bottom-1 rounded border overflow-hidden select-none cursor-grab bg-blue-900/70 ${
        selected ? 'border-blue-400 ring-1 ring-blue-400' : 'border-blue-800'
      }`}
      style={{ left, width }}
      onMouseDown={handleMouseDown}
    >
      <div className="px-1.5 py-0.5 text-[10px] truncate text-blue-100 pointer-events-none">{label}</div>
      <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize" />
      <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize" />
    </div>
  );
}
