import { randomUUID } from 'node:crypto';
import { link, lstat, open, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { AppFault } from '../../domain/diagnostics';
import { tasteFiles } from '../../domain/defaults';
import type { Brand } from '../../domain/models';
import type { GitPort } from '../../domain/storage';
import { errorCode } from './files';
import type { Registry } from './registry';
import { brandConfigSchema, videoRecordSchema } from './schemas';

async function regular(path: string, directory = false): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile()))
    throw new AppFault({ id: 'storageBrandImportInvalid' });
}

async function document(path: string): Promise<string> {
  await regular(path);
  if ((await lstat(path)).size > 1_000_000) throw new AppFault({ id: 'storageBrandImportInvalid' });
  return readFile(path, 'utf8');
}

/** Legacy identity is published exclusively; a failed registry save can safely retry it. */
async function identifyLegacyBrand(path: string, brand: Brand, git: GitPort): Promise<void> {
  const temporary = join(path, `.vandashi-import-${randomUUID()}`);
  const content = JSON.stringify({
    format: 'vandashi-brand-v1',
    id: brand.id,
    name: brand.name,
    createdAt: brand.lastOpened,
    identityHead: await git.head(join(path, 'brand_identity')),
    sharedHead: await git.head(join(path, 'shared_assets')),
  });
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    // link publishes complete bytes atomically and fails if another writer created the manifest.
    await link(temporary, join(path, '.vandashi-brand.json'));
  } finally {
    await rm(temporary, { force: true });
  }
}

/** Existing repositories are never repaired, initialized or rewritten during registration. */
export async function importBrand(registry: Registry, git: GitPort, selected: string): Promise<Brand> {
  try {
    const path = await realpath(selected);
    await regular(path, true);
    const identity = join(path, 'brand_identity');
    for (const directory of [identity, join(path, 'shared_assets'), join(path, 'videos')])
      await regular(directory, true);
    for (const repository of [identity, join(path, 'shared_assets')]) {
      await regular(join(repository, '.git'), true);
      await git.head(repository);
    }
    const config = brandConfigSchema.parse(parse(await document(join(identity, 'brand_config.yml'))));
    for (const file of tasteFiles) await regular(join(identity, file));
    const state = await registry.state();
    const knownPaths = await Promise.all(
      state.brands.map(async (brand) => {
        try {
          return { brand, path: await realpath(brand.path), missing: false };
        } catch (error) {
          return { brand, path: null, missing: ['ENOENT', 'ENOTDIR'].includes(errorCode(error) ?? '') };
        }
      }),
    );
    const known = knownPaths.find((entry) => entry.path === path)?.brand;
    const ids = new Set<string>();
    if (known) ids.add(known.id);
    const manifest = await document(join(path, '.vandashi-brand.json')).catch((error: unknown) => {
      if (errorCode(error) === 'ENOENT') return null;
      throw error;
    });
    if (manifest !== null) {
      const record = z
        .object({ format: z.literal('vandashi-brand-v1'), id: z.uuid() })
        .parse(JSON.parse(manifest));
      ids.add(record.id);
    }
    const videoIds = new Set<string>();
    const readProjects = async (directory: string, parentId?: string): Promise<void> => {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        if (entry.isSymbolicLink()) throw new AppFault({ id: 'storageBrandImportInvalid' });
        if (!entry.isDirectory()) continue;
        const root = join(directory, entry.name);
        const text = await document(join(root, '.vandashi.yml')).catch((error: unknown) => {
          if (errorCode(error) === 'ENOENT') return null;
          throw error;
        });
        if (text === null) continue;
        const record = videoRecordSchema.parse(parse(text));
        if (record.parentVideoId !== parentId || videoIds.has(record.id))
          throw new AppFault({ id: 'storageBrandImportInvalid' });
        videoIds.add(record.id);
        ids.add(record.brandId);
        await regular(join(root, '.git'), true);
        await git.head(root);
        if (parentId === undefined) {
          await regular(join(root, 'clips'), true);
          await readProjects(join(root, 'clips'), record.id);
        }
      }
    };
    await readProjects(join(path, 'videos'));
    if (ids.size > 1) throw new AppFault({ id: 'storageBrandImportInvalid' });
    const id = [...ids][0] ?? randomUUID();
    const collision = knownPaths.find((entry) => entry.brand.id === id && entry.path !== path);
    if (collision && !collision.missing) throw new AppFault({ id: 'storageBrandImportDuplicate' });
    const brand: Brand = { id, name: config.name, path, config, lastOpened: new Date().toISOString() };
    if (manifest === null) await identifyLegacyBrand(path, brand, git);
    await registry.update((current) => {
      // The storage write queue owns this transaction; preserve unrelated settings/session updates.
      const others = current.brands.filter((item) => item.id !== id && item.path !== path);
      return {
        ...current,
        brands: [...others, { id, name: brand.name, path, lastOpened: brand.lastOpened }],
        lastBrandId: id,
      };
    });
    return brand;
  } catch (error) {
    if (error instanceof AppFault) throw error;
    throw new AppFault(
      { id: 'storageBrandImportInvalid' },
      error instanceof Error ? error.message : String(error),
    );
  }
}
