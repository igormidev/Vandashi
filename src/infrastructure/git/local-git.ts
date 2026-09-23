import { execFile } from 'node:child_process';
import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { Commit, FileChange } from '../../domain/models';
import type { GitPort, GitStatus } from '../../domain/storage';
import { renderFingerprint } from './render-fingerprint';

const execute = promisify(execFile);
const validRevision = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

export class LocalGit implements GitPort {
  constructor(private readonly binary = 'git') {}

  private async run(repository: string, args: string[]): Promise<string> {
    try {
      const directory = await lstat(join(repository, '.git'));
      if (!directory.isDirectory() || directory.isSymbolicLink())
        throw new Error('The project Git directory must be local to this workspace.');
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT' || args[0] !== 'init')
        throw error;
    }
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
    );
    const { stdout } = await execute(
      this.binary,
      [
        '-c',
        'core.quotepath=false',
        '-c',
        `core.hooksPath=${process.platform === 'win32' ? 'NUL' : '/dev/null'}`,
        '-C',
        repository,
        ...args,
      ],
      {
        timeout: 30_000,
        maxBuffer: 16 * 1024 * 1024,
        encoding: 'utf8',
        windowsHide: true,
        env: { ...environment, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' },
      },
    );
    return stdout;
  }

  async init(repository: string): Promise<void> {
    await this.run(repository, ['init', '--initial-branch=main']);
    await this.run(repository, ['config', 'user.name', 'Vandashi']);
    await this.run(repository, ['config', 'user.email', 'local@vandashi.app']);
    await this.run(repository, ['config', 'commit.gpgsign', 'false']);
  }

  async head(repository: string): Promise<string> {
    return (await this.run(repository, ['rev-parse', '--verify', 'HEAD'])).trim();
  }

  async contentRevision(repository: string): Promise<string> {
    const entries = (await this.run(repository, ['ls-files', '--stage', '-z'])).split('\0');
    return renderFingerprint(entries, (path) => this.run(repository, ['show', `:${path}`]));
  }

  async status(repository: string): Promise<GitStatus> {
    const entries = (
      await this.run(repository, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
    ).split('\0');
    const paths: string[] = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      if (!entry) continue;
      paths.push(entry.slice(3));
      if (entry.slice(0, 2).includes('R') || entry.slice(0, 2).includes('C')) index += 1;
    }
    return { dirty: paths.length > 0, paths };
  }

  async stage(repository: string, paths?: string[]): Promise<void> {
    if (paths?.length === 0) return;
    await this.run(repository, ['add', '--all', '--', ...(paths ?? ['.'])]);
  }

  async commit(repository: string, title: string, body: string): Promise<string> {
    if (!title.trim() || !body.trim()) throw new Error('A commit title and description are required.');
    if ((await this.status(repository)).dirty) {
      await this.stage(repository);
      await this.run(repository, ['commit', '--no-gpg-sign', '-m', title.trim(), '-m', body.trim()]);
    }
    return this.head(repository);
  }

  private async fileChanges(repository: string, args: string[]): Promise<FileChange[]> {
    const paths = (await this.run(repository, ['diff', '--name-only', '-z', ...args, '--']))
      .split('\0')
      .filter(Boolean);
    return Promise.all(
      paths.map(async (path) => {
        const literal = `:(literal)${path}`;
        const counts = (await this.run(repository, ['diff', '--numstat', ...args, '--', literal])).split(
          '\t',
        );
        return {
          path,
          additions: Number(counts[0]) || 0,
          deletions: Number(counts[1]) || 0,
          diff: await this.run(repository, [
            'diff',
            '--no-ext-diff',
            '--no-textconv',
            ...args,
            '--',
            literal,
          ]),
        };
      }),
    );
  }

  async diff(repository: string): Promise<FileChange[]> {
    const files = await this.fileChanges(repository, ['HEAD']);
    const known = new Set(files.map((file) => file.path));
    for (const path of (await this.status(repository)).paths) {
      if (known.has(path)) continue;
      const info = await lstat(join(repository, path));
      if (!info.isFile() || info.isSymbolicLink()) {
        files.push({ path, additions: 0, deletions: 0, diff: 'Non-regular file changed.' });
        continue;
      }
      const content = await readFile(join(repository, path));
      const binary = content.includes(0) || content.length > 1_000_000;
      const lines = binary ? [] : content.toString('utf8').split('\n');
      files.push({
        path,
        additions: lines.length,
        deletions: 0,
        diff: binary
          ? 'Binary file added.'
          : `--- /dev/null\n+++ b/${path}\n${lines.map((line) => `+${line}`).join('\n')}`,
      });
    }
    return files;
  }

  async diffBetween(repository: string, from: string, to: string): Promise<FileChange[]> {
    if (!validRevision.test(from) || !validRevision.test(to)) throw new Error('Invalid history comparison.');
    // Deletions and additions stay explicit, including renamed or binary assets.
    return this.fileChanges(repository, ['--no-renames', from, to]);
  }

  async history(repository: string, page: number): Promise<{ commits: Commit[]; hasMore: boolean }> {
    if (!Number.isSafeInteger(page) || page < 0) throw new Error('Invalid history page.');
    const lines = (await this.run(repository, ['log', `--skip=${String(page * 12)}`, '-13', '--format=%H']))
      .trim()
      .split('\n')
      .filter(Boolean);
    const commits: Commit[] = [];
    for (const sha of lines.slice(0, 12)) {
      const parts = (
        await this.run(repository, ['show', '--no-patch', '--format=%s%x00%b%x00%cI', sha])
      ).split('\0');
      const parent = (await this.run(repository, ['rev-list', '--parents', '-n', '1', sha]))
        .trim()
        .split(' ')[1];
      const emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
      commits.push({
        sha,
        title: parts[0] ?? '',
        body: (parts[1] ?? '').trim(),
        date: (parts[2] ?? '').trim(),
        files: await this.fileChanges(repository, [parent ?? emptyTree, sha]),
      });
    }
    return { commits, hasMore: lines.length > 12 };
  }

  async readAt(repository: string, revision: string, path: string): Promise<string> {
    if (!validRevision.test(revision) || path.startsWith('/') || path.split(/[\\/]/u).includes('..'))
      throw new Error('Invalid history reference.');
    return this.run(repository, ['show', `${revision}:${path}`]);
  }

  async revisions(repository: string, path: string): Promise<string[]> {
    return (await this.run(repository, ['log', '--format=%H', '--', path]))
      .trim()
      .split('\n')
      .filter(Boolean);
  }

  async restore(repository: string, revision: string): Promise<void> {
    if (!validRevision.test(revision)) throw new Error('Invalid restore revision.');
    if ((await this.status(repository)).dirty)
      throw new Error('Save current changes before restoring a checkpoint.');
    const backup = await this.head(repository);
    await this.run(repository, ['update-ref', `refs/vandashi/backups/${String(Date.now())}`, backup]);
    try {
      await this.run(repository, ['restore', `--source=${revision}`, '--staged', '--worktree', '--', '.']);
      await this.commit(
        repository,
        'Restore workspace checkpoint',
        `Restore tracked content from ${revision}. The previous state remains in Git history and a backup reference.`,
      );
    } catch (error) {
      await this.run(repository, ['restore', `--source=${backup}`, '--staged', '--worktree', '--', '.']);
      await this.commit(
        repository,
        'Recover interrupted checkpoint restore',
        `Restore the pre-operation content from ${backup}.`,
      );
      throw error;
    }
  }

  async restoreFiles(repository: string, revision: string, paths: string[]): Promise<void> {
    if (
      !validRevision.test(revision) ||
      paths.length === 0 ||
      paths.some(
        (path) =>
          !path ||
          /^[\\/]|^[a-z]:/iu.test(path) ||
          path.split(/[\\/]/u).some((part) => part === '..' || part === '.git'),
      )
    )
      throw new Error('Invalid file restore request.');
    await this.run(repository, ['restore', `--source=${revision}`, '--staged', '--worktree', '--', ...paths]);
  }
}
