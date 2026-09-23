import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import { LocalGit } from '../src/infrastructure/git/local-git';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}

describe('manual mutation ownership before the first post-write read', () => {
  let directory = '';
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  async function setup(kind: 'asset' | 'workspace') {
    directory = await mkdtemp(join(tmpdir(), 'vandashi-mutation-ownership-'));
    const git = new LocalGit();
    const storage = new LocalStorage(join(directory, 'settings'), git);
    const brand = await storage.createBrand({ parentPath: directory, name: 'Ownership' });
    const scope = { brandId: brand.id, videoId: null, clipId: null };
    const commit = { title: 'Reviewed change', body: 'Preserve the reviewed operation.' };
    if (kind === 'workspace') {
      const workspace = await storage.openWorkspace(scope);
      const repository = await storage.projectPath(scope);
      return {
        git,
        repository,
        path: join(repository, 'brand_config.yml'),
        invoke: () =>
          storage.saveWorkspace({
            scope,
            revision: workspace.revision,
            documents: [],
            packaging: null,
            brandConfig: { ...workspace.brand.config, description: 'Owned write marker' },
            commit,
          }),
      };
    }
    const sourcePath = join(directory, 'original.ogg');
    await writeFile(sourcePath, 'Original media bytes');
    const asset = await storage.importAsset({
      scope,
      draft: { sourcePath, title: 'Original', description: '', tags: [], kind: 'audio' },
    });
    return {
      git,
      repository: await storage.assetDirectory(scope),
      path: `${asset.path}.vandashi.json`,
      invoke: () =>
        storage.updateAsset({
          scope,
          assetId: asset.id,
          expectedRevision: asset.revision,
          title: 'Owned write marker',
          description: '',
          tags: [],
          commit,
        }),
    };
  }

  for (const kind of ['asset', 'workspace'] as const) {
    it.each(['bytes', 'index'] as const)(
      `preserves an external %s edit while the first post-write ${kind} status is held`,
      async (target) => {
        const { git, repository, path, invoke } = await setup(kind);
        const outside = join(repository, 'outside.txt');
        await writeFile(outside, 'Initial unrelated file');
        await git.commit(repository, 'Baseline', 'Keep the unrelated file available for external staging.');
        const original = await readFile(path);
        const originalHead = await git.head(repository);
        const ready = deferred();
        const resume = deferred();
        let held = false;
        const status = git.status.bind(git);
        vi.spyOn(git, 'status').mockImplementation(async (root) => {
          const result = await status(root);
          if (!held && root === repository && (await readFile(path, 'utf8')).includes('Owned write marker')) {
            held = true;
            ready.resolve();
            await resume.promise;
          }
          return result;
        });
        const commit = vi.spyOn(git, 'commit').mockRejectedValue(new Error('Injected later commit failure'));
        const operation = invoke();
        const rejected = expect(operation).rejects.toMatchObject({
          diagnostic: { message: { id: 'storageWorkspaceConflict' } },
        });
        await ready.promise;
        if (target === 'bytes')
          await writeFile(
            path,
            (await readFile(path, 'utf8')).replace('Owned write marker', 'External write marker'),
          );
        else {
          await writeFile(outside, 'External staged bytes');
          await git.stage(repository, ['outside.txt']);
        }
        const externalBytes = await readFile(path);
        const externalIndex = await git.indexEntries(repository);
        resume.resolve();
        await rejected;
        expect(commit).not.toHaveBeenCalled();
        expect(await readFile(path)).toEqual(externalBytes);
        expect(await git.indexEntries(repository)).toBe(externalIndex);
        expect(await git.head(repository)).toBe(originalHead);
        if (target === 'index') expect(await readFile(outside, 'utf8')).toBe('External staged bytes');
        const recoveryRoot = join(repository, '.vandashi-recovery');
        const backups = await readdir(recoveryRoot);
        expect(backups).not.toHaveLength(0);
        const manifest = JSON.parse(
          await readFile(join(recoveryRoot, backups[0] ?? '', 'manifest.json'), 'utf8'),
        ) as {
          files: { path: string; copy: string | null }[];
        };
        const backup = manifest.files.find((file) => file.path === path)?.copy;
        expect(backup).toBeTruthy();
        expect(await readFile(backup ?? '')).toEqual(original);
      },
    );
  }

  it.each(['stage', 'commit'] as const)(
    'restores unrelated partial staging and untracked index state after %s failure',
    async (failure) => {
      const { git, repository, path, invoke } = await setup('asset');
      const partial = join(repository, 'partial.txt');
      const loose = join(repository, 'untracked.txt');
      await writeFile(partial, 'Committed version');
      await git.commit(repository, 'Baseline', 'Track an unrelated file.');
      await writeFile(partial, 'User-staged version');
      await git.stage(repository, ['partial.txt']);
      await writeFile(partial, 'User working-tree version');
      await writeFile(loose, 'User untracked bytes');
      const originalIndex = await git.indexEntries(repository);
      const originalAsset = await readFile(path);
      if (failure === 'stage') {
        const stage = git.stage.bind(git);
        vi.spyOn(git, 'stage').mockImplementationOnce(async (root) => {
          await stage(root, ['partial.txt', 'untracked.txt']);
          throw new Error('Injected staging failure');
        });
      } else vi.spyOn(git, 'commit').mockRejectedValueOnce(new Error('Injected commit failure'));
      await expect(invoke()).rejects.toThrow(
        `Injected ${failure === 'stage' ? 'staging' : 'commit'} failure`,
      );
      expect(await git.indexEntries(repository)).toBe(originalIndex);
      expect(await git.indexEntries(repository, ['untracked.txt'])).toBe('');
      expect(await readFile(partial, 'utf8')).toBe('User working-tree version');
      expect(await readFile(loose, 'utf8')).toBe('User untracked bytes');
      expect(await readFile(path)).toEqual(originalAsset);
    },
  );
});
