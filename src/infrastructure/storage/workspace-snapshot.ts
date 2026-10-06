import type { Scope, Workspace } from '../../domain/models';
import type { GitPort, RecoveryListener } from '../../domain/storage';
import type { Registry } from './registry';
import type { ProjectStore } from './projects';
import type { AssetStore } from './assets';
import { containedPath, hashText } from './files';
import { brandImageRevision } from './brand-image';
import { readYaml } from './yaml-files';
import { launchesSchema } from './schemas';
import { listPresets } from './presets';
export async function workspaceSnapshot({
  scope,
  registry,
  projects,
  assets: assetStore,
  git,
  onRecovery,
  assetDirectory,
  repositories,
}: {
  scope: Scope;
  registry: Registry;
  projects: ProjectStore;
  assets: AssetStore;
  git: GitPort;
  onRecovery?: RecoveryListener | undefined;
  assetDirectory: () => Promise<string>;
  repositories: () => Promise<string[]>;
}): Promise<Workspace> {
  const brand = await projects.brand(scope.brandId);
  if ((await registry.state()).brands.find((entry) => entry.id === brand.id)?.name !== brand.name)
    await registry.update((state) => ({
      ...state,
      brands: state.brands.map((entry) => (entry.id === brand.id ? { ...entry, name: brand.name } : entry)),
    }));
  const video = await projects.video(scope);
  const directory = await assetDirectory();
  if (video) await assetStore.syncShared(await containedPath(brand.path, 'shared_assets'), directory);
  const documents = await projects.documents(brand, video);
  const presets = await listPresets(brand.path, brand.id, git);
  const assets = await assetStore.list(directory, video === null);
  const launches = video ? await readYaml(video.path, 'launch.yml', launchesSchema, git, onRecovery) : [];
  const parent = scope.clipId === null ? video : await projects.video({ ...scope, clipId: null });
  const clips = parent ? await projects.clips(parent) : [];
  const paths = await repositories();
  const hasPresets = paths.some((path) => /[/\\]edition_presets$/u.test(path));
  const statuses = await Promise.all(paths.map(async (repository) => git.status(repository)));
  const revision = hashText(
    JSON.stringify({
      config: brand.config,
      image: await brandImageRevision(await containedPath(brand.path, 'brand_identity'), brand.config.image),
      packaging: video?.packaging,
      documents,
      presets,
      source: video ? await git.contentRevision(video.path) : null,
    }),
  );
  return {
    scope,
    ...(hasPresets ? { presets } : {}),
    brand,
    video,
    documents,
    assets,
    clips,
    launches,
    revision,
    dirty: statuses.some((status) => status.dirty),
  };
}
