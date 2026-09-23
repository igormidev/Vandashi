import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppFault } from '../src/domain/diagnostics';
import { tasteFiles } from '../src/domain/defaults';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { AssetStore } from '../src/infrastructure/storage/assets';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import { ProjectStore } from '../src/infrastructure/storage/projects';
import { Registry } from '../src/infrastructure/storage/registry';

const name = 'Recovery Studio';

describe('brand creation filesystem transaction', () => {
  let root = '';
  let parent = '';
  let path = '';
  let git: LocalGit;
  let registry: Registry;
  let projects: ProjectStore;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'vandashi-brand-creation-')));
    parent = join(root, 'projects');
    path = join(parent, name);
    await mkdir(parent);
    git = new LocalGit();
    registry = new Registry(join(root, 'settings'));
    projects = new ProjectStore(registry, git, new AssetStore((file) => file));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  async function expectUnpublished() {
    expect(await readdir(parent)).toEqual([]);
    expect((await registry.state()).brands).toEqual([]);
  }

  async function expectComplete() {
    const brand = await projects.createBrand({ parentPath: parent, name });
    expect(brand.path).toBe(path);
    expect((await registry.state()).brands.map((item) => item.id)).toEqual([brand.id]);
    for (const folder of ['brand_identity', 'shared_assets']) {
      expect((await git.status(join(path, folder))).dirty).toBe(false);
      expect((await git.history(join(path, folder), 0)).commits).toHaveLength(1);
    }
    for (const file of tasteFiles)
      expect((await readFile(join(path, 'brand_identity', file), 'utf8')).length).toBeGreaterThan(500);
    expect(await readdir(parent)).toEqual([name]);
    return brand;
  }

  it('cleans a missing Git failure and allows the exact name to be retried', async () => {
    const missing = new LocalGit(join(root, 'missing-git'));
    await expect(missing.checkAvailable()).rejects.toMatchObject({
      diagnostic: { message: { id: 'gitUnavailable' } },
    });
    const failed = new ProjectStore(registry, missing, new AssetStore((file) => file));
    await expect(failed.createBrand({ parentPath: parent, name })).rejects.toThrow();
    await expectUnpublished();
    await git.checkAvailable();
    await expectComplete();
  });

  it.each(['init', 'commit'] as const)(
    'cleans a second repository %s failure before publication',
    async (method) => {
      let calls = 0;
      if (method === 'init') {
        const init = git.init.bind(git);
        vi.spyOn(git, 'init').mockImplementation(async (repository) => {
          if (++calls === 2) throw new Error('Git initialization failed');
          await init(repository);
        });
      } else {
        const commit = git.commit.bind(git);
        vi.spyOn(git, 'commit').mockImplementation(async (repository, title, body) => {
          if (++calls === 2) throw new Error('Git commit failed');
          return commit(repository, title, body);
        });
      }
      await expect(projects.createBrand({ parentPath: parent, name })).rejects.toThrow('Git');
      await expectUnpublished();
      vi.restoreAllMocks();
      await expectComplete();
    },
  );

  it.each([false, true])('preserves an existing user folder (has content: %s)', async (content) => {
    await mkdir(path);
    if (content) await writeFile(join(path, 'notes.txt'), 'Keep my work.');
    const initialize = vi.spyOn(git, 'init');
    await expect(projects.createBrand({ parentPath: parent, name })).rejects.toThrow('already exists');
    expect(initialize).not.toHaveBeenCalled();
    expect(await readdir(path)).toEqual(content ? ['notes.txt'] : []);
    if (content) expect(await readFile(join(path, 'notes.txt'), 'utf8')).toBe('Keep my work.');
    expect((await registry.state()).brands).toEqual([]);
    expect(await readdir(parent)).toEqual([name]);
  });

  it('preserves a folder created by another writer while Git prepares the new brand', async () => {
    const commit = git.commit.bind(git);
    let calls = 0;
    vi.spyOn(git, 'commit').mockImplementation(async (repository, title, body) => {
      const head = await commit(repository, title, body);
      if (++calls === 2) {
        await mkdir(path);
        await writeFile(join(path, 'other-work.txt'), 'Other writer');
      }
      return head;
    });
    await expect(projects.createBrand({ parentPath: parent, name })).rejects.toThrow();
    expect(await readdir(parent)).toEqual([name]);
    expect(await readdir(path)).toEqual(['other-work.txt']);
    expect(await readFile(join(path, 'other-work.txt'), 'utf8')).toBe('Other writer');
    expect((await registry.state()).brands).toEqual([]);
  });

  it('recovers completed files after registration fails, including a process restart', async () => {
    vi.spyOn(registry, 'update').mockRejectedValueOnce(new Error('Registry disk is full'));
    await expect(projects.createBrand({ parentPath: parent, name })).rejects.toThrow(
      'Retry the same brand name',
    );
    const manifest = await readFile(join(path, '.vandashi-brand.json'), 'utf8');
    const heads = await Promise.all(
      ['brand_identity', 'shared_assets'].map((folder) => git.head(join(path, folder))),
    );
    expect((await registry.state()).brands).toEqual([]);
    expect(await readdir(parent)).toEqual([name]);
    const initialize = vi.spyOn(git, 'init');
    const commit = vi.spyOn(git, 'commit');
    registry = new Registry(join(root, 'settings'));
    projects = new ProjectStore(registry, git, new AssetStore((file) => file));
    const brand = await expectComplete();
    expect(initialize).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
    expect(await readFile(join(path, '.vandashi-brand.json'), 'utf8')).toBe(manifest);
    expect(manifest).toContain(brand.id);
    expect(
      await Promise.all(['brand_identity', 'shared_assets'].map((folder) => git.head(join(path, folder)))),
    ).toEqual(heads);
    await expect(projects.createBrand({ parentPath: parent, name })).rejects.toThrow('already exists');
    expect(await readFile(join(path, '.vandashi-brand.json'), 'utf8')).toBe(manifest);
  });

  it.each([false, true])(
    'does not recover a subsequently modified brand (committed: %s)',
    async (committed) => {
      vi.spyOn(registry, 'update').mockRejectedValueOnce(new Error('Cannot register'));
      await expect(projects.createBrand({ parentPath: parent, name })).rejects.toThrow('registration failed');
      const identity = join(path, 'brand_identity');
      const guide = join(identity, tasteFiles[0]);
      await writeFile(guide, '# Preserve this later work\n');
      if (committed) await git.commit(identity, 'User change', 'Preserve modified brand.');
      const head = await git.head(identity);
      await expect(projects.createBrand({ parentPath: parent, name })).rejects.toThrow('unchanged');
      expect(await readFile(guide, 'utf8')).toBe('# Preserve this later work\n');
      expect(await git.head(identity)).toBe(head);
      expect((await registry.state()).brands).toEqual([]);
    },
  );

  it('does not treat an incomplete or oversized manifest as permission to modify a folder', async () => {
    await mkdir(path);
    const file = join(path, '.vandashi-brand.json');
    for (const value of ['{}', ' '.repeat(4_097)]) {
      await writeFile(file, value);
      await expect(projects.createBrand({ parentPath: parent, name })).rejects.toBeInstanceOf(AppFault);
      expect(await readFile(file, 'utf8')).toBe(value);
      expect(await readdir(path)).toEqual(['.vandashi-brand.json']);
    }
    expect((await registry.state()).brands).toEqual([]);
  });

  it('rejects hidden brand, video, and clip names without creating invisible entries', async () => {
    const storage = new LocalStorage(join(root, 'settings'), git);
    await expect(storage.createBrand({ parentPath: parent, name: '.hidden' })).rejects.toThrow();
    await expectUnpublished();
    const brand = await storage.createBrand({ parentPath: parent, name });
    await expect(
      storage.createVideo({ brandId: brand.id, name: '.hidden', ratio: '16:9' }),
    ).rejects.toThrow();
    expect(await readdir(join(path, 'videos'))).toEqual([]);
    const video = await storage.createVideo({ brandId: brand.id, name: 'Visible', ratio: '16:9' });
    await expect(
      storage.createClip({ scope: video.scope, name: '.hidden', ratio: '9:16', start: 0, end: 2 }),
    ).rejects.toThrow();
    expect(await readdir(join(path, 'videos', 'Visible', 'clips'))).toEqual([]);
    expect((await storage.openWorkspace(video.scope)).clips).toEqual([]);
  });
});
