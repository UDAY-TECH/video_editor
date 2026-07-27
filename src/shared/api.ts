import type { MediaAsset } from './types';

export interface MediaApi {
  import(paths?: string[]): Promise<MediaAsset[]>;
  generateThumbnail(
    asset: Pick<MediaAsset, 'id' | 'filePath' | 'type' | 'duration'>,
  ): Promise<string | null>;
}

export interface Api {
  media: MediaApi;
}
