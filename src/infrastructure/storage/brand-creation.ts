import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, rm, rmdir } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { AppFault } from '../../domain/diagnostics';
import { tasteFiles } from '../../domain/defaults';
import { tasteTemplates } from '../../domain/templates';
import type { Brand } from '../../domain/models';
import type { GitPort } from '../../domain/storage';
import { atomicWrite, errorCode } from './files';
import { brandConfigSchema } from './schemas';
import type { Registry } from './registry';
import { writeYaml } from './yaml-files';
import { publishImportedDirectory } from './import-publication';

const manifestFile = '.vandashi-brand.json';
const revision = z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u);
const manifestSchema = z
  .object({
    format: z.literal('vandashi-brand-v1'),
    id: z.uuid(),
    name: z.string(),
    createdAt: z.iso.datetime(),
    identityHead: revision,
    sharedHead: revision,
  })
  .strict();

async function regular(path: string, directory = false): Promise<void> {
  const stat = await lstat(path);
  if (stat.isSymbolicLink() || !(directory ? stat.isDirectory() : stat.isFile()))
    throw new AppFault({ id: 'storageBrandRecoveryInvalid' });
}

async function recoverBrand(path: string, name: string, git: GitPort): Promise<Brand> {
  await regular(path, true);
  try {
    await regular(join(path, manifestFile));
  } catch (error) {
    if (errorCode(error) === 'ENOENT') throw new AppFault({ id: 'storageBrandExists' });
    throw error;
  }
  try {
    if ((await lstat(join(path, manifestFile))).size > 4_096)
      throw new AppFault({ id: 'storageBrandRecoveryInvalid' });
    const manifest = manifestSchema.parse(JSON.parse(await readFile(join(path, manifestFile), 'utf8')));
    if (manifest.name !== name) throw new AppFault({ id: 'storageBrandRecoveryInvalid' });
    const identity = join(path, 'brand_identity');
    const shared = join(path, 'shared_assets');
    for (const directory of [identity, shared, join(path, 'videos')]) await regular(directory, true);
    const allowed = new Set([manifestFile, 'brand_identity', 'shared_assets', 'videos', '.DS_Store']);
    if (
      (await readdir(path)).some((file) => !allowed.has(file)) ||
      (await readdir(join(path, 'videos'))).length
    )
      throw new AppFault({ id: 'storageBrandRecoveryInvalid' });
    for (const [repository, head] of [
      [identity, manifest.identityHead],
      [shared, manifest.sharedHead],
    ]) {
      if (!repository || !head) throw new AppFault({ id: 'storageBrandRecoveryInvalid' });
      await regular(join(repository, '.git'), true);
      if ((await git.head(repository)) !== head || (await git.status(repository)).dirty)
        throw new AppFault({ id: 'storageBrandRecoveryInvalid' });
    }
    for (const file of ['brand_config.yml', '.gitignore', ...tasteFiles]) await regular(join(identity, file));
    await regular(join(shared, '.gitignore'));
    const config = brandConfigSchema.parse(
      parse(await readFile(join(identity, 'brand_config.yml'), 'utf8')) as unknown,
    );
    if (config.name !== name) throw new AppFault({ id: 'storageBrandRecoveryInvalid' });
    return { id: manifest.id, name, path, lastOpened: manifest.createdAt, config };
  } catch (error) {
    if (error instanceof AppFault) throw error;
    throw new AppFault(
      { id: 'storageBrandRecoveryInvalid' },
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function registerBrand(registry: Registry, brand: Brand): Promise<void> {
  try {
    await registry.update((state) => {
      if (state.brands.some((entry) => entry.id === brand.id || entry.path === brand.path))
        throw new AppFault({ id: 'storageBrandExists' });
      return {
        ...state,
        brands: [
          ...state.brands,
          { id: brand.id, name: brand.name, path: brand.path, lastOpened: brand.lastOpened },
        ],
        lastBrandId: brand.id,
      };
    });
  } catch (error) {
    throw new AppFault(
      { id: 'storageBrandRegistrationFailed', params: { path: brand.path } },
      error instanceof Error ? error.message : String(error),
    );
  }
}

/** Prepare both commits before publishing. Only our private staging tree is recursively removed. */
export async function createBrand(
  registry: Registry,
  git: GitPort,
  input: { parent: string; path: string; name: string; ignore: string },
): Promise<Brand> {
  const { parent, path, name, ignore } = input;
  const state = await registry.state();
  if (state.brands.some((brand) => brand.path === path)) throw new AppFault({ id: 'storageBrandExists' });
  const present = await lstat(path).then(
    () => true,
    (error: unknown) => {
      if (errorCode(error) === 'ENOENT') return false;
      throw error;
    },
  );
  if (present) {
    const recovered = await recoverBrand(path, name, git);
    if (state.brands.some((brand) => brand.id === recovered.id))
      throw new AppFault({ id: 'storageBrandExists' });
    await registerBrand(registry, recovered);
    return recovered;
  }
  const stage = await mkdtemp(join(parent, '.vandashi-brand-'));
  const owned = await lstat(stage);
  const brand: Brand = {
    id: randomUUID(),
    name,
    path,
    lastOpened: new Date().toISOString(),
    config: { name, description: '', image: '', platforms: {} },
  };
  try {
    const identity = join(stage, 'brand_identity');
    const shared = join(stage, 'shared_assets');
    for (const directory of [identity, shared, join(stage, 'videos')]) await mkdir(directory);
    await git.init(identity);
    await git.init(shared);
    await writeYaml(identity, 'brand_config.yml', brand.config);
    for (const file of tasteFiles) await atomicWrite(join(identity, file), tasteTemplates[file]);
    await atomicWrite(join(identity, '.gitignore'), ignore);
    await atomicWrite(join(shared, '.gitignore'), ignore);
    const identityHead = await git.commit(
      identity,
      'Create brand identity',
      'Initialize brand configuration and editable creative taste guides.',
    );
    const sharedHead = await git.commit(
      shared,
      'Create shared asset library',
      'Initialize the reusable asset library for this brand.',
    );
    await atomicWrite(
      join(stage, manifestFile),
      JSON.stringify({
        format: 'vandashi-brand-v1',
        id: brand.id,
        name,
        createdAt: brand.lastOpened,
        identityHead,
        sharedHead,
      }),
    );
    await mkdir(path); // Exclusive, including existing empty directories; portable across supported hosts.
    const destination = await lstat(path);
    try {
      await publishImportedDirectory(stage, path, destination, manifestFile);
    } catch (error) {
      const current = await lstat(path).catch(() => null);
      if (
        current?.isDirectory() &&
        !current.isSymbolicLink() &&
        current.ino === destination.ino &&
        current.dev === destination.dev
      )
        await rmdir(path).catch(() => undefined); // Only an empty, still-owned reservation can be removed.
      throw new AppFault(
        { id: 'storageBrandPublishFailed', params: { path } },
        error instanceof Error ? error.message : String(error),
      );
    }
    await registerBrand(registry, brand);
    return brand;
  } finally {
    const current = await lstat(stage).catch((error: unknown) => {
      if (errorCode(error) === 'ENOENT') return null;
      throw error;
    });
    if (
      current?.isDirectory() &&
      !current.isSymbolicLink() &&
      current.ino === owned.ino &&
      current.dev === owned.dev
    )
      await rm(stage, { recursive: true, force: true });
  }
}
