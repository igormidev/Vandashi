import { readFile, readdir, realpath } from 'node:fs/promises';
import { parse } from 'yaml';
import { AppFault } from '../../domain/diagnostics';
import type { Scope } from '../../domain/models';
import type { AgentScopePaths, GitPort } from '../../domain/storage';
import { containedPath, exists } from './files';
import type { Registry } from './registry';
import { videoRecordSchema, type VideoRecord } from './schemas';
import { storageFault } from './validation';

interface ProjectPath {
  path: string;
  record: VideoRecord;
}

/** Invalid working manifests can identify their registered repository from HEAD, without repairing it. */
async function projectRecord(path: string, git: GitPort): Promise<VideoRecord> {
  try {
    const source = await readFile(await containedPath(path, '.vandashi.yml'), 'utf8');
    return videoRecordSchema.parse(parse(source));
  } catch (error) {
    try {
      return videoRecordSchema.parse(parse(await git.readAt(path, await git.head(path), '.vandashi.yml')));
    } catch {
      throw storageFault({ id: 'storageMetadataInvalid', params: { name: '.vandashi.yml' } }, error);
    }
  }
}

async function projects(directory: string, git: GitPort): Promise<ProjectPath[]> {
  if (!(await exists(directory))) return [];
  const result: ProjectPath[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
    const path = await containedPath(directory, entry.name);
    if (
      !(await exists(await containedPath(path, '.vandashi.yml'))) &&
      !(await exists(await containedPath(path, '.git')))
    )
      continue;
    const record = await projectRecord(path, git);
    if (result.some((item) => item.record.id === record.id))
      throw new AppFault({ id: 'storageVideoBrandInvalid' });
    result.push({ path, record });
  }
  return result;
}

/** Do not use ProjectStore summaries here: their YAML recovery is a write. */
export async function discoverAgentScope(
  registry: Registry,
  git: GitPort,
  scope: Scope,
): Promise<AgentScopePaths & { sharedRoot: string }> {
  const brand = (await registry.state()).brands.find((item) => item.id === scope.brandId);
  if (!brand) throw new AppFault({ id: 'storageBrandMissing' });
  const root = await realpath(brand.path);
  const identity = await containedPath(root, 'brand_identity');
  const sharedRoot = await containedPath(root, 'shared_assets');
  const repositories = [identity, sharedRoot];
  const sharedScopes: Scope[] = [];
  if (!scope.videoId) {
    if (scope.clipId) throw new AppFault({ id: 'storageClipParentRequired' });
    return { repositories, sharedScopes, cwd: identity, sharedRoot };
  }
  const videos = await projects(await containedPath(root, 'videos'), git);
  for (const video of videos)
    if (video.record.brandId !== scope.brandId || video.record.parentVideoId !== undefined)
      throw new AppFault({ id: 'storageVideoBrandInvalid' });
  const parent = videos.find((video) => video.record.id === scope.videoId);
  if (!parent) throw new AppFault({ id: 'storageVideoMissing' });
  repositories.push(parent.path);
  sharedScopes.push({ ...scope, clipId: null });
  const children = await projects(await containedPath(parent.path, 'clips'), git);
  for (const child of children) {
    if (
      child.record.brandId !== scope.brandId ||
      child.record.parentVideoId !== scope.videoId ||
      child.record.start === undefined ||
      child.record.end === undefined
    )
      throw new AppFault({ id: 'storageClipParentInvalid' });
    repositories.push(child.path);
    sharedScopes.push({ ...scope, clipId: child.record.id });
  }
  const selected = scope.clipId ? children.find((child) => child.record.id === scope.clipId) : parent;
  if (!selected) throw new AppFault({ id: 'storageClipMissing' });
  return { repositories, sharedScopes, cwd: selected.path, sharedRoot };
}
