import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import { LocalGit } from '../src/infrastructure/git/local-git';
import type { SaveInput, Scope } from '../src/domain/models';

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);
const commit = { title: 'Reviewed title', body: 'The description that the user reviewed.' };

describe('manual mutation Git failure recovery', () => {
  let directory = '';
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });
  async function setup(local: boolean) {
    directory = await mkdtemp(join(tmpdir(), 'vandashi-manual-recovery-'));
    const git = new LocalGit();
    const storage = new LocalStorage(join(directory, 'settings'), git);
    const brand = await storage.createBrand({ parentPath: directory, name: 'Recovery' });
    const scope: Scope = local
      ? (await storage.createVideo({ brandId: brand.id, name: 'Local', ratio: '16:9' })).scope
      : { brandId: brand.id, videoId: null, clipId: null };
    const repository = local ? await storage.projectPath(scope) : await storage.assetDirectory(scope);
    return { storage, git, scope, repository };
  }
  async function withAsset(local: boolean) {
    const state = await setup(local);
    const sourcePath = join(directory, 'original.png');
    await writeFile(sourcePath, pixel);
    const asset = await state.storage.importAsset({
      scope: state.scope,
      draft: { sourcePath, title: 'Original', description: 'Before', tags: ['original'], kind: 'image' },
    });
    return { ...state, asset, sidecar: `${asset.path}.vandashi.json` };
  }

  it.each([false, true])(
    'rolls back failed metadata commits and retries the reviewed save (local=%s)',
    async (local) => {
      const { storage, git, scope, repository, asset, sidecar } = await withAsset(local);
      const before = {
        media: await readFile(asset.path),
        metadata: await readFile(sidecar),
        head: await git.head(repository),
        index: await git.indexEntries(repository),
      };
      const input = {
        scope,
        assetId: asset.id,
        expectedRevision: asset.revision,
        title: 'Updated',
        description: 'After',
        tags: ['reviewed'],
        commit,
      };
      vi.spyOn(git, 'commit').mockImplementationOnce(async () => {
        expect(await readFile(asset.path)).not.toEqual(before.media);
        expect(await readFile(sidecar)).not.toEqual(before.metadata);
        throw new Error('Injected post-write commit failure');
      });
      await expect(storage.updateAsset(input)).rejects.toThrow('Injected post-write');
      expect(await readFile(asset.path)).toEqual(before.media);
      expect(await readFile(sidecar)).toEqual(before.metadata);
      expect(await git.indexEntries(repository)).toBe(before.index);
      expect(await git.head(repository)).toBe(before.head);
      await storage.updateAsset(input);
      expect((await storage.openWorkspace(scope)).assets.find((entry) => entry.id === asset.id)?.title).toBe(
        'Updated',
      );
      expect((await git.history(repository, 0)).commits[0]).toMatchObject(commit);
      expect((await git.status(repository)).dirty).toBe(false);
    },
  );

  it.each([false, true])(
    'restores deleted media and sidecar after commit failure for retry (local=%s)',
    async (local) => {
      const { storage, git, scope, repository, asset, sidecar } = await withAsset(local);
      const before = {
        media: await readFile(asset.path),
        metadata: await readFile(sidecar),
        head: await git.head(repository),
        index: await git.indexEntries(repository),
      };
      vi.spyOn(git, 'commit').mockImplementationOnce(async () => {
        await expect(readFile(asset.path)).rejects.toMatchObject({ code: 'ENOENT' });
        throw new Error('Injected post-delete commit failure');
      });
      const input = { scope, assetId: asset.id, expectedRevision: asset.revision };
      await expect(storage.deleteAsset(input)).rejects.toThrow('Injected post-delete');
      expect(await readFile(asset.path)).toEqual(before.media);
      expect(await readFile(sidecar)).toEqual(before.metadata);
      expect(await git.indexEntries(repository)).toBe(before.index);
      expect(await git.head(repository)).toBe(before.head);
      await storage.deleteAsset(input);
      await expect(readFile(asset.path)).rejects.toMatchObject({ code: 'ENOENT' });
      expect((await git.status(repository)).dirty).toBe(false);
    },
  );

  it('preserves pre-existing staged and unstaged asset content through rollback', async () => {
    const { storage, git, scope, repository, asset, sidecar } = await withAsset(false);
    await writeFile(sidecar, (await readFile(sidecar, 'utf8')) + '\n');
    await git.stage(repository, ['original.png.vandashi.json']);
    await writeFile(sidecar, (await readFile(sidecar, 'utf8')) + '\n');
    const original = await readFile(sidecar);
    const index = await git.indexEntries(repository);
    const current = (await storage.openWorkspace(scope)).assets[0];
    if (!current) throw new Error('Missing asset');
    vi.spyOn(git, 'commit').mockRejectedValueOnce(new Error('Git failed'));
    await expect(
      storage.updateAsset({
        scope,
        assetId: asset.id,
        expectedRevision: current.revision,
        title: 'Updated',
        description: 'After',
        tags: [],
        commit,
      }),
    ).rejects.toThrow('Git failed');
    expect(await readFile(sidecar)).toEqual(original);
    expect(await git.indexEntries(repository)).toBe(index);
  });

  it('restores the exact index when staging only part of a metadata mutation fails', async () => {
    const { storage, git, scope, repository, asset, sidecar } = await withAsset(false);
    const before = {
      media: await readFile(asset.path),
      sidecar: await readFile(sidecar),
      index: await git.indexEntries(repository),
    };
    const stage = git.stage.bind(git);
    vi.spyOn(git, 'stage').mockImplementationOnce(async () => {
      await stage(repository, ['original.png']);
      throw new Error('Partial staging failed');
    });
    const input = {
      scope,
      assetId: asset.id,
      expectedRevision: asset.revision,
      title: 'Updated',
      description: 'After',
      tags: [],
      commit,
    };
    await expect(storage.updateAsset(input)).rejects.toThrow('Partial staging failed');
    expect(await readFile(asset.path)).toEqual(before.media);
    expect(await readFile(sidecar)).toEqual(before.sidecar);
    expect(await git.indexEntries(repository)).toBe(before.index);
    await storage.updateAsset(input);
    expect((await git.history(repository, 0)).commits[0]).toMatchObject(commit);
  });

  it.each(['bytes', 'index'] as const)(
    'refuses rollback over concurrent external %s changes',
    async (target) => {
      const { storage, git, scope, repository, asset, sidecar } = await withAsset(false);
      const originalIndex = await git.indexEntries(repository, [
        'original.png',
        'original.png.vandashi.json',
      ]);
      let external = '';
      vi.spyOn(git, 'commit').mockImplementationOnce(async () => {
        if (target === 'bytes') {
          external = (await readFile(sidecar, 'utf8')) + '\nexternal change';
          await writeFile(sidecar, external);
        } else {
          await git.restoreIndexEntries(
            repository,
            ['original.png', 'original.png.vandashi.json'],
            originalIndex,
            await git.indexEntries(repository, ['original.png', 'original.png.vandashi.json']),
          );
        }
        throw new Error('Commit failed after outside edit');
      });
      await expect(
        storage.updateAsset({
          scope,
          assetId: asset.id,
          expectedRevision: asset.revision,
          title: 'Updated',
          description: 'After',
          tags: [],
          commit,
        }),
      ).rejects.toMatchObject({ diagnostic: { message: { id: 'storageWorkspaceConflict' } } });
      if (target === 'bytes') expect(await readFile(sidecar, 'utf8')).toBe(external);
      else
        expect(await git.indexEntries(repository, ['original.png', 'original.png.vandashi.json'])).toBe(
          originalIndex,
        );
    },
  );

  it('rejects an externally replaced asset when retrying a failed deletion', async () => {
    const { storage, git, scope, asset, sidecar } = await withAsset(false);
    vi.spyOn(git, 'commit').mockRejectedValueOnce(new Error('Delete commit failed'));
    const input = { scope, assetId: asset.id, expectedRevision: asset.revision };
    await expect(storage.deleteAsset(input)).rejects.toThrow('Delete commit failed');
    await writeFile(asset.path, 'Externally replaced bytes');
    const metadata = await readFile(sidecar);
    await expect(storage.deleteAsset(input)).rejects.toMatchObject({
      diagnostic: { message: { id: 'storageAssetDeleteConflict' } },
    });
    expect(await readFile(asset.path, 'utf8')).toBe('Externally replaced bytes');
    expect(await readFile(sidecar)).toEqual(metadata);
  });

  it('rolls back when an existing index lock rejects staging, then rejects an external edit before retry', async () => {
    const { storage, git, scope, repository, asset, sidecar } = await withAsset(false);
    const before = await readFile(sidecar);
    const head = await git.head(repository);
    const lock = join(repository, '.git', 'index.lock');
    await writeFile(lock, 'External Git operation');
    const input = {
      scope,
      assetId: asset.id,
      expectedRevision: asset.revision,
      title: 'Updated',
      description: 'After',
      tags: [],
      commit,
    };
    await expect(storage.updateAsset(input)).rejects.toThrow('index.lock');
    expect(await readFile(sidecar)).toEqual(before);
    expect(await readFile(lock, 'utf8')).toBe('External Git operation');
    await rm(lock);
    await writeFile(sidecar, before.toString('utf8') + '\n');
    await expect(storage.updateAsset(input)).rejects.toMatchObject({
      diagnostic: { message: { id: 'assetMetadataConflict' } },
    });
    expect(await readFile(sidecar, 'utf8')).toBe(before.toString('utf8') + '\n');
    expect(await git.head(repository)).toBe(head);
  });

  it.each(['brand', 'packaging'] as const)(
    'rolls back %s save files after commit failure and preserves reviewed retry',
    async (kind) => {
      const { storage, git, scope } = await setup(kind === 'packaging');
      const workspace = await storage.openWorkspace(scope);
      const repository = await storage.projectPath(scope);
      const file = join(repository, kind === 'brand' ? 'brand_config.yml' : 'video_packaging.yml');
      const before = await readFile(file);
      const input: SaveInput = {
        scope,
        revision: workspace.revision,
        documents: [],
        commit,
        brandConfig:
          kind === 'brand' ? { ...workspace.brand.config, description: 'Reviewed description' } : null,
        packaging:
          kind === 'packaging' && workspace.video
            ? { ...workspace.video.packaging, theme: 'Reviewed theme' }
            : null,
      };
      const original = git.commit.bind(git);
      vi.spyOn(git, 'commit').mockImplementation(async (root, title, body) => {
        if (root === repository) throw new Error('Injected workspace commit failure');
        return original(root, title, body);
      });
      await expect(storage.saveWorkspace(input)).rejects.toThrow('Injected workspace');
      expect(await readFile(file)).toEqual(before);
      expect((await storage.openWorkspace(scope)).revision).toBe(workspace.revision);
      vi.restoreAllMocks();
      await storage.saveWorkspace(input);
      expect((await git.history(repository, 0)).commits[0]).toMatchObject(commit);
    },
  );

  it('retries a partially committed multi-repository save without repeating writes or changing commit text', async () => {
    const { storage, git, scope } = await setup(true);
    const workspace = await storage.openWorkspace(scope);
    if (!workspace.video) throw new Error('Missing video');
    const identity = join(workspace.brand.path, 'brand_identity');
    const repository = workspace.video.path;
    const input: SaveInput = {
      scope,
      revision: workspace.revision,
      documents: [],
      commit,
      brandConfig: { ...workspace.brand.config, description: 'Reviewed brand' },
      packaging: { ...workspace.video.packaging, theme: 'Reviewed packaging' },
    };
    const original = git.commit.bind(git);
    vi.spyOn(git, 'commit').mockImplementation(async (root, title, body) => {
      if (root === repository) throw new Error('Second repository failed');
      return original(root, title, body);
    });
    await expect(storage.saveWorkspace(input)).rejects.toThrow('Second repository');
    const firstHead = await git.head(identity);
    vi.restoreAllMocks();
    await storage.saveWorkspace(input);
    expect(await git.head(identity)).toBe(firstHead);
    expect((await git.history(repository, 0)).commits[0]).toMatchObject(commit);
    expect((await storage.openWorkspace(scope)).dirty).toBe(false);
  });
});
