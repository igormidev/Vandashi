import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { restoreCheckpoint } from '../src/infrastructure/git/checkpoint-restore';

const execute = promisify(execFile);
let path: string;
let initial: string;
let current: string;
let git: LocalGit;
beforeEach(async () => {
  path = await mkdtemp(join(tmpdir(), 'vandashi-restore-race-'));
  git = new LocalGit();
  await git.init(path);
  await writeFile(join(path, 'script.md'), 'Initial');
  initial = await git.commit(path, 'Initial', 'Create the initial scene.');
  await writeFile(join(path, 'script.md'), 'Current');
  current = await git.commit(path, 'Current', 'Save the latest scene.');
});
afterEach(async () => {
  await rm(path, { recursive: true, force: true });
});

function restore(inject: (args: string[]) => Promise<void> | void) {
  return restoreCheckpoint(
    {
      head: (directory) => git.head(directory),
      status: (directory) => git.status(directory),
      run: async (directory, args, input) => {
        await inject(args);
        const execution = execute('git', ['-C', directory, ...args], {
          env: Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_'))),
        });
        if (input !== undefined) execution.child.stdin?.end(input);
        return (await execution).stdout;
      },
    },
    path,
    initial,
    current,
  );
}

it('rejects an obsolete expected head before any content or history change', async () => {
  await expect(git.restore(path, initial, initial)).rejects.toThrow('after this turn');
  expect(await git.head(path)).toBe(current);
  expect(await readFile(join(path, 'script.md'), 'utf8')).toBe('Current');
});

it.each(['dirty', 'commit'] as const)(
  'preserves an external $0 immediately before the checkout command',
  async (kind) => {
    let injected = false;
    let expected = current;
    await expect(
      restore(async (args) => {
        if (args[0] !== 'read-tree' || injected) return;
        injected = true;
        await writeFile(join(path, 'script.md'), 'External before checkout');
        if (kind === 'commit') expected = await git.commit(path, 'External', 'Preserve concurrent work.');
      }),
    ).rejects.toThrow();
    expect(injected).toBe(true);
    expect(await git.head(path)).toBe(expected);
    expect(await readFile(join(path, 'script.md'), 'utf8')).toBe('External before checkout');
  },
);

it('uses atomic expected-head comparison when an external commit arrives after checkout', async () => {
  let expected = '';
  await expect(
    restore(async (args) => {
      if (args[0] !== 'update-ref' || args[1] !== 'HEAD') return;
      await writeFile(join(path, 'script.md'), 'External after checkout');
      expected = await git.commit(path, 'External', 'Preserve concurrent work.');
    }),
  ).rejects.toThrow();
  expect(expected).not.toBe('');
  expect(await git.head(path)).toBe(expected);
  expect(await readFile(join(path, 'script.md'), 'utf8')).toBe('External after checkout');
});

it('recovers only its own checkout if advancing HEAD fails', async () => {
  await expect(
    restore((args) => {
      if (args[0] === 'update-ref' && args[1] === 'HEAD') throw new Error('Reference unavailable');
    }),
  ).rejects.toThrow('Reference unavailable');
  expect(await git.head(path)).toBe(current);
  expect(await readFile(join(path, 'script.md'), 'utf8')).toBe('Current');
  expect((await git.status(path)).dirty).toBe(false);
});

it('retains dirty external bytes rather than compensating them after an update failure', async () => {
  await expect(
    restore(async (args) => {
      if (args[0] !== 'update-ref' || args[1] !== 'HEAD') return;
      await writeFile(join(path, 'script.md'), 'External during failed update');
      throw new Error('Reference unavailable');
    }),
  ).rejects.toThrow('Reference unavailable');
  expect(await git.head(path)).toBe(current);
  expect(await readFile(join(path, 'script.md'), 'utf8')).toBe('External during failed update');
  expect((await git.status(path)).dirty).toBe(true);
});
