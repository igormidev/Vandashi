import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalGit } from '../src/infrastructure/git/local-git';

const execute = promisify(execFile);
describe('real Git adapter', () => {
  let directory = '';
  let git: LocalGit;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vandashi-git-'));
    git = new LocalGit();
    await git.init(directory);
    await writeFile(join(directory, 'script.md'), '# Initial\n');
    await git.commit(directory, 'Initial script', 'Create the first scene.');
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('captures staged, unstaged, and untracked files including unusual names', async () => {
    await writeFile(join(directory, 'script.md'), '# Changed\n');
    await git.stage(directory, ['script.md']);
    await writeFile(join(directory, 'scene with spaces.md'), 'A scene\n');
    const status = await git.status(directory);
    expect(status.dirty).toBe(true);
    expect(status.paths.sort()).toEqual(['scene with spaces.md', 'script.md']);
    const changes = await git.diff(directory);
    expect(changes.find((file) => file.path === 'script.md')?.diff).toContain('+# Changed');
    expect(changes.find((file) => file.path === 'scene with spaces.md')?.diff).toContain('+A scene');
    await git.commit(directory, 'Update scenes', 'Preserve the staged script and new scene.');
    expect((await git.status(directory)).dirty).toBe(false);
  });

  it('fingerprints committed composition content while ignoring packaging and export bookkeeping', async () => {
    const before = await git.contentRevision(directory);
    for (const name of ['.vandashi.yml', 'video_packaging.yml', 'launch.yml'])
      await writeFile(join(directory, name), 'Changed metadata');
    await git.commit(directory, 'Record export', 'Update publication metadata.');
    expect(await git.contentRevision(directory)).toBe(before);
    await writeFile(join(directory, 'index.html'), '<main>Scene</main>');
    await git.commit(directory, 'Update scene', 'Change the actual composition.');
    expect(await git.contentRevision(directory)).not.toBe(before);
  });

  it('compares immutable checkpoints with literal filenames, deletions, renames, and binary additions', async () => {
    await writeFile(join(directory, 'old.md'), 'Rename this scene\n');
    await writeFile(join(directory, 'remove.md'), 'Remove this scene\n');
    const before = await git.commit(directory, 'Prepare scenes', 'Add the starting assets.');
    await rename(join(directory, 'old.md'), join(directory, 'new.md'));
    await rm(join(directory, 'remove.md'));
    await writeFile(join(directory, 'scene[1].md'), 'A literal filename\n');
    await writeFile(join(directory, 'frame.bin'), Buffer.from([0, 1, 2, 0, 3]));
    await writeFile(join(directory, 'script.md'), '# Checkpointed\n');
    const after = await git.commit(directory, 'Finish scenes', 'Preserve all net changes.');
    await writeFile(join(directory, 'script.md'), '# Later unsaved text\n');

    const files = await git.diffBetween(directory, before, after);
    expect(files.map((file) => file.path).sort()).toEqual([
      'frame.bin',
      'new.md',
      'old.md',
      'remove.md',
      'scene[1].md',
      'script.md',
    ]);
    expect(files.find((file) => file.path === 'script.md')?.diff).toContain('+# Checkpointed');
    expect(files.find((file) => file.path === 'script.md')?.diff).not.toContain('Later unsaved');
    expect(files.find((file) => file.path === 'scene[1].md')).toMatchObject({ additions: 1, deletions: 0 });
    expect(files.find((file) => file.path === 'scene[1].md')?.diff).toContain('+A literal filename');
    expect(files.find((file) => file.path === 'old.md')?.deletions).toBe(1);
    expect(files.find((file) => file.path === 'frame.bin')?.diff).toContain('Binary files');
    expect(await git.diffBetween(directory, after, after)).toEqual([]);
  });

  it('rejects non-SHA comparison arguments before invoking Git', async () => {
    const head = await git.head(directory);
    for (const invalid of ['HEAD', '--output=/tmp/injected', '', 'a'.repeat(41), `${head}~1`]) {
      await expect(git.diffBetween(directory, invalid, head)).rejects.toThrow('Invalid history comparison');
      await expect(git.diffBetween(directory, head, invalid)).rejects.toThrow('Invalid history comparison');
    }
  });

  it('pages twelve commits and represents the root commit without a missing parent error', async () => {
    for (let index = 0; index < 12; index += 1) {
      await writeFile(join(directory, 'script.md'), `Scene ${String(index)}`);
      await git.commit(directory, `Scene ${String(index)}`, 'Update the scene.');
    }
    const first = await git.history(directory, 0);
    expect(first.commits).toHaveLength(12);
    expect(first.hasMore).toBe(true);
    const second = await git.history(directory, 1);
    expect(second.commits).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(second.commits[0]?.files[0]?.diff).toContain('+# Initial');
  });

  it('restores content without rewriting history and preserves a backup reference', async () => {
    const initial = await git.head(directory);
    await writeFile(join(directory, 'script.md'), '# Second');
    const latest = await git.commit(directory, 'Second scene', 'Change the script.');
    await git.restore(directory, initial);
    expect(await readFile(join(directory, 'script.md'), 'utf8')).toBe('# Initial\n');
    expect(await git.head(directory)).not.toBe(latest);
    expect((await git.status(directory)).dirty).toBe(false);
    const { stdout } = await execute(
      'git',
      ['-C', directory, 'for-each-ref', '--format=%(objectname)', 'refs/vandashi/backups/'],
      { env: Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))) },
    );
    expect(stdout.trim()).toBe(latest);
    await writeFile(join(directory, 'script.md'), '# Unsaved');
    await expect(git.restore(directory, latest)).rejects.toThrow('Save current changes');
    expect(await git.head(directory)).not.toBe(initial);
  });

  it('does not execute repository hooks and rejects missing commit descriptions', async () => {
    await mkdir(join(directory, '.git', 'hooks'), { recursive: true });
    await writeFile(join(directory, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
    await writeFile(join(directory, 'script.md'), '# Safe change');
    await expect(git.commit(directory, 'No body', '')).rejects.toThrow('description');
    await expect(
      git.commit(directory, 'Valid change', 'Update despite untrusted project hooks.'),
    ).resolves.toMatch(/^[a-f0-9]+$/u);
    await expect(git.readAt(directory, '--output=/tmp/injected', 'script.md')).rejects.toThrow(
      'Invalid history',
    );
  });

  it('rolls back only a staged script handoff and preserves unrelated pending work', async () => {
    const before = await git.head(directory);
    await writeFile(join(directory, 'script.md'), '# Proposed scene');
    await git.stage(directory, ['script.md']);
    await writeFile(join(directory, 'unrelated.md'), '# User work');
    await git.restoreFiles(directory, before, ['script.md']);
    expect(await readFile(join(directory, 'script.md'), 'utf8')).toBe('# Initial\n');
    expect(await readFile(join(directory, 'unrelated.md'), 'utf8')).toBe('# User work');
    expect((await git.status(directory)).paths).toEqual(['unrelated.md']);
    await expect(git.restoreFiles(directory, before, ['../outside'])).rejects.toThrow('Invalid file restore');
  });
});
