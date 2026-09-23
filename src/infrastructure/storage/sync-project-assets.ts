import type { Scope } from '../../domain/models';
import type { AssetStore } from './assets';
import type { GitPort } from '../../domain/storage';
import type { Registry } from './registry';
import { containedPath } from './files';
import { discoverAgentScope } from './agent-scope';

export async function syncProjectAssets(
  registry: Registry,
  git: GitPort,
  assets: AssetStore,
  scope: Scope,
): Promise<void> {
  if (!scope.videoId) return;
  const { sharedRoot, cwd } = await discoverAgentScope(registry, git, scope);
  await assets.syncShared(sharedRoot, await containedPath(cwd, 'video_assets'));
}
