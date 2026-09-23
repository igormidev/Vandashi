import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { commitCheckpoint } from '../src/infrastructure/git/checkpoint-commit';
import { LocalGit } from '../src/infrastructure/git/local-git';

const execute = promisify(execFile);
let path: string;
let git: LocalGit;
let baseline: string;
beforeEach(async () => {
  path = await mkdtemp(join(tmpdir(), 'vandashi-safety-commit-'));
  git = new LocalGit();
  await git.init(path);
  await writeFile(join(path, 'index.html'), 'Opening scene');
  baseline = await git.commit(path, 'Opening scene', 'Initial editor content.');
  await writeFile(join(path, 'index.html'), 'Staged edit');
  await git.stage(path);
  await writeFile(join(path, 'index.html'), 'Working edit');
  await writeFile(join(path, 'new.html'), 'Untracked scene');
});
afterEach(async () => {
  await rm(path, { recursive: true, force: true });
});

async function run(args: string[], input?: string, indexFile?: string) {
  const execution = execute('git', ['-C', path, ...args], {
    env: {
      ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
      ...(indexFile ? { GIT_INDEX_FILE: indexFile } : {}),
    },
  });
  if (input !== undefined) execution.child.stdin?.end(input);
  return (await execution).stdout;
}
function checkpoint(inject: (args: string[]) => Promise<void> | void) {
  return commitCheckpoint(
    {
      head: (directory) => git.head(directory),
      run: async (_directory, args, input, indexFile) => {
        await inject(args);
        return run(args, input, indexFile);
      },
    },
    path,
    'Preserve manual work',
    'Exact checkpoint of the pending editor content.',
    baseline,
  );
}

it('returns the exact safety commit with its checked parent and all working content', async () => {
  const receipt = await git.commit(path, 'Preserve manual work', 'Owned safety checkpoint.', baseline);
  expect((await run(['rev-list', '--parents', '-1', receipt])).trim()).toBe(`${receipt} ${baseline}`);
  expect(await git.head(path)).toBe(receipt);
  expect(await git.readAt(path, receipt, 'index.html')).toBe('Working edit');
  expect(await git.readAt(path, receipt, 'new.html')).toBe('Untracked scene');
  expect((await git.status(path)).dirty).toBe(false);
});

it.each(['write-tree', 'commit-tree', 'update-ref'])(
  'preserves the exact partially staged index and working files if %s fails',
  async (command) => {
    const index = await readFile(join(path, '.git', 'index'));
    await expect(
      checkpoint((args) => {
        if (args[0] === command) throw new Error('Injected checkpoint failure');
      }),
    ).rejects.toThrow('Injected checkpoint failure');
    expect(await git.head(path)).toBe(baseline);
    expect(await readFile(join(path, '.git', 'index'))).toEqual(index);
    expect(await readFile(join(path, 'index.html'), 'utf8')).toBe('Working edit');
    expect(await readFile(join(path, 'new.html'), 'utf8')).toBe('Untracked scene');
    await expect(readFile(join(path, '.git', 'index.lock'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(git.commit(path, 'Retry', 'Retry the same checkpoint.', baseline)).resolves.toBeDefined();
  },
);

it('rejects a held index lock without changing existing staging or its owner lock', async () => {
  const index = await readFile(join(path, '.git', 'index'));
  await writeFile(join(path, '.git', 'index.lock'), 'External Git owns this lock');
  await expect(git.commit(path, 'Preserve', 'Safety checkpoint.', baseline)).rejects.toMatchObject({
    code: 'EEXIST',
  });
  expect(await git.head(path)).toBe(baseline);
  expect(await readFile(join(path, '.git', 'index'))).toEqual(index);
  expect(await readFile(join(path, '.git', 'index.lock'), 'utf8')).toBe('External Git owns this lock');
});

it('preserves an external commit that moves HEAD immediately before the atomic ref update', async () => {
  const index = await readFile(join(path, '.git', 'index'));
  let external = '';
  await expect(
    checkpoint(async (args) => {
      if (args[0] !== 'update-ref') return;
      const tree = (await run(['rev-parse', `${baseline}^{tree}`])).trim();
      external = (await run(['commit-tree', tree, '-p', baseline], 'External commit\n')).trim();
      await run(['update-ref', 'HEAD', external, baseline]);
    }),
  ).rejects.toThrow();
  expect(external).not.toBe('');
  expect(await git.head(path)).toBe(external);
  expect(await readFile(join(path, '.git', 'index'))).toEqual(index);
  expect(await readFile(join(path, 'index.html'), 'utf8')).toBe('Working edit');
});

it.each(['commit-tree', 'update-ref'])(
  'rejects an external index rewrite at %s without restoring over it',
  async (command) => {
    const externalIndex = join(path, 'external-index');
    await run(['read-tree', baseline], undefined, externalIndex);
    const external = await readFile(externalIndex);
    await rm(externalIndex);
    await expect(
      checkpoint(async (args) => {
        if (args[0] === command) await writeFile(join(path, '.git', 'index'), external);
      }),
    ).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'appStudioCheckpointChanged' } },
    });
    expect(await git.head(path)).toBe(baseline);
    expect(await readFile(join(path, '.git', 'index'))).toEqual(external);
    expect(await readFile(join(path, 'index.html'), 'utf8')).toBe('Working edit');
  },
);

it('holds the real index lock while it prepares its independent staging snapshot', async () => {
  let checked = false;
  await checkpoint(async (args) => {
    if (args[0] !== 'commit-tree') return;
    checked = true;
    await expect(new LocalGit().stage(path)).rejects.toThrow('index.lock');
  });
  expect(checked).toBe(true);
  expect((await git.status(path)).dirty).toBe(false);
});
