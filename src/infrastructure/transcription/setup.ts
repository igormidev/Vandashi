import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { AppFault } from '../../domain/diagnostics';
import type { TranscriptionProgressListener } from '../../domain/transcription';
import uv from './resources/uv.json';
import { digest, downloadFile } from './download';
import { wheelExecutable } from './zip';
import { runTranscriptionProcess } from './process';

export function privateEnvironment(directory: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    UV_PYTHON_INSTALL_DIR: join(directory, 'python'),
    UV_CACHE_DIR: join(directory, 'uv-cache'),
    UV_NO_MODIFY_PATH: '1',
    UV_PYTHON_INSTALL_BIN: 'false',
  };
  return Object.fromEntries(
    Object.entries(environment).filter(
      ([key]) =>
        !/^(PYTHONPATH|PYTHONHOME|VIRTUAL_ENV|UV_INDEX|UV_EXTRA_INDEX|UV_DEFAULT_INDEX|UV_FIND_LINKS|PIP_)/.test(
          key,
        ),
    ),
  );
}

async function setupUv(directory: string, signal: AbortSignal): Promise<string> {
  const key = `${process.platform}-${process.arch}`;
  const file = Object.entries(uv.platforms).find(([platform]) => platform === key)?.[1];
  if (!file) throw new AppFault({ id: 'appTranscriptionSetupFailed' }, key);
  const binary = join(directory, `uv-${uv.version}${process.platform === 'win32' ? '.exe' : ''}`);
  try {
    if ((await lstat(binary)).isFile() && (await digest(binary, signal)) === file.executableSha256)
      return binary;
  } catch (error) {
    signal.throwIfAborted();
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  const archive = join(directory, `uv-${uv.version}.whl`);
  await downloadFile(archive, file, signal, () => undefined);
  const executable = wheelExecutable(await readFile(archive), file.entry);
  if (createHash('sha256').update(executable).digest('hex') !== file.executableSha256)
    throw new AppFault({ id: 'appTranscriptionSetupFailed' });
  const temporary = `${binary}.${randomUUID()}.partial`;
  try {
    await writeFile(temporary, executable, { flag: 'wx', mode: 0o700 });
    await chmod(temporary, 0o700);
    await rename(temporary, binary);
  } finally {
    await rm(temporary, { force: true });
  }
  await rm(archive, { force: true });
  return binary;
}

export async function ensureRuntime(
  directory: string,
  worker: string,
  progress: TranscriptionProgressListener,
  signal: AbortSignal,
  readOnly = false,
): Promise<string> {
  const platform =
    process.platform === 'darwin' && process.arch === 'arm64'
      ? 'macos-arm64'
      : process.platform === 'linux' && process.arch === 'x64'
        ? 'linux-x64'
        : process.platform === 'win32' && process.arch === 'x64'
          ? 'windows-x64'
          : null;
  if (!platform) throw new AppFault({ id: 'appTranscriptionSetupFailed' });
  const lock = join(dirname(worker), `${platform}.txt`);
  const revision = createHash('sha256')
    .update(await readFile(lock))
    .digest('hex');
  const environment = join(directory, 'environment');
  const python = join(
    environment,
    ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']),
  );
  const marker = join(environment, '.vandashi-runtime');
  try {
    if ((await lstat(python)).isFile() || (await lstat(python)).isSymbolicLink()) {
      if ((await readFile(marker, 'utf8')) === revision) return python;
    }
  } catch (error) {
    signal.throwIfAborted();
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  if (readOnly) throw new AppFault({ id: 'appTranscriptionSetupFailed' });
  progress({ phase: 'installing' });
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const executable = await setupUv(directory, signal);
  const env = privateEnvironment(directory);
  // uv venv does not overwrite a nonempty environment; pip sync repairs interrupted installs in place.
  try {
    await lstat(python);
  } catch {
    await runTranscriptionProcess(
      executable,
      ['--no-config', 'venv', '--python', '3.11.15', '--managed-python', environment],
      env,
      signal,
    );
  }
  await runTranscriptionProcess(
    executable,
    [
      '--no-config',
      'pip',
      'sync',
      '--python',
      python,
      '--require-hashes',
      '--only-binary',
      ':all:',
      '--no-binary',
      'antlr4-python3-runtime',
      '--build-constraints',
      join(dirname(worker), 'build-constraints.txt'),
      ...(process.platform === 'darwin' ? [] : ['--torch-backend', 'cpu']),
      lock,
    ],
    env,
    signal,
  );
  const request = join(directory, `health-${randomUUID()}.json`);
  try {
    await writeFile(request, JSON.stringify({ op: 'health', cache: join(directory, 'models') }), {
      flag: 'wx',
      mode: 0o600,
    });
    const state = { ready: false };
    await runTranscriptionProcess(python, ['-s', '-E', worker, request], env, signal, (line) => {
      const value: unknown = JSON.parse(line);
      if (value && typeof value === 'object' && 'type' in value && value.type === 'ready') state.ready = true;
    });
    if (!state.ready) throw new AppFault({ id: 'appTranscriptionSetupFailed' });
    await writeFile(marker, revision, { mode: 0o600 });
  } finally {
    await rm(request, { force: true });
  }
  return python;
}
