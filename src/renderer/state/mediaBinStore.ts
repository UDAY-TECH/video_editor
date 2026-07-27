import { create } from 'zustand';
import type { MediaAsset } from '@shared/types';

interface MediaBinState {
  assets: MediaAsset[];
  selectedAssetId: string | null;
  addAssets: (assets: MediaAsset[]) => void;
  setAssets: (assets: MediaAsset[]) => void;
  updateAsset: (id: string, patch: Partial<MediaAsset>) => void;
  removeAsset: (id: string) => void;
  selectAsset: (id: string | null) => void;
}

export const useMediaBinStore = create<MediaBinState>((set) => ({
  assets: [],
  selectedAssetId: null,
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
}));
