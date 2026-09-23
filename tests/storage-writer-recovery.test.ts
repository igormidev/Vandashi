import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, expect, it, vi } from 'vitest';
import type { SaveInput } from '../src/domain/models';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import { ManualMutation } from '../src/infrastructure/storage/manual-mutation';
import * as files from '../src/infrastructure/storage/files';

let directory = '';
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});
const reviewed = { title: 'Reviewed guide changes', body: 'Keep the exact approved description.' };

async function fixture(video = false) {
  directory = await mkdtemp(join(tmpdir(), 'vandashi-writer-recovery-'));
  const git = new LocalGit();
  const storage = new LocalStorage(join(directory, 'settings'), git);
  const brand = await storage.createBrand({ parentPath: directory, name: 'Writer recovery' });
  const identity = join(brand.path, 'brand_identity');
  const partial = join(identity, 'partial.txt');
  const untracked = join(identity, 'untracked.txt');
  await writeFile(partial, 'Committed unrelated bytes');
  await git.commit(identity, 'Baseline', 'Track an unrelated file before the reviewed save.');
  const workspace = video
    ? await storage.createVideo({ brandId: brand.id, name: 'Recovery video', ratio: '16:9' })
    : await storage.openBrand(brand.id);
  await writeFile(partial, 'User-staged unrelated bytes');
  await git.stage(identity, ['partial.txt']);
  await writeFile(partial, 'User working-tree bytes');
  await writeFile(untracked, 'User untracked bytes');
  const documents = workspace.documents.filter((document) => document.path.startsWith(identity)).slice(0, 2);
  const first = documents[0];
  const second = documents[1];
  if (!first || !second) throw new Error('Two taste guides are required');
  const input: SaveInput = {
    scope: workspace.scope,
    revision: workspace.revision,
    documents: documents.map((document, index) => ({
      path: document.path,
      content: `${document.content}\nReviewed writer edit ${String(index)}\n`,
    })),
    brandConfig: { ...workspace.brand.config, description: 'Reviewed brand description' },
    packaging: workspace.video ? { ...workspace.video.packaging, theme: 'Reviewed packaging theme' } : null,
    commit: reviewed,
  };
  const paths = [
    first.path,
    second.path,
    join(identity, 'brand_config.yml'),
    ...(workspace.video ? [join(workspace.video.path, 'video_packaging.yml')] : []),
  ];
  const repositories = await storage.repositories(workspace.scope);
  const before = {
    contents: await Promise.all(paths.map((path) => readFile(path))),
    heads: await Promise.all(repositories.map((path) => git.head(path))),
    indexes: await Promise.all(repositories.map((path) => git.indexEntries(path))),
  };
  return {
    git,
    storage,
    workspace,
    identity,
    partial,
    untracked,
    first,
    second,
    input,
    paths,
    repositories,
    before,
  };
}

it.each(['before-receipt', 'before-install', 'after-install'] as const)(
  'restores an earlier guide after the second writer fails %s, then retries the original reviewed request',
  async (phase) => {
    const state = await fixture();
    const { git, storage, first, second, input, paths, repositories, before } = state;
    const write = files.atomicWrite;
    const commit = vi.spyOn(git, 'commit');
    const writer = vi.spyOn(files, 'atomicWrite').mockImplementation(async (path, content, receipt) => {
      if (path !== second.path || typeof content !== 'string') return write(path, content, receipt);
      expect(await readFile(first.path, 'utf8')).toContain('Reviewed writer edit 0');
      if (phase === 'before-receipt') throw new Error('Injected guide writer failure');
      await write(path, content, (target, hash) => {
        receipt?.(target, hash);
        if (phase === 'before-install') throw new Error('Injected guide writer failure');
      });
      throw new Error('Injected guide writer failure');
    });
    await expect(storage.saveWorkspace(input)).rejects.toThrow('Injected guide writer failure');
    expect(commit).not.toHaveBeenCalled();
    expect(await Promise.all(paths.map((path) => readFile(path)))).toEqual(before.contents);
    expect(await Promise.all(repositories.map((path) => git.head(path)))).toEqual(before.heads);
    expect(await Promise.all(repositories.map((path) => git.indexEntries(path)))).toEqual(before.indexes);
    expect(await readFile(state.partial, 'utf8')).toBe('User working-tree bytes');
    expect(await readFile(state.untracked, 'utf8')).toBe('User untracked bytes');
    expect(writer.mock.calls.filter(([path]) => path === second.path)).toHaveLength(
      phase === 'after-install' ? 2 : 1,
    );
    expect(await readdir(join(state.identity, '.vandashi-recovery'))).toEqual([]);
    expect((await storage.openWorkspace(input.scope)).revision).toBe(input.revision);
    writer.mockRestore();
    await storage.saveWorkspace(input);
    expect(await readFile(first.path, 'utf8')).toBe(input.documents[0]?.content);
    expect(await readFile(second.path, 'utf8')).toBe(input.documents[1]?.content);
    expect((await git.history(state.identity, 0)).commits[0]).toMatchObject(reviewed);
    expect((await storage.openWorkspace(input.scope)).dirty).toBe(false);
  },
);

it.each(['brand-config', 'packaging', 'brand-image'] as const)(
  'restores guides and preserves logo ownership when the %s writer cannot install',
  async (target) => {
    const state = await fixture(target === 'packaging');
    const { git, storage, identity, input, paths, repositories, before } = state;
    const source = join(directory, 'chosen-logo.png');
    await writeFile(source, 'Preserve native-picked source bytes');
    if (!input.brandConfig) throw new Error('Missing brand config');
    input.brandConfig.image = source;
    const failedPath =
      target === 'packaging'
        ? join(state.workspace.video?.path ?? '', 'video_packaging.yml')
        : join(identity, target === 'brand-image' ? 'brand_icon.png' : 'brand_config.yml');
    const write = files.atomicWrite;
    const commit = vi.spyOn(git, 'commit');
    const writer = vi.spyOn(files, 'atomicWrite').mockImplementation(async (path, content, receipt) => {
      if (path !== failedPath) return write(path, content, receipt);
      await write(path, content, (destination, hash) => {
        receipt?.(destination, hash);
        throw new Error('Persistent installation failure');
      });
    });
    await expect(storage.saveWorkspace(input)).rejects.toThrow('Persistent installation failure');
    expect(commit).not.toHaveBeenCalled();
    expect(writer.mock.calls.filter(([path]) => path === failedPath)).toHaveLength(1);
    expect(await Promise.all(paths.map((path) => readFile(path)))).toEqual(before.contents);
    expect(await Promise.all(repositories.map((path) => git.head(path)))).toEqual(before.heads);
    expect(await Promise.all(repositories.map((path) => git.indexEntries(path)))).toEqual(before.indexes);
    await expect(readFile(join(identity, 'brand_icon.png'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(source, 'utf8')).toBe('Preserve native-picked source bytes');
    writer.mockRestore();
    await storage.saveWorkspace(input);
    expect(await readFile(join(identity, 'brand_icon.png'), 'utf8')).toBe(
      'Preserve native-picked source bytes',
    );
    expect((await git.history(identity, 0)).commits[0]).toMatchObject(reviewed);
    if (state.workspace.video)
      expect((await git.history(state.workspace.video.path, 0)).commits[0]).toMatchObject(reviewed);
  },
);

it('recognizes an earlier installed receipt when a later write to the same file fails before installation', async () => {
  const { git, identity, first } = await fixture();
  const original = await readFile(first.path);
  const index = await git.indexEntries(identity);
  const head = await git.head(identity);
  const mutation = new ManualMutation(git);
  await expect(
    mutation.run({
      key: 'Repeated file write',
      repositories: [identity],
      paths: [first.path],
      commit: reviewed,
      mutate: async (receipt) => {
        await files.atomicWrite(first.path, 'First installed value', receipt);
        await files.atomicWrite(first.path, 'Second uninstalled value', (path, hash) => {
          receipt(path, hash);
          throw new Error('Second installation failed');
        });
      },
    }),
  ).rejects.toThrow('Second installation failed');
  expect(await readFile(first.path)).toEqual(original);
  expect(await git.head(identity)).toBe(head);
  expect(await git.indexEntries(identity)).toBe(index);
  expect(mutation.has('Repeated file write')).toBe(false);
});

it('restores an owned partial deletion while leaving an announced but unperformed deletion untouched', async () => {
  const { git, identity, first, second } = await fixture();
  const original = await Promise.all([first.path, second.path].map((path) => readFile(path)));
  const index = await git.indexEntries(identity);
  const head = await git.head(identity);
  const mutation = new ManualMutation(git);
  let fail = true;
  const input = {
    key: 'Reviewed deletion',
    repositories: [identity],
    paths: [first.path, second.path],
    commit: reviewed,
    mutate: async (receipt: files.WriteReceipt) => {
      receipt(first.path, null);
      await rm(first.path);
      receipt(second.path, null);
      if (fail) throw new Error('Second deletion failed');
      await rm(second.path);
    },
  };
  await expect(mutation.run(input)).rejects.toThrow('Second deletion failed');
  expect(await Promise.all(input.paths.map((path) => readFile(path)))).toEqual(original);
  expect(await git.head(identity)).toBe(head);
  expect(await git.indexEntries(identity)).toBe(index);
  fail = false;
  await mutation.run(input);
  for (const path of input.paths) await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' });
  expect((await git.history(identity, 0)).commits[0]).toMatchObject(reviewed);
});

it.each(['owned-bytes', 'unrelated-bytes', 'index', 'head'] as const)(
  'preserves an external %s change and recovery evidence when a later writer fails',
  async (target) => {
    const state = await fixture();
    const { git, storage, identity, first, second, input, paths, before } = state;
    const write = files.atomicWrite;
    let externalHead = '';
    let externalIndex = '';
    let externalContents: Buffer[] = [];
    const commit = vi.spyOn(git, 'commit');
    const writer = vi.spyOn(files, 'atomicWrite').mockImplementation(async (path, content, receipt) => {
      if (path !== second.path) return write(path, content, receipt);
      if (target === 'owned-bytes') await writeFile(first.path, 'External guide replacement');
      else if (target === 'unrelated-bytes') await writeFile(state.partial, 'External unrelated replacement');
      else if (target === 'index') await git.stage(identity, ['partial.txt', 'untracked.txt']);
      else await new LocalGit().commit(identity, 'External commit', 'Preserve external committed work.');
      externalHead = await git.head(identity);
      externalIndex = await git.indexEntries(identity);
      externalContents = await Promise.all(paths.map((file) => readFile(file)));
      await write(path, content, (destination, hash) => {
        receipt?.(destination, hash);
        throw new Error('Writer failed after external changes');
      });
    });
    await expect(storage.saveWorkspace(input)).rejects.toMatchObject({
      diagnostic: { message: { id: 'storageWorkspaceConflict' } },
    });
    expect(commit).not.toHaveBeenCalled();
    expect(await git.head(identity)).toBe(externalHead);
    expect(await git.indexEntries(identity)).toBe(externalIndex);
    expect(await Promise.all(paths.map((path) => readFile(path)))).toEqual(externalContents);
    if (target === 'unrelated-bytes')
      expect(await readFile(state.partial, 'utf8')).toBe('External unrelated replacement');
    const recoveryRoot = join(identity, '.vandashi-recovery');
    const backups = await readdir(recoveryRoot);
    expect(backups).toHaveLength(1);
    const manifest = JSON.parse(
      await readFile(join(recoveryRoot, backups[0] ?? '', 'manifest.json'), 'utf8'),
    ) as { files: { path: string; copy: string | null }[] };
    const original = manifest.files.find((file) => file.path === first.path)?.copy;
    expect(original).toBeTruthy();
    expect(await readFile(original ?? '')).toEqual(before.contents[0]);
    writer.mockRestore();
    await expect(storage.saveWorkspace(input)).rejects.toMatchObject({
      diagnostic: { message: { id: 'storageWorkspaceConflict' } },
    });
    expect(await git.head(identity)).toBe(externalHead);
    expect(await git.indexEntries(identity)).toBe(externalIndex);
    expect(await Promise.all(paths.map((path) => readFile(path)))).toEqual(externalContents);
  },
);
