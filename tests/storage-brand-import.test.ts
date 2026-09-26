import { cp, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { PathPermissions } from '../src/desktop/path-permissions';
import type { Brand } from '../src/domain/models';

let root: string;
let brand: Brand;
let store: LocalStorage;
let original: LocalStorage;
const git = new LocalGit();
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'vandashi-brand-import-')));
  await mkdir(join(root, 'brands'));
  original = new LocalStorage(join(root, 'original-profile'), git);
  store = new LocalStorage(join(root, 'new-profile'), git);
  brand = await original.createBrand({ parentPath: join(root, 'brands'), name: 'Existing channel' });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it('registers in place, preserves dirty files/history and opens existing videos with their IDs', async () => {
  const video = await original.createVideo({ brandId: brand.id, name: 'Existing video', ratio: '16:9' });
  const identity = join(brand.path, 'brand_identity');
  const head = await git.head(identity);
  const config = { ...brand.config, name: 'Renamed channel' };
  const text = stringify(config);
  await writeFile(join(identity, 'brand_config.yml'), text);
  const imported = await store.importBrand({ path: brand.path });
  expect(imported).toMatchObject({ id: brand.id, path: brand.path, name: config.name });
  expect(await git.head(identity)).toBe(head);
  expect(await readFile(join(identity, 'brand_config.yml'), 'utf8')).toBe(text);
  expect((await git.status(identity)).dirty).toBe(true);
  expect((await store.listVideos(brand.id)).map((item) => item.id)).toEqual([video.scope.videoId]);
  expect((await store.openWorkspace(video.scope)).scope).toEqual(video.scope);
  await store.importBrand({ path: brand.path });
  expect((await store.getState()).brands).toHaveLength(1);
});

it('restores a moved brand without changing its identity or adding duplicate recents', async () => {
  await store.importBrand({ path: brand.path });
  const moved = join(root, 'Moved channel');
  await rename(brand.path, moved);
  expect((await store.importBrand({ path: moved })).id).toBe(brand.id);
  expect((await store.getState()).brands).toEqual([expect.objectContaining({ id: brand.id, path: moved })]);
});

it('rejects a conflicting live copy without changing either folder or the registry', async () => {
  await store.importBrand({ path: brand.path });
  const copy = join(root, 'Copy');
  await cp(brand.path, copy, { recursive: true });
  const before = await store.getState();
  await expect(store.importBrand({ path: copy })).rejects.toMatchObject({
    diagnostic: { message: { id: 'storageBrandImportDuplicate' } },
  });
  expect(await store.getState()).toEqual(before);
  expect(await git.head(join(copy, 'brand_identity'))).toBe(
    await git.head(join(brand.path, 'brand_identity')),
  );
});

it('recovers legacy identity from video records and records it for later moves', async () => {
  await original.createVideo({ brandId: brand.id, name: 'Legacy video', ratio: '16:9' });
  await rm(join(brand.path, '.vandashi-brand.json'));
  expect((await store.importBrand({ path: brand.path })).id).toBe(brand.id);
  expect(JSON.parse(await readFile(join(brand.path, '.vandashi-brand.json'), 'utf8'))).toMatchObject({
    id: brand.id,
  });
});

it('keeps a legacy empty brand ID after moving it, including its saved chat scope', async () => {
  await rm(join(brand.path, '.vandashi-brand.json'));
  const imported = await store.importBrand({ path: brand.path });
  const scope = { brandId: imported.id, videoId: null, clipId: null };
  // A stable scope is what keys persisted brand conversations.
  const moved = join(root, 'Moved legacy');
  await rename(brand.path, moved);
  expect((await store.importBrand({ path: moved })).id).toBe(scope.brandId);
  expect((await store.getState()).brands).toEqual([
    expect.objectContaining({ id: scope.brandId, path: moved }),
  ]);
});

it('preserves unrelated stale recents whose ancestor is now a regular file', async () => {
  await store.importBrand({ path: brand.path });
  const moved = join(root, 'Moved old brand');
  await rename(join(root, 'brands'), moved);
  await writeFile(join(root, 'brands'), 'Replaced by user');
  const other = await original.createBrand({ parentPath: root, name: 'Different channel' });
  expect((await store.importBrand({ path: other.path })).id).toBe(other.id);
  expect((await store.getState()).brands.map((item) => item.id).sort()).toEqual([brand.id, other.id].sort());
});

it('rejects mismatched child identities before registration', async () => {
  const video = await original.createVideo({ brandId: brand.id, name: 'Wrong brand', ratio: '16:9' });
  if (!video.video) throw new Error('Expected created video');
  const path = join(video.video.path, '.vandashi.yml');
  const record = parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  await writeFile(path, stringify({ ...record, brandId: 'another-brand' }));
  await expect(store.importBrand({ path: brand.path })).rejects.toThrow();
  expect((await store.getState()).brands).toEqual([]);
});

it('rejects an arbitrary folder and malformed configuration without repairing it', async () => {
  await expect(store.importBrand({ path: root })).rejects.toThrow();
  const config = join(brand.path, 'brand_identity', 'brand_config.yml');
  await writeFile(config, 'invalid: [');
  await expect(store.importBrand({ path: brand.path })).rejects.toThrow();
  expect(await readFile(config, 'utf8')).toBe('invalid: [');
  expect((await store.getState()).brands).toEqual([]);
});

it.skipIf(process.platform === 'win32')(
  'rejects symlinked internal roots and repointed native selections',
  async () => {
    const shared = join(brand.path, 'shared_assets');
    const outside = join(root, 'outside');
    await rename(shared, outside);
    await symlink(outside, shared, 'dir');
    await expect(store.importBrand({ path: brand.path })).rejects.toThrow();
    const permissions = new PathPermissions(() => Promise.reject(new Error('Not registered')));
    await expect(permissions.authorize('importBrand', [{ path: brand.path }])).rejects.toThrow();
    const selected = await permissions.grantDirectory(brand.path);
    await rename(brand.path, join(root, 'moved'));
    await symlink(outside, brand.path, 'dir');
    await expect(permissions.authorize('importBrand', [{ path: selected }])).rejects.toMatchObject({
      diagnostic: { message: { id: 'desktopSelectedLocationChanged' } },
    });
  },
);
