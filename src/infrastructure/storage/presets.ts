import { lstat, mkdir, mkdtemp, readFile, readdir, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { AppFault } from '../../domain/diagnostics';
import type { EditingPreset, PresetFile, PresetSave } from '../../domain/presets';
import type { GitPort } from '../../domain/storage';
import { atomicWrite, containedPath, errorCode, hashText, safeName } from './files';
import { publishImportedDirectory } from './import-publication';
import type { ManualMutation } from './manual-mutation';
import { identifyLegacyPresetLibrary, isLegacyPresetLibrary } from './legacy-presets';
const manifest = '.vandashi-presets.json';
const identity = z.object({ format: z.literal('vandashi-presets-v1'), brandId: z.uuid() }).strict();

/** Read-only identity discovery, including a committed fallback during an AI edit. */
export async function presetRepository(
  brandRoot: string,
  brandId: string,
  git: GitPort,
): Promise<string | null> {
  const root = await containedPath(brandRoot, 'edition_presets');
  const info = await lstat(root).catch((error: unknown) => {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  });
  if (!info) return null;
  if (!info.isDirectory() || info.isSymbolicLink()) throw new AppFault({ id: 'storageSymlinkOutside' });
  const file = await containedPath(root, manifest);
  const meta = await lstat(file).catch((error: unknown) => {
    if (errorCode(error) === 'ENOENT') return null;
    throw error;
  });
  if (!meta) {
    if (await isLegacyPresetLibrary(root, git)) return root;
    throw new AppFault({ id: 'storageMetadataInvalid', params: { name: file } });
  }
  if (!meta.isFile() || meta.isSymbolicLink() || meta.size > 4096)
    throw new AppFault({ id: 'storageMetadataInvalid', params: { name: file } });
  let record;
  try {
    record = identity.parse(JSON.parse(await readFile(file, 'utf8')));
  } catch {
    record = identity.parse(JSON.parse(await git.readAt(root, await git.head(root), manifest)));
  }
  if (record.brandId !== brandId) throw new AppFault({ id: 'storageVideoBrandInvalid' });
  return root;
}

export async function ensurePresetRepository(
  brandRoot: string,
  brandId: string,
  git: GitPort,
  manual: ManualMutation,
): Promise<string> {
  const present = await presetRepository(brandRoot, brandId, git);
  if (present) {
    const missing = await lstat(join(present, manifest)).then(
      () => false,
      (error: unknown) => {
        if (errorCode(error) === 'ENOENT') return true;
        throw error;
      },
    );
    if (missing) await identifyLegacyPresetLibrary(present, brandId, manual);
    return present;
  }
  await git.checkAvailable();
  const stage = await mkdtemp(join(brandRoot, '.vandashi-presets-'));
  const ownedStage = await lstat(stage);
  const root = await containedPath(brandRoot, 'edition_presets');
  try {
    await atomicWrite(
      join(stage, '.gitignore'),
      '.vandashi-recovery/\n.vandashi-write-*\n**/node_modules/\n.DS_Store\n',
    );
    await atomicWrite(join(stage, manifest), JSON.stringify({ format: 'vandashi-presets-v1', brandId }));
    await git.init(stage);
    await git.commit(
      stage,
      'Create editing preset library',
      'Initialize portable reusable editing presets for this brand.',
    );
    await mkdir(root);
    const reserved = await lstat(root);
    try {
      await publishImportedDirectory(stage, root, reserved, manifest);
    } catch (error) {
      const current = await lstat(root).catch(() => null);
      if (current?.ino === reserved.ino && current.dev === reserved.dev && !current.isSymbolicLink())
        await rmdir(root).catch(() => undefined);
      throw error;
    }
    return root;
  } finally {
    const current = await lstat(stage).catch((error: unknown) => {
      if (errorCode(error) === 'ENOENT') return null;
      throw error;
    });
    if (
      current?.ino === ownedStage.ino &&
      current.dev === ownedStage.dev &&
      current.isDirectory() &&
      !current.isSymbolicLink()
    )
      await rm(stage, { recursive: true, force: true });
  }
}

export async function presetFiles(root: string): Promise<PresetFile[]> {
  const result: PresetFile[] = [];
  const visit = async (directory: string, prefix: string) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      if (result.length >= 3000) throw new AppFault({ id: 'storageMetadataInvalid', params: { name: root } });
      if (entry.isSymbolicLink()) throw new AppFault({ id: 'storageSymlinkOutside' });
      const relativePath = prefix + entry.name;
      const path = await containedPath(root, relativePath);
      if (!entry.isFile() && !entry.isDirectory()) continue;
      const stamp = await lstat(path);
      if (stamp.isSymbolicLink()) throw new AppFault({ id: 'storageSymlinkOutside' });
      result.push({
        name: entry.name,
        relativePath,
        path,
        kind: entry.isDirectory() ? 'directory' : 'file',
        ...(entry.isFile()
          ? { revision: hashText(JSON.stringify([stamp.size, stamp.mtimeMs, stamp.ctimeMs, stamp.ino])) }
          : {}),
      });
      if (entry.isDirectory()) await visit(path, relativePath + '/');
    }
  };
  await visit(root, '');
  return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export async function listPresets(
  brandRoot: string,
  brandId: string,
  git: GitPort,
): Promise<EditingPreset[]> {
  const root = await presetRepository(brandRoot, brandId, git);
  if (!root) return [];
  const result: EditingPreset[] = [];
  for (const folder of await readdir(root, { withFileTypes: true })) {
    if (folder.name.startsWith('.') || folder.name === 'node_modules') continue;
    if (folder.isSymbolicLink()) throw new AppFault({ id: 'storageSymlinkOutside' });
    if (!folder.isDirectory()) continue;
    const path = await containedPath(root, folder.name);
    const guidePath = await containedPath(path, 'HOW_TO_USE.md');
    const info = await lstat(guidePath).catch((error: unknown) => {
      if (errorCode(error) === 'ENOENT') return null;
      throw error;
    });
    if (!info) continue;
    if (info.isSymbolicLink() || !info.isFile() || info.size > 2_000_000)
      throw new AppFault({ id: 'storageMetadataInvalid', params: { name: guidePath } });
    const content = await readFile(guidePath, 'utf8');
    result.push({
      id: folder.name,
      name: folder.name,
      path,
      guidePath,
      content,
      revision: hashText(content),
      files: await presetFiles(path),
    });
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

export async function savePreset(
  brandRoot: string,
  brandId: string,
  git: GitPort,
  manual: ManualMutation,
  input: PresetSave,
): Promise<void> {
  safeName(input.presetId);
  const root = await presetRepository(brandRoot, brandId, git);
  if (!root) throw new AppFault({ id: 'storageUnregisteredPath' });
  const key = JSON.stringify(input);
  const preset = (await listPresets(brandRoot, brandId, git)).find((entry) => entry.id === input.presetId);
  if (!preset || (!manual.has(key) && preset.revision !== input.revision))
    throw new AppFault({ id: 'storageWorkspaceConflict' });
  await manual.run({
    key,
    repositories: [root],
    paths: [preset.guidePath],
    commit: input.commit,
    mutate: async (receipt) => {
      await atomicWrite(await containedPath(root, preset.guidePath), input.content, receipt);
    },
  });
}
