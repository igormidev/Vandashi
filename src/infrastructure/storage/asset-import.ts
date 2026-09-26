import type { Asset, AssetDraft } from '../../domain/models';
import type { GitPort } from '../../domain/storage';
import type { AssetStore } from './assets';

/** Caller holds the storage queue through publication and its import commit. */
export async function importAssetWithCommit(
  assets: AssetStore,
  git: GitPort,
  root: string,
  repository: string,
  draft: AssetDraft,
  shared: boolean,
): Promise<Asset> {
  const asset = await assets.import(root, draft, shared);
  await git.commit(
    repository,
    `Add asset: ${asset.title}`,
    `Import ${asset.relativePath} with its title, description, and tags.`,
  );
  return asset;
}
