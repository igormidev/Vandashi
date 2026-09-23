import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse, stringify } from 'yaml';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import { LocalGit } from '../src/infrastructure/git/local-git';
import type { SaveInput } from '../src/domain/models';

describe('workspace commit recovery conflicts', () => {
  let directory = '';
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it.each(['brand', 'packaging', 'partial'] as const)(
    'preserves external changes before retrying a failed %s save',
    async (kind) => {
      directory = await mkdtemp(join(tmpdir(), 'vandashi-workspace-recovery-'));
      const git = new LocalGit();
      const storage = new LocalStorage(join(directory, 'settings'), git);
      const brand = await storage.createBrand({ parentPath: directory, name: 'Reviewed saves' });
      const workspace =
        kind === 'brand'
          ? await storage.openBrand(brand.id)
          : await storage.createVideo({ brandId: brand.id, name: 'Video', ratio: '16:9' });
      const scope = workspace.scope;
      const repository = await storage.projectPath(scope);
      const file = join(repository, kind === 'brand' ? 'brand_config.yml' : 'video_packaging.yml');
      const input: SaveInput = {
        scope,
        revision: workspace.revision,
        documents: [],
        commit: { title: 'Reviewed commit', body: 'Keep the reviewed description.' },
        brandConfig:
          kind !== 'packaging' ? { ...workspace.brand.config, description: 'Reviewed brand' } : null,
        packaging: workspace.video ? { ...workspace.video.packaging, theme: 'Reviewed packaging' } : null,
      };
      const commit = git.commit.bind(git);
      vi.spyOn(git, 'commit').mockImplementation(async (root, title, body) => {
        if (root === repository) throw new Error('Injected Git failure');
        return commit(root, title, body);
      });
      await expect(storage.saveWorkspace(input)).rejects.toThrow('Injected Git failure');
      vi.restoreAllMocks();
      const original = parse(await readFile(file, 'utf8')) as Record<string, unknown>;
      const external = stringify({
        ...original,
        [kind === 'brand' ? 'description' : 'theme']: 'An external edit',
      });
      await writeFile(file, external);
      const heads = await Promise.all((await storage.repositories(scope)).map((root) => git.head(root)));
      await expect(storage.saveWorkspace(input)).rejects.toMatchObject({
        diagnostic: { message: { id: 'storageWorkspaceConflict' } },
      });
      expect(await readFile(file, 'utf8')).toBe(external);
      expect(await Promise.all((await storage.repositories(scope)).map((root) => git.head(root)))).toEqual(
        heads,
      );
    },
  );
});
