import { AppFault } from '../../domain/diagnostics';
import { execFile } from 'node:child_process';
import { copyFile, lstat, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import type { Commit, FileChange } from '../../domain/models';
import type { GitPort, GitStatus } from '../../domain/storage';
import { renderFingerprint } from './render-fingerprint';
import { restoreCheckpoint } from './checkpoint-restore';
import { commitCheckpoint } from './checkpoint-commit';

const execute = promisify(execFile);
const validRevision = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;

export class LocalGit implements GitPort {
  constructor(private readonly binary = 'git') {}

  async checkAvailable(): Promise<void> {
    try {
      const { stdout } = await execute(this.binary, ['--version'], {
        timeout: 30_000,
        maxBuffer: 64 * 1024,
        encoding: 'utf8',
        windowsHide: true,
      });
      if (!/^git version \d/u.test(stdout.trim())) throw new Error(stdout.trim());
    } catch (error) {
      throw new AppFault({ id: 'gitUnavailable' }, error instanceof Error ? error.message : String(error));
    }
  }

  private async run(repository: string, args: string[], input?: string, indexFile?: string): Promise<string> {
    try {
      const directory = await lstat(join(repository, '.git'));
      if (!directory.isDirectory() || directory.isSymbolicLink())
        throw new AppFault({ id: 'gitDirectoryNotLocal' });
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT' || args[0] !== 'init')
        throw error;
    }
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
    );
    const execution = execute(
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
        env: {
          ...environment,
          GIT_TERMINAL_PROMPT: '0',
          GIT_CONFIG_NOSYSTEM: '1',
          ...(indexFile ? { GIT_INDEX_FILE: indexFile } : {}),
        },
      },
    );
    if (input !== undefined) execution.child.stdin?.end(input);
    const { stdout } = await execution;
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

  async indexEntries(repository: string, paths?: string[]): Promise<string> {
    return this.run(repository, [
      'ls-files',
      '--stage',
      '-z',
      '--',
      ...(paths?.map((path) => `:(literal)${path}`) ?? []),
    ]);
  }

  async stagedIndexEntries(repository: string): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'vandashi-index-'));
    const index = join(directory, 'index');
    try {
      await copyFile(join(repository, '.git', 'index'), index);
      await this.run(repository, ['add', '--all', '--', '.'], undefined, index);
      return await this.run(repository, ['ls-files', '--stage', '-z'], undefined, index);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async restoreIndexEntries(
    repository: string,
    paths: string[],
    entries: string,
    expected: string,
  ): Promise<void> {
    if (
      paths.length === 0 ||
      paths.some(
        (path) =>
          !path ||
          /^[\\/]|^[a-z]:/iu.test(path) ||
          path.split(/[\\/]/u).some((part) => part === '..' || part === '.git'),
      )
    )
      throw new AppFault({ id: 'gitRestoreFilesInvalid' });
    if ((await this.indexEntries(repository, paths)) !== expected)
      throw new AppFault({ id: 'storageWorkspaceConflict' });
    if (entries === expected) return;
    const records = entries.split('\0').filter(Boolean);
    if (
      records.some(
        (record) =>
          !/^[0-7]{6} [a-f0-9]{40,64} [0-3]\t/u.test(record) ||
          !paths.includes(record.slice(record.indexOf('\t') + 1)),
      )
    )
      throw new AppFault({ id: 'gitRestoreFilesInvalid' });
    await this.run(
      repository,
      ['update-index', '-z', '--index-info'],
      paths.map((path) => `0 ${'0'.repeat(40)}\t${path}\0`).join('') + entries,
    );
  }

  async commit(repository: string, title: string, body: string, expectedHead?: string): Promise<string> {
    if (!title.trim() || !body.trim()) throw new AppFault({ id: 'appCommitRequired' });
    if (expectedHead !== undefined)
      return commitCheckpoint(
        { run: this.run.bind(this), head: this.head.bind(this) },
        repository,
        title,
        body,
        expectedHead,
      );
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
    if (!validRevision.test(from) || !validRevision.test(to))
      throw new AppFault({ id: 'gitHistoryComparisonInvalid' });
    // Deletions and additions stay explicit, including renamed or binary assets.
    return this.fileChanges(repository, ['--no-renames', from, to]);
  }

  async history(repository: string, page: number): Promise<{ commits: Commit[]; hasMore: boolean }> {
    if (!Number.isSafeInteger(page) || page < 0) throw new AppFault({ id: 'gitHistoryPageInvalid' });
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
      throw new AppFault({ id: 'gitHistoryReferenceInvalid' });
    return this.run(repository, ['show', `${revision}:${path}`]);
  }

  async revisions(repository: string, path: string): Promise<string[]> {
    return (await this.run(repository, ['log', '--format=%H', '--', path]))
      .trim()
      .split('\n')
      .filter(Boolean);
  }

  restore(repository: string, revision: string, expectedHead?: string): Promise<string> {
    return restoreCheckpoint(
      {
        run: (path, args, input) => this.run(path, args, input),
        head: (path) => this.head(path),
        status: (path) => this.status(path),
      },
      repository,
      revision,
      expectedHead,
    );
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
      throw new AppFault({ id: 'gitRestoreFilesInvalid' });
    await this.run(repository, ['restore', `--source=${revision}`, '--staged', '--worktree', '--', ...paths]);
  }
}
