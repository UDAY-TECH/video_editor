import { create } from 'zustand';
import type { MediaAsset } from '@shared/types';

interface MediaBinState {
  assets: MediaAsset[];
  selectedAssetId: string | null;
  // Tracked centrally (rather than as MediaBin.tsx local state) so both entry
  // points that can kick off a background proxy job - a fresh import
  // (MediaBin.tsx) and reopening a project (projectIO.ts's regenerateProxies)
  // - can mark/clear the same "generating..." indicator.
  pendingProxyAssetIds: Set<string>;
  addAssets: (assets: MediaAsset[]) => void;
  setAssets: (assets: MediaAsset[]) => void;
  updateAsset: (id: string, patch: Partial<MediaAsset>) => void;
  removeAsset: (id: string) => void;
  selectAsset: (id: string | null) => void;
  markProxyPending: (assetId: string) => void;
  clearProxyPending: (assetId: string) => void;
}

export const useMediaBinStore = create<MediaBinState>((set) => ({
  assets: [],
  selectedAssetId: null,
  pendingProxyAssetIds: new Set(),
  addAssets: (assets) => set((state) => ({ assets: [...state.assets, ...assets] })),
  setAssets: (assets) => set({ assets, selectedAssetId: null }),
  updateAsset: (id, patch) =>
    set((state) => ({
      assets: state.assets.map((asset) => (asset.id === id ? { ...asset, ...patch } : asset)),
    })),
  removeAsset: (id) =>
    set((state) => ({
      assets: state.assets.filter((asset) => asset.id !== id),
      selectedAssetId: state.selectedAssetId === id ? null : state.selectedAssetId,
    })),
  selectAsset: (id) => set({ selectedAssetId: id }),
  markProxyPending: (assetId) =>
    set((state) => ({ pendingProxyAssetIds: new Set(state.pendingProxyAssetIds).add(assetId) })),
  clearProxyPending: (assetId) =>
    set((state) => {
      if (!state.pendingProxyAssetIds.has(assetId)) return state;
      const next = new Set(state.pendingProxyAssetIds);
      next.delete(assetId);
      return { pendingProxyAssetIds: next };
    }),
}));
