import { useEffect, useRef, useState } from 'react';
import { useMediaBinStore } from '../../state/mediaBinStore';
import { toMediaUrl } from '@shared/mediaUrl';

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const FRAME_STEP = 1 / 30;

export function PreviewPlayer(): JSX.Element {
  const assets = useMediaBinStore((s) => s.assets);
  const selectedAssetId = useMediaBinStore((s) => s.selectedAssetId);
  const asset = assets.find((a) => a.id === selectedAssetId) ?? null;

  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(asset?.duration ?? 0);
  }, [asset?.id, asset?.duration]);

  function togglePlay(): void {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
  }

  function seekTo(time: number): void {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(time, duration));
  }

  function stepFrame(direction: 1 | -1): void {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    seekTo(video.currentTime + direction * FRAME_STEP);
  }

  if (!asset) {
    return (
      <div className="flex h-full items-center justify-center text-neutral-600 text-sm bg-black">
        Select a clip in the Media Bin to preview
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-black">
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {asset.type === 'image' ? (
          <img src={toMediaUrl(asset.filePath)} alt="" className="max-h-full max-w-full object-contain" />
        ) : (
          <video
            key={asset.id}
            ref={videoRef}
            src={toMediaUrl(asset.filePath)}
            className="max-h-full max-w-full"
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => setIsPlaying(false)}
          />
        )}
      </div>

      {asset.type !== 'image' && (
        <div className="h-12 border-t border-neutral-800 flex items-center px-3 text-xs text-neutral-400 gap-2 shrink-0">
          <button className="px-2 py-1 rounded hover:bg-neutral-800" onClick={() => stepFrame(-1)}>
            ⏮
          </button>
          <button className="px-2 py-1 rounded hover:bg-neutral-800" onClick={togglePlay}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button className="px-2 py-1 rounded hover:bg-neutral-800" onClick={() => stepFrame(1)}>
            ⏭
          </button>
          <span className="tabular-nums">{formatTime(currentTime)}</span>
          <input
            type="range"
            className="flex-1"
            min={0}
            max={duration || 0}
            step={0.01}
            value={currentTime}
            onChange={(e) => seekTo(parseFloat(e.target.value))}
          />
          <span className="tabular-nums">{formatTime(duration)}</span>
        </div>
      )}
    </div>
  );
}
