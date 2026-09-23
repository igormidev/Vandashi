import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import type { Workspace } from '../src/domain/models';

const red =
  '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#ff0000"/></svg>';
const blue = red.replace('#ff0000', '#0000ff');
let root = '';
let storage: LocalStorage;
let git: LocalGit;
let workspace: Workspace;
let source = '';
let identity = '';
let logo = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'vandashi-brand-revision-'));
  git = new LocalGit();
  storage = new LocalStorage(join(root, 'settings'), git);
  const brand = await storage.createBrand({ parentPath: root, name: 'Logo studio' });
  const initial = await storage.openBrand(brand.id);
  source = join(root, 'chosen.svg');
  await writeFile(source, red);
  workspace = await storage.saveWorkspace({
    scope: initial.scope,
    revision: initial.revision,
    documents: [],
    packaging: null,
    brandConfig: { ...initial.brand.config, image: source },
    commit: { title: 'Choose logo', body: 'Save a portable brand identity image.' },
  });
  identity = join(brand.path, 'brand_identity');
  logo = join(identity, workspace.brand.config.image);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('brand image workspace revisions', () => {
  it.each(['working tree', 'committed'] as const)(
    'rejects a stale replacement after a same-path %s image edit',
    async (state) => {
      await writeFile(logo, blue);
      await utimes(logo, new Date(0), new Date(0));
      if (state === 'committed')
        await git.commit(identity, 'Redesign logo', 'Keep the blue logo at the same path.');
      const head = await git.head(identity);
      const config = await readFile(join(identity, 'brand_config.yml'), 'utf8');
      const latest = await storage.openWorkspace(workspace.scope);
      expect(latest.brand.config).toEqual(workspace.brand.config);
      expect(latest.documents).toEqual(workspace.documents);
      expect(latest.revision).not.toBe(workspace.revision);
      await expect(
        storage.saveWorkspace({
          scope: workspace.scope,
          revision: workspace.revision,
          documents: [],
          packaging: null,
          brandConfig: { ...workspace.brand.config, image: source },
          commit: { title: 'Older logo selection', body: 'This stale save must not replace the newer logo.' },
        }),
      ).rejects.toMatchObject({ diagnostic: { message: { id: 'storageWorkspaceConflict' } } });
      expect(await readFile(logo, 'utf8')).toBe(blue);
      expect(await readFile(join(identity, 'brand_config.yml'), 'utf8')).toBe(config);
      expect(await git.head(identity)).toBe(head);
    },
  );

  it('changes the revision when the logo disappears and restores it only for identical bytes', async () => {
    await rm(logo);
    const missing = await storage.openWorkspace(workspace.scope);
    expect(missing.revision).not.toBe(workspace.revision);
    await writeFile(logo, red);
    expect((await storage.openWorkspace(workspace.scope)).revision).toBe(workspace.revision);
  });

  it('keeps the content revision stable when normalization saves the existing name and image bytes', async () => {
    const normalized = await storage.saveWorkspace({
      scope: workspace.scope,
      revision: workspace.revision,
      documents: [],
      packaging: null,
      brandConfig: { ...workspace.brand.config, name: `  ${workspace.brand.name}  `, image: source },
      commit: { title: 'Confirm current identity', body: 'Normalize the existing name and image path.' },
    });
    expect(normalized.revision).toBe(workspace.revision);
    expect(normalized.brand.config.name).toBe(workspace.brand.name);
    expect(normalized.brand.config.image).toBe('brand_icon.svg');
  });
});
