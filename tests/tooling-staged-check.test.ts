import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmod, copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let root = '';
const git = (...args: string[]) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
async function file(path: string, text: string) {
  await writeFile(join(root, path), text);
}
function run(env: NodeJS.ProcessEnv = {}) {
  return spawnSync(
    process.platform === 'win32' ? process.execPath : 'sh',
    process.platform === 'win32' ? ['scripts/check-staged.mjs'] : ['.githooks/pre-commit'],
    {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, ...env },
    },
  );
}
async function beforeState() {
  return {
    index: await readFile(join(root, '.git/index')),
    status: git('status', '--porcelain=v1', '-uall'),
  };
}
async function unchanged(state: Awaited<ReturnType<typeof beforeState>>) {
  expect(await readFile(join(root, '.git/index'))).toEqual(state.index);
  expect(git('status', '--porcelain=v1', '-uall')).toBe(state.status);
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'vandashi-hook-policy-'));
  for (const dir of ['.githooks', 'scripts', 'src', 'node_modules']) await mkdir(join(root, dir));
  expect(await readFile('.githooks/pre-commit', 'utf8')).toContain('node scripts/check-staged.mjs');
  await copyFile('.githooks/pre-commit', join(root, '.githooks/pre-commit'));
  await copyFile('scripts/check-staged.mjs', join(root, 'scripts/check-staged.mjs'));
  await file('.gitignore', 'node_modules/\nreport.json\n');
  const metadata = { name: 'hook-fixture', version: '1.0.0' };
  await file(
    'package.json',
    JSON.stringify({ ...metadata, type: 'module', scripts: { check: 'node verify.mjs' } }),
  );
  await file(
    'package-lock.json',
    JSON.stringify({ ...metadata, lockfileVersion: 3, packages: { '': metadata } }),
  );
  await file(
    'node_modules/.package-lock.json',
    JSON.stringify({ ...metadata, lockfileVersion: 3, packages: {} }),
  );
  await file('src/input.mjs', 'export const ready = true;');
  await file('README.md', 'Staged documentation.\n');
  await file('genesis_prompt.md', 'Staged brief.\n');
  await file(
    'verify.mjs',
    `import './src/input.mjs';
import { readFile, writeFile } from 'node:fs/promises';
await writeFile(process.env.REPORT_FILE, JSON.stringify({
 cwd: process.cwd(), doc: await readFile('README.md', 'utf8'), brief: await readFile('genesis_prompt.md', 'utf8'),
 git: Object.keys(process.env).filter(key => key.startsWith('GIT_')),
}));`,
  );
  git('init', '-q');
  git('add', '.');
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('index-faithful pre-commit hook', () => {
  it('rejects staged invalid code despite an unstaged fix and preserves both versions', async () => {
    await file('src/input.mjs', 'export const ready = ;');
    git('add', 'src/input.mjs');
    await file('src/input.mjs', 'export const ready = true;');
    const state = await beforeState();
    const result = run({ REPORT_FILE: join(root, 'report.json') });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('SyntaxError');
    expect(await readFile(join(root, 'src/input.mjs'), 'utf8')).toBe('export const ready = true;');
    expect(git('show', ':src/input.mjs')).toBe('export const ready = ;');
    await unchanged(state);
  });

  it('rejects a staged import whose helper exists only in the working tree', async () => {
    await file('src/input.mjs', "import './helper.mjs';");
    git('add', 'src/input.mjs');
    await file('src/helper.mjs', 'export const ready = true;');
    const state = await beforeState();
    const result = run({ REPORT_FILE: join(root, 'report.json') });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('ERR_MODULE_NOT_FOUND');
    expect(await readFile(join(root, 'src/helper.mjs'), 'utf8')).toBe('export const ready = true;');
    await unchanged(state);
  });

  it('checks staged docs/brief, sanitizes hook Git routing and preserves all unstaged edits', async () => {
    await file('README.md', 'Unstaged docs.\n');
    await file('genesis_prompt.md', 'User naming edits.\n');
    await file('src/input.mjs', 'Unstaged broken source!');
    const state = await beforeState();
    const result = run({
      REPORT_FILE: join(root, 'report.json'),
      GIT_INDEX_FILE: join(root, '.git/index'),
      GIT_WORK_TREE: root,
    });
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(await readFile(join(root, 'report.json'), 'utf8')) as {
      cwd: string;
      doc: string;
      brief: string;
      git: string[];
    };
    expect(report).toMatchObject({ doc: 'Staged documentation.\n', brief: 'Staged brief.\n', git: [] });
    expect(report.cwd).not.toBe(root);
    await expect(readFile(join(report.cwd, 'package.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(root, 'genesis_prompt.md'), 'utf8')).toBe('User naming edits.\n');
    expect(await readFile(join(root, 'README.md'), 'utf8')).toBe('Unstaged docs.\n');
    await unchanged(state);
  });

  it('rejects an index changed during checks without reverting the newer staged work', async () => {
    await file(
      'verify.mjs',
      `import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
await writeFile(process.env.ORIGINAL_REPO + '/src/input.mjs', 'export const concurrent = true;');
execFileSync('git', ['-C', process.env.ORIGINAL_REPO, 'add', 'src/input.mjs']);`,
    );
    git('add', 'verify.mjs');
    const result = run({ ORIGINAL_REPO: root });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('index changed during checks');
    expect(git('show', ':src/input.mjs')).toBe('export const concurrent = true;');
    expect(await readFile(join(root, 'src/input.mjs'), 'utf8')).toBe('export const concurrent = true;');
  });

  it('rejects staged gitlinks rather than checking an unmaterialized submodule', () => {
    const object = git('write-tree').trim();
    git('update-index', '--add', '--cacheinfo', `160000,${object},nested`);
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Staged submodules cannot be verified');
  });

  it('rejects a checkout filter that substitutes different source bytes', async () => {
    await file('.gitattributes', 'src/input.mjs filter=changed\n');
    git('add', '.gitattributes');
    git(
      'config',
      'filter.changed.smudge',
      `node -e "process.stdin.resume();process.stdin.on('end',()=>process.stdout.write('changed'))"`,
    );
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Checkout filter changed staged bytes');
  });

  it.skipIf(process.platform === 'win32')(
    'stops the check process group and removes its snapshot when interrupted',
    async () => {
      await file(
        'verify.mjs',
        `import { writeFile } from 'node:fs/promises';
await writeFile(process.env.REPORT_FILE, JSON.stringify({ cwd: process.cwd(), pid: process.pid }));
setInterval(() => {}, 1000);`,
      );
      git('add', 'verify.mjs');
      const child = spawn(process.execPath, ['scripts/check-staged.mjs'], {
        cwd: root,
        env: { ...process.env, REPORT_FILE: join(root, 'report.json') },
        stdio: 'ignore',
      });
      try {
        let report: { cwd: string; pid: number } | undefined;
        await vi.waitFor(
          async () => {
            report = JSON.parse(await readFile(join(root, 'report.json'), 'utf8')) as typeof report;
            expect(report).toBeDefined();
          },
          { timeout: 5000 },
        );
        const stopped = new Promise((resolve) => {
          child.once('exit', resolve);
        });
        child.kill('SIGTERM');
        await stopped;
        expect(report).toBeDefined();
        if (!report) throw new Error('Missing check process receipt');
        await expect(readFile(join(report.cwd, 'package.json'))).rejects.toMatchObject({ code: 'ENOENT' });
        const pid = report.pid;
        await vi.waitFor(() => {
          expect(() => process.kill(pid, 0)).toThrow();
        });
      } finally {
        child.kill('SIGKILL');
      }
    },
  );

  it('rejects different staged dependency inputs before using the shared installation', async () => {
    await file('package.json', JSON.stringify({ name: 'unstaged-install' }));
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Stage package.json');
  });

  it('rejects an installation that does not match the staged lockfile', async () => {
    await file(
      'node_modules/.package-lock.json',
      JSON.stringify({ packages: { 'node_modules/extra': { version: '9.0.0' } } }),
    );
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('does not match the staged lockfile');
  });

  it('rejects an escaping staged symlink without reading it as checked source', async () => {
    await symlink(join(root, 'README.md'), join(root, 'outside.md'));
    git('add', 'outside.md');
    const result = run();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('symlink escapes');
  });

  it('preserves internal symlinks and executable bits in the staged checkout', async () => {
    await file('executable.sh', '#!/bin/sh\nexit 0\n');
    await chmod(join(root, 'executable.sh'), 0o755);
    await symlink('README.md', join(root, 'linked.md'));
    await file(
      'verify.mjs',
      `import { lstat, readFile, stat } from 'node:fs/promises';
if (!(await lstat('linked.md')).isSymbolicLink()) throw new Error('Link lost');
if ((await readFile('linked.md', 'utf8')) !== 'Staged documentation.\\n') throw new Error('Wrong link');
if (process.platform !== 'win32' && !((await stat('executable.sh')).mode & 0o111)) throw new Error('Mode lost');`,
    );
    git('add', '.');
    const result = run();
    expect(result.status, result.stderr).toBe(0);
  });
});
