import { mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectPreparation } from '../src/domain/storage';
import type { Scope } from '../src/domain/models';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import { seedProject } from '../src/infrastructure/media/compositions';

let root = '';
let store: LocalStorage;
let git: LocalGit;
let brandId = '';
let videos = '';
let scope: Scope;
let clips = '';
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'vandashi-project-create-')));
  git = new LocalGit();
  store = new LocalStorage(join(root, 'settings'), git);
  const brand = await store.createBrand({ parentPath: root, name: 'Transaction Brand' });
  brandId = brand.id;
  videos = join(brand.path, 'videos');
  const parent = await store.createVideo({ brandId, name: 'Parent', ratio: '16:9' });
  scope = parent.scope;
  clips = join(videos, 'Parent', 'clips');
});
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});

const seed: ProjectPreparation = ({ path, ratio, name }) => seedProject(path, ratio, name);
const clipInput = () => ({ scope, name: 'New clip', ratio: '9:16' as const, start: 1, end: 4 });

describe('unpublished composition initialization', () => {
  it.each(['video', 'clip'] as const)(
    'removes failed %s seeds and permits retry with the same name',
    async (kind) => {
      let stage = '';
      const create = (prepare: ProjectPreparation) =>
        kind === 'video'
          ? store.createVideo({ brandId, name: 'New video', ratio: '16:9' }, prepare)
          : store.createClip(clipInput(), prepare);
      const directory = kind === 'video' ? videos : clips;
      const before = await readdir(directory);
      await expect(
        create(async (project) => {
          stage = project.path;
          await writeFile(join(stage, 'partially-seeded.html'), 'Partial media work');
          expect((await store.listVideos(brandId)).map(({ name }) => name)).toEqual(['Parent']);
          expect((await store.openWorkspace(scope)).clips).toEqual([]);
          throw new Error('Media seeding failed');
        }),
      ).rejects.toThrow('Media seeding failed');
      expect(await readdir(directory)).toEqual(before);
      await expect(readFile(join(stage, 'partially-seeded.html'))).rejects.toMatchObject({ code: 'ENOENT' });
      const result = await create(seed);
      const path = 'video' in result ? result.video?.path : result.path;
      if (!path) throw new Error('Missing created project');
      expect(await readFile(join(path, 'index.html'), 'utf8')).toContain('data-composition-id="main"');
      expect((await git.status(path)).dirty).toBe(false);
      expect((await git.history(path, 0)).commits).toHaveLength(2);
      expect(await readdir(directory)).not.toContain(stage);
    },
  );

  it.each(['init', 'commit'] as const)(
    'cleans an unpublished Git %s failure without affecting the parent',
    async (operation) => {
      const initial = await git.head(join(videos, 'Parent'));
      if (operation === 'init') vi.spyOn(git, 'init').mockRejectedValueOnce(new Error('Git unavailable'));
      else {
        const commit = git.commit.bind(git);
        let count = 0;
        vi.spyOn(git, 'commit').mockImplementation((...args) =>
          ++count === 2 ? Promise.reject(new Error('Git commit denied')) : commit(...args),
        );
      }
      await expect(store.createClip(clipInput(), seed)).rejects.toThrow('Git');
      expect(await readdir(clips)).toEqual([]);
      expect(await git.head(join(videos, 'Parent'))).toBe(initial);
      vi.restoreAllMocks();
      const result = await store.createClip(clipInput(), seed);
      expect((await git.status(result.path)).dirty).toBe(false);
    },
  );

  it('leaves existing and concurrently created destination contents untouched', async () => {
    const destination = join(clips, 'New clip');
    await mkdir(destination);
    await writeFile(join(destination, 'external.txt'), 'Original user data');
    const prepare = vi.fn(seed);
    await expect(store.createClip(clipInput(), prepare)).rejects.toThrow('already exists');
    expect(prepare).not.toHaveBeenCalled();
    expect(await readdir(destination)).toEqual(['external.txt']);
    const other = { ...clipInput(), name: 'Concurrent clip' };
    await expect(
      store.createClip(other, async (project) => {
        await seed(project);
        await mkdir(join(clips, other.name));
        await writeFile(join(clips, other.name, 'external.txt'), 'Created during seed');
      }),
    ).rejects.toThrow();
    expect(await readFile(join(clips, other.name, 'external.txt'), 'utf8')).toBe('Created during seed');
    expect(await readFile(join(destination, 'external.txt'), 'utf8')).toBe('Original user data');
    expect((await readdir(clips)).sort()).toEqual(['Concurrent clip', 'New clip']);
    expect((await store.openWorkspace(scope)).clips).toEqual([]);
  });

  it('never commits or removes a preparation directory replaced by an external writer', async () => {
    let replaced = '';
    const relocated = join(root, 'relocated-preparation');
    await expect(
      store.createClip(clipInput(), async ({ path }) => {
        replaced = path;
        await rename(path, relocated);
        await mkdir(path);
        await writeFile(join(path, 'external.txt'), 'Unrelated replacement');
      }),
    ).rejects.toThrow('preparation folder changed');
    expect(await readdir(replaced)).toEqual(['external.txt']);
    expect(await readFile(join(replaced, 'external.txt'), 'utf8')).toBe('Unrelated replacement');
    expect((await git.history(relocated, 0)).commits).toHaveLength(1);
    expect((await store.openWorkspace(scope)).clips).toEqual([]);
  });
});
