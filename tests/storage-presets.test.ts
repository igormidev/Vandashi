import { mkdtemp, mkdir, readFile, writeFile, rm, symlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import { buildWorkspacePrompt } from '../src/domain/prompts';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { mentionReferences } from '../src/renderer/features/chat/mention-references';
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'vandashi-presets-'));
  roots.push(root);
  const git = new LocalGit();
  const store = new LocalStorage(join(root, 'settings'), git);
  const brand = await store.createBrand({ parentPath: root, name: 'Preset Studio' });
  const scope = { brandId: brand.id, videoId: null, clipId: null };
  return { root, git, store, brand, scope };
}
it('registers an independent library idempotently and includes it in AI scopes', async () => {
  const { store, git, brand, scope } = await fixture();
  const before = await store.repositories(scope);
  const initialRevision = (await store.openWorkspace(scope)).revision;
  const heads = await Promise.all(before.map((root) => git.head(root)));
  await store.ensurePresets(scope);
  expect((await store.openWorkspace(scope)).revision).toBe(initialRevision);
  await store.ensurePresets(scope);
  const repositories = await store.repositories(scope);
  expect(repositories).toHaveLength(3);
  expect((await store.discoverAgentScope(scope)).repositories).toEqual(repositories);
  expect(await Promise.all(before.map((root) => git.head(root)))).toEqual(heads);
  const path = join(brand.path, 'edition_presets', 'Soft fade');
  await mkdir(path);
  await writeFile(join(path, 'HOW_TO_USE.md'), 'Use [sample](sample.svg).');
  await writeFile(join(path, 'sample.svg'), '<svg/>');
  await git.commit(
    join(brand.path, 'edition_presets'),
    'Add soft fade',
    'Keep the portable sample and guide.',
  );
  const workspace = await store.openWorkspace(scope);
  expect(workspace.presets).toHaveLength(1);
  for (const topic of ['brand', 'taste:VISUAL_IDENTITY_TASTE.md', 'thumbnails', 'assets', 'creation']) {
    const references = mentionReferences(workspace, topic, 'Logo');
    expect(references).toContainEqual({ name: 'Soft fade', path, kind: 'preset' });
    expect(references.some((ref) => ref.name === 'HOW_TO_USE.md')).toBe(false);
  }
});

it('recognizes only the clean empty legacy library without changing history, then migrates with retry', async () => {
  const { store, git, brand, scope } = await fixture();
  const root = join(brand.path, 'edition_presets');
  await mkdir(root);
  await writeFile(join(root, '.gitignore'), '.vandashi-recovery/\n.vandashi-write-*\n.DS_Store\n');
  await git.init(root);
  await git.commit(root, 'Create editing preset library', 'Keep reusable editing presets.');
  const head = await git.head(root);
  expect((await store.openWorkspace(scope)).presets).toEqual([]);
  expect((await store.discoverAgentScope(scope)).repositories).toContain(root);
  expect(await git.head(root)).toBe(head);
  await expect(readFile(join(root, '.vandashi-presets.json'))).rejects.toThrow();
  const failure = vi.spyOn(git, 'commit').mockRejectedValueOnce(new Error('Git unavailable'));
  await expect(store.ensurePresets(scope)).rejects.toThrow('Git unavailable');
  failure.mockRestore();
  expect(await git.head(root)).toBe(head);
  expect((await git.status(root)).dirty).toBe(false);
  await store.ensurePresets(scope);
  const record: unknown = JSON.parse(await readFile(join(root, '.vandashi-presets.json'), 'utf8'));
  expect(record).toEqual({ format: 'vandashi-presets-v1', brandId: brand.id });
  const nextHead = await git.head(root);
  expect(nextHead).not.toBe(head);
  await store.ensurePresets(scope);
  expect(await git.head(root)).toBe(nextHead);
  expect((await git.history(root, 0)).commits.map((entry) => entry.title)).toContain(
    'Create editing preset library',
  );
});

it('keeps replaced initialization staging and rejects a deleted preset target in either mode', async () => {
  const { store, git, scope } = await fixture();
  let replaced = '';
  const init = vi.spyOn(git, 'init').mockImplementationOnce(async (path) => {
    replaced = path;
    await rename(path, path + '-original');
    await mkdir(path);
    await writeFile(join(path, 'external.txt'), 'external work');
    throw new Error('Init interrupted');
  });
  await expect(store.ensurePresets(scope)).rejects.toThrow('Init interrupted');
  init.mockRestore();
  expect(await readFile(join(replaced, 'external.txt'), 'utf8')).toBe('external work');
  const workspace = await store.openWorkspace(scope);
  for (const mode of ['read', 'edit'] as const)
    expect(() =>
      buildWorkspacePrompt({ workspace, topic: 'preset:Deleted', mode, text: 'Revise this.' }),
    ).toThrow('no longer exists');
  expect(buildWorkspacePrompt({ workspace, topic: 'presets', mode: 'read', text: 'Browse.' })).toContain(
    'edition_presets',
  );
});
it('preserves a stale manual guide and rejects escaping reference symlinks', async () => {
  const { store, git, brand, scope, root } = await fixture();
  await store.ensurePresets(scope);
  const folder = join(brand.path, 'edition_presets', 'Dissolve');
  await mkdir(folder);
  const guide = join(folder, 'HOW_TO_USE.md');
  await writeFile(guide, 'Original');
  await git.commit(join(brand.path, 'edition_presets'), 'Add dissolve', 'Add its guide.');
  const preset = (await store.openWorkspace(scope)).presets?.[0];
  if (!preset) throw new Error('Missing preset');
  await writeFile(guide, 'External edit');
  await expect(
    store.savePreset({
      scope,
      presetId: preset.id,
      revision: preset.revision,
      content: 'Lost edit',
      commit: { title: 'Change guide', body: 'Explain the change.' },
    }),
  ).rejects.toThrow();
  expect(await readFile(guide, 'utf8')).toBe('External edit');
  await symlink(root, join(folder, 'outside'));
  await expect(store.openWorkspace(scope)).rejects.toThrow();
});
it('refuses to take over an existing unrelated library folder', async () => {
  const { store, brand, scope } = await fixture();
  const folder = join(brand.path, 'edition_presets');
  await mkdir(folder);
  await writeFile(join(folder, 'precious.txt'), 'Preserve me');
  await expect(store.ensurePresets(scope)).rejects.toThrow();
  expect(await readFile(join(folder, 'precious.txt'), 'utf8')).toBe('Preserve me');
});
