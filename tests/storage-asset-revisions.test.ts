import { copyFile, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { hashFile } from '../src/infrastructure/storage/files';
import * as embedding from '../src/infrastructure/storage/embedded-metadata';
import { AppFault } from '../src/domain/diagnostics';
import { parseInvocation } from '../src/desktop/validation';
import type { Asset, Scope } from '../src/domain/models';

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

describe('asset content identity and optimistic metadata writes', () => {
  let directory = '';
  let storage: LocalStorage;
  let git: LocalGit;
  let scope: Scope;
  let root = '';
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vandashi-asset-revisions-'));
    git = new LocalGit();
    storage = new LocalStorage(join(directory, 'settings'), git);
    const brand = await storage.createBrand({ parentPath: directory, name: 'Asset revisions' });
    scope = { brandId: brand.id, videoId: null, clipId: null };
    root = await storage.assetDirectory(scope);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });
  async function imported(image = false): Promise<Asset> {
    const sourcePath = join(directory, image ? 'original.png' : 'original.ogg');
    await writeFile(sourcePath, image ? pixel : 'Original unsupported-container bytes');
    return storage.importAsset({
      scope,
      draft: {
        sourcePath,
        title: 'Original title',
        description: 'Original details',
        tags: ['original'],
        kind: image ? 'image' : 'audio',
      },
    });
  }
  const update = (asset: Asset) =>
    storage.updateAsset({
      scope,
      assetId: asset.id,
      expectedRevision: asset.revision,
      title: 'Edited title',
      description: 'Edited details',
      tags: ['edited'],
    });
  async function current(asset: Asset): Promise<Asset> {
    const value = (await storage.openWorkspace(scope)).assets.find((entry) => entry.id === asset.id);
    if (!value) throw new Error('Asset missing');
    return value;
  }

  it('deduplicates original and embedded copies under different filenames without overwriting metadata', async () => {
    const asset = await imported(true);
    const embeddedHash = await hashFile(asset.path);
    expect(embeddedHash).not.toBe(asset.hash);
    const head = await git.head(root);
    const copy = join(directory, 'renamed.png');
    await copyFile(asset.path, copy);
    for (const sourcePath of [join(directory, 'original.png'), copy]) {
      const duplicate = await storage.importAsset({
        scope,
        draft: { sourcePath, title: 'Do not replace', description: '', tags: [], kind: 'image' },
      });
      expect(duplicate.id).toBe(asset.id);
      expect(duplicate.title).toBe('Original title');
      expect(duplicate.revision).toBe(asset.revision);
    }
    expect((await storage.openWorkspace(scope)).assets).toHaveLength(1);
    expect(await git.head(root)).toBe(head);
  });

  it('invalidates the original-content alias after the imported media changes externally', async () => {
    const asset = await imported(true);
    await writeFile(asset.path, Buffer.concat([await readFile(asset.path), Buffer.from('external edit')]));
    expect((await current(asset)).hash).toBe(await hashFile(asset.path));
    const copy = join(directory, 'external-copy.png');
    await copyFile(asset.path, copy);
    const duplicate = await storage.importAsset({
      scope,
      draft: {
        sourcePath: copy,
        title: 'Duplicate external edit',
        description: '',
        tags: [],
        kind: 'image',
      },
    });
    expect(duplicate.id).toBe(asset.id);
    const original = await storage.importAsset({
      scope,
      draft: {
        sourcePath: join(directory, 'original.png'),
        title: 'Original bytes again',
        description: '',
        tags: [],
        kind: 'image',
      },
    });
    expect(original.id).not.toBe(asset.id);
    expect((await storage.openWorkspace(scope)).assets).toHaveLength(2);
  });

  it.each(['sidecar', 'media'] as const)(
    'rejects a stale %s revision without replacing bytes, metadata, or Git HEAD',
    async (target) => {
      const asset = await imported();
      const sidecar = `${asset.path}.vandashi.json`;
      if (target === 'media') await writeFile(asset.path, 'Changed externally');
      else {
        const metadata = JSON.parse(await readFile(sidecar, 'utf8')) as Record<string, unknown>;
        await writeFile(sidecar, JSON.stringify({ ...metadata, title: 'External title' }));
      }
      const mediaBefore = await readFile(asset.path);
      const metadataBefore = await readFile(sidecar);
      const head = await git.head(root);
      await expect(update(asset)).rejects.toMatchObject({
        diagnostic: { kind: 'app', message: { id: 'assetMetadataConflict' } },
      });
      expect(await readFile(asset.path)).toEqual(mediaBefore);
      expect(await readFile(sidecar)).toEqual(metadataBefore);
      expect(await git.head(root)).toBe(head);
      const latest = await current(asset);
      expect(latest.revision).not.toBe(asset.revision);
      const saved = await update(latest);
      expect(saved.title).toBe('Edited title');
      expect(saved.revision).not.toBe(latest.revision);
      expect((await storage.openWorkspace(scope)).dirty).toBe(false);
    },
  );

  it('tracks exact sidecar bytes, including sidecar removal, without changing content identity', async () => {
    const asset = await imported();
    const sidecar = `${asset.path}.vandashi.json`;
    await writeFile(sidecar, (await readFile(sidecar, 'utf8')) + '\n');
    const reformatted = await current(asset);
    expect(reformatted.hash).toBe(asset.hash);
    expect(reformatted.revision).not.toBe(asset.revision);
    await expect(update(asset)).rejects.toBeInstanceOf(AppFault);
    await rm(sidecar);
    expect((await current(asset)).revision).not.toBe(reformatted.revision);
    await expect(update(reformatted)).rejects.toBeInstanceOf(AppFault);
  });

  it.each(['sidecar', 'media'] as const)(
    'detects a %s edit during metadata preparation and cleans disposable files',
    async (target) => {
      const asset = await imported(true);
      const prepare = embedding.prepareEmbeddedMetadata;
      let prepared!: () => void;
      let resume!: () => void;
      const ready = new Promise<void>((resolve) => {
        prepared = resolve;
      });
      const hold = new Promise<void>((resolve) => {
        resume = resolve;
      });
      vi.spyOn(embedding, 'prepareEmbeddedMetadata').mockImplementationOnce(async (...args) => {
        const result = await prepare(...args);
        prepared();
        await hold;
        return result;
      });
      const operation = update(asset);
      const rejected = expect(operation).rejects.toBeInstanceOf(AppFault);
      await ready;
      const sidecar = `${asset.path}.vandashi.json`;
      if (target === 'sidecar') await writeFile(sidecar, (await readFile(sidecar, 'utf8')) + '\n');
      else
        await writeFile(
          asset.path,
          Buffer.concat([await readFile(asset.path), Buffer.from('external edit')]),
        );
      const external = await readFile(sidecar, 'utf8');
      const bytes = await readFile(asset.path);
      const head = await git.head(root);
      resume();
      await rejected;
      expect(await readFile(asset.path)).toEqual(bytes);
      expect(await readFile(sidecar, 'utf8')).toBe(external);
      expect(await git.head(root)).toBe(head);
      expect((await readdir(root)).filter((path) => path.startsWith('.vandashi-metadata-'))).toEqual([]);
    },
  );

  it('requires a complete SHA256 expected revision at the desktop boundary with no force-save escape', () => {
    const input = { scope, assetId: 'asset', title: 'Title', description: '', tags: [] };
    expect(() => parseInvocation('updateAsset', [input])).toThrow();
    for (const expectedRevision of ['', '*', 'a'.repeat(63), 'A'.repeat(64)])
      expect(() => parseInvocation('updateAsset', [{ ...input, expectedRevision }])).toThrow();
    expect(parseInvocation('updateAsset', [{ ...input, expectedRevision: 'a'.repeat(64) }]).args[0]).toEqual({
      ...input,
      expectedRevision: 'a'.repeat(64),
    });
    expect(() =>
      parseInvocation('updateAsset', [{ ...input, expectedRevision: 'a'.repeat(64), force: true }]),
    ).toThrow();
  });
});
