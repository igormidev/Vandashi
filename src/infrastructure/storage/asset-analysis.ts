import type { Asset } from '../../domain/models';
import type { AssetAnalysis } from '../../domain/transcription';
import { AssetStore } from './assets';

/** App and CLI share this exact sidecar writer; the caller authorizes the asset root and owns Git. */
export function saveAssetAnalysis(
  root: string,
  input: { assetPath: string; expectedRevision: string; analysis: AssetAnalysis },
  options: { shared?: boolean; mediaUrl?: (path: string) => string } = {},
): Promise<Asset> {
  return new AssetStore(options.mediaUrl ?? ((path) => path)).saveAnalysis(
    root,
    input,
    options.shared ?? false,
  );
}
