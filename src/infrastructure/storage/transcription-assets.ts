import { lstat, readFile, realpath } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { AppFault } from '../../domain/diagnostics';
import type { GitPort, StoragePort, TranscriptionAssetSelection } from '../../domain/storage';
import type { Asset } from '../../domain/models';
import type { AssetStore } from './assets';
import type { Registry } from './registry';
import { containedPath, errorCode, isWithin, type SerialQueue } from './files';
import { discoverAgentScope } from './agent-scope';
import { videoRecordSchema, type VideoRecord } from './schemas';

export interface TranscriptionAssetRoot {
  path: string;
  shared: boolean;
}

export class TranscriptionAssets {
  constructor(
    private readonly registry: Registry,
    private readonly git: GitPort,
    private readonly assets: AssetStore,
    private readonly writes: SerialQueue,
  ) {}
  async list(selection: TranscriptionAssetSelection): Promise<Asset[]> {
    const roots = await transcriptionAssetRoots(this.registry, this.git, selection);
    const result: Asset[] = [];
    for (const root of roots) {
      const found = await this.assets.list(root.path, root.shared);
      result.push(
        ...found.filter(
          (asset) => (asset.kind === 'audio' || asset.kind === 'video') && (root.shared || !asset.shared),
        ),
      );
    }
    return result;
  }
  save(input: Parameters<StoragePort['saveAssetAnalysis']>[0]): Promise<Asset> {
    return this.writes.run(async () => {
      const root = await transcriptionRootForAsset(this.registry, this.git, input.assetPath);
      return this.assets.saveAnalysis(root.path, input, root.shared);
    });
  }
}

export async function transcriptionRootForAsset(
  registry: Registry,
  git: GitPort,
  assetPath: string,
): Promise<TranscriptionAssetRoot> {
  const brands = (await registry.state()).brands;
  for (const brand of brands) {
    if (!isWithin(brand.path, assetPath)) continue;
    const root = await realpath(brand.path);
    const parts = relative(root, assetPath).split(/[\\/]/u);
    let repository: string | null = null;
    if (parts[0] === 'shared_assets' && parts.length > 1) repository = join(root, 'shared_assets');
    else if (parts[0] === 'videos' && parts[2] === 'video_assets' && parts.length > 3)
      repository = join(root, 'videos', parts[1] ?? '');
    else if (parts[0] === 'videos' && parts[2] === 'clips' && parts[4] === 'video_assets' && parts.length > 5)
      repository = join(root, 'videos', parts[1] ?? '', 'clips', parts[3] ?? '');
    if (!repository) continue;
    const result = (
      await transcriptionAssetRoots(registry, git, { kind: 'repositories', paths: [repository] })
    )[0];
    if (
      !result ||
      relative(result.path, assetPath)
        .split(/[\\/]/u)
        .some((part) => part.startsWith('.'))
    )
      throw new AppFault({ id: 'storageUnregisteredPath' });
    if (!result.shared && relative(result.path, assetPath).split(/[\\/]/u)[0] === '_shared')
      throw new AppFault({ id: 'storageSharedEditRequired' });
    return result;
  }
  throw new AppFault({ id: 'storageUnregisteredPath' });
}

async function directory(root: string, path: string): Promise<string> {
  if ((await lstat(root)).isSymbolicLink()) throw new AppFault({ id: 'storageSymlinkOutside' });
  const safe = await containedPath(root, path);
  let current = root;
  for (const part of relative(root, safe).split(/[\\/]/u).filter(Boolean)) {
    current = join(current, part);
    const info = await lstat(current);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new AppFault({ id: 'storageSymlinkOutside' });
  }
  return safe;
}

async function record(path: string, git: GitPort): Promise<VideoRecord> {
  const manifest = await containedPath(path, '.vandashi.yml');
  const info = await lstat(manifest).catch((error: unknown) => {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  });
  if (info && (info.isSymbolicLink() || !info.isFile()))
    throw new AppFault({ id: 'storageVideoBrandInvalid' });
  try {
    return videoRecordSchema.parse(parse(await readFile(manifest, 'utf8')));
  } catch {
    // Reading committed identity does not repair an AI's temporarily invalid working YAML.
    return videoRecordSchema.parse(parse(await git.readAt(path, await git.head(path), '.vandashi.yml')));
  }
}

/** Read-only registry/identity discovery. Never hydrate workspaces or synchronize shared copies. */
export async function transcriptionAssetRoots(
  registry: Registry,
  git: GitPort,
  selection: TranscriptionAssetSelection,
): Promise<TranscriptionAssetRoot[]> {
  if (selection.kind === 'scope') {
    const discovered = await discoverAgentScope(registry, git, selection.scope);
    const root = selection.scope.videoId
      ? await directory(discovered.cwd, 'video_assets')
      : await directory(discovered.sharedRoot, '.');
    return [{ path: root, shared: selection.scope.videoId === null }];
  }
  const brands = (await registry.state()).brands;
  const roots: TranscriptionAssetRoot[] = [];
  const requested =
    selection.kind === 'repositories' ? new Set(selection.paths.map((path) => resolve(path))) : null;
  for (const brand of brands) {
    // An unrelated stale recent folder must not block a captured AI scope.
    if (requested && ![...requested].some((path) => isWithin(brand.path, path))) continue;
    const root = await realpath(brand.path);
    if (!requested) {
      roots.push({ path: await directory(root, 'shared_assets'), shared: true });
      continue;
    }
    for (const path of [...requested]) {
      if (!isWithin(root, path)) continue;
      const safe = await directory(root, path);
      const parts = relative(root, safe).split(/[\\/]/u);
      if (parts.length === 1 && parts[0] === 'brand_identity') {
        requested.delete(path);
        continue;
      }
      if (parts.length === 1 && parts[0] === 'shared_assets') {
        roots.push({ path: safe, shared: true });
        requested.delete(path);
        continue;
      }
      if (parts[0] !== 'videos' || (parts.length !== 2 && !(parts.length === 4 && parts[2] === 'clips')))
        continue;
      const parent = await record(await directory(root, join('videos', parts[1] ?? '')), git);
      if (parent.brandId !== brand.id || parent.parentVideoId !== undefined)
        throw new AppFault({ id: 'storageVideoBrandInvalid' });
      if (parts.length === 4) {
        const child = await record(safe, git);
        if (
          child.brandId !== brand.id ||
          child.parentVideoId !== parent.id ||
          child.start === undefined ||
          child.end === undefined
        )
          throw new AppFault({ id: 'storageClipParentInvalid' });
      }
      roots.push({ path: await directory(safe, 'video_assets'), shared: false });
      requested.delete(path);
    }
  }
  if (requested?.size) throw new AppFault({ id: 'storageUnregisteredPath' });
  return roots.filter((root, index) => roots.findIndex((item) => item.path === root.path) === index);
}
