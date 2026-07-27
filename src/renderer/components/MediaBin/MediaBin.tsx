import { useEffect, useState } from 'react';
import { useMediaBinStore } from '../../state/mediaBinStore';
import { toMediaUrl } from '@shared/mediaUrl';
import type { MediaAsset } from '@shared/types';

function formatDuration(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

async function importAndThumbnail(
  paths: string[] | undefined,
  addAssets: (assets: MediaAsset[]) => void,
  updateAsset: (id: string, patch: Partial<MediaAsset>) => void,
): Promise<void> {
  const imported = await window.api.media.import(paths);
  if (imported.length === 0) return;
  addAssets(imported);
  for (const asset of imported) {
    window.api.media
      .generateThumbnail(asset)
      .then((thumbnailPath) => {
        if (thumbnailPath) updateAsset(asset.id, { thumbnailPath });
      })
      .catch(() => {});
  }
}

export function MediaBin(): JSX.Element {
  const assets = useMediaBinStore((s) => s.assets);
  const selectedAssetId = useMediaBinStore((s) => s.selectedAssetId);
  const addAssets = useMediaBinStore((s) => s.addAssets);
  const updateAsset = useMediaBinStore((s) => s.updateAsset);
  const removeAsset = useMediaBinStore((s) => s.removeAsset);
  const selectAsset = useMediaBinStore((s) => s.selectAsset);

  function handleDrop(e: React.DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    const paths = Array.from(e.dataTransfer.files)
      .map((file) => (file as File & { path?: string }).path)
      .filter((p): p is string => Boolean(p));
    if (paths.length > 0) void importAndThumbnail(paths, addAssets, updateAsset);
  }

  return (
    <div
      className="flex h-full flex-col bg-neutral-900 border-r border-neutral-800"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="px-3 py-2 flex items-center justify-between border-b border-neutral-800">
        <span className="text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Media Bin
        </span>
        <button
          className="px-2 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs"
          onClick={() => void importAndThumbnail(undefined, addAssets, updateAsset)}
        >
          Import
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {assets.length === 0 && (
          <div className="text-sm text-neutral-500 p-2">
            No media imported yet. Import or drag files here.
          </div>
        )}
        {assets.map((asset) => (
          <MediaBinItem
            key={asset.id}
            asset={asset}
            selected={asset.id === selectedAssetId}
            onSelect={() => selectAsset(asset.id)}
            onRemove={() => removeAsset(asset.id)}
          />
        ))}
      </div>
    </div>
  );
}

function MediaBinItem({
  asset,
  selected,
  onSelect,
  onRemove,
}: {
  asset: MediaAsset;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}): JSX.Element {
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  useEffect(() => setThumbnailFailed(false), [asset.thumbnailPath]);

  return (
    <div
      className={`flex items-center gap-2 p-1.5 rounded cursor-pointer group ${
        selected ? 'bg-neutral-700' : 'hover:bg-neutral-800'
      }`}
      onClick={onSelect}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/x-media-asset-id', asset.id);
        e.dataTransfer.effectAllowed = 'copy';
      }}
    >
      <div className="w-14 h-9 shrink-0 bg-neutral-950 rounded overflow-hidden flex items-center justify-center text-[10px] text-neutral-600">
        {asset.thumbnailPath && !thumbnailFailed ? (
          <img
            src={toMediaUrl(asset.thumbnailPath)}
            alt=""
            className="w-full h-full object-cover"
            onError={() => setThumbnailFailed(true)}
          />
        ) : (
          asset.type.toUpperCase()
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs truncate">{asset.filePath.split(/[\\/]/).pop()}</div>
        <div className="text-[10px] text-neutral-500">
          {formatDuration(asset.duration)}
          {asset.resolution ? ` · ${asset.resolution.width}x${asset.resolution.height}` : ''}
        </div>
      </div>
      <button
        className="opacity-0 group-hover:opacity-100 text-neutral-500 hover:text-neutral-300 text-xs px-1"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
      >
        ✕
      </button>
    </div>
  );
}
