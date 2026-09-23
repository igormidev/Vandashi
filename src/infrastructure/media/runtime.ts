import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export const HYPERFRAMES_VERSION = '0.8.64';

export interface MediaAdapterOptions {
  nodePath?: string;
  cliPath?: string;
  environment?: NodeJS.ProcessEnv;
  startupTimeoutMs?: number;
  skillRoots?: string[];
}

export interface MediaRuntime {
  nodePath: string;
  cliPath: string;
  environment: NodeJS.ProcessEnv;
  startupTimeoutMs: number;
  skillRoots: string[];
}

export function resolveMediaRuntime(options: MediaAdapterOptions = {}): MediaRuntime {
  const require = createRequire(import.meta.url);
  const cliPath =
    options.cliPath ?? join(dirname(require.resolve('hyperframes/package.json')), 'bin', 'hyperframes.mjs');
  const environment = { ...process.env, ...options.environment };
  for (const name of ['FFMPEG', 'FFPROBE']) {
    const legacy = environment[`${name}_PATH`];
    if (!environment[`HYPERFRAMES_${name}_PATH`] && legacy) environment[`HYPERFRAMES_${name}_PATH`] = legacy;
  }
  const unpacked = cliPath.replace(/app\.asar([/\\])/, 'app.asar.unpacked$1');
  return {
    nodePath: options.nodePath ?? process.execPath,
    cliPath: existsSync(unpacked) ? unpacked : cliPath,
    environment: {
      ...environment,
      ELECTRON_RUN_AS_NODE: '1',
      HYPERFRAMES_PREVIEW_HOST: '127.0.0.1',
      HYPERFRAMES_NO_UPDATE_CHECK: '1',
      HYPERFRAMES_NO_TELEMETRY: '1',
      HYPERFRAMES_SKIP_SKILLS: '1',
      DO_NOT_TRACK: '1',
    },
    startupTimeoutMs: options.startupTimeoutMs ?? 30_000,
    skillRoots: options.skillRoots ?? [],
  };
}

export function launchCli(runtime: MediaRuntime, args: string[]): ChildProcess {
  return spawn(runtime.nodePath, [runtime.cliPath, ...args], {
    env: runtime.environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
}

export async function terminateProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const finish = (): void => {
      clearTimeout(force);
      clearTimeout(deadline);
      resolve();
    };
    child.once('close', finish);
    const force = setTimeout(() => {
      if (process.platform === 'win32' && child.pid !== undefined) {
        const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
          windowsHide: true,
          stdio: 'ignore',
        });
        killer.once('error', () => {
          child.kill('SIGKILL');
        });
      } else child.kill('SIGKILL');
    }, 3_000);
    const deadline = setTimeout(() => {
      child.off('close', finish);
      resolve();
    }, 5_000);
    child.kill('SIGTERM');
  });
}

export async function runProcess(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  timeout = 15_000,
): Promise<string> {
  const child = spawn(command, args, {
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  return new Promise<string>((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void terminateProcess(child);
      reject(error);
    };
    const timer = setTimeout(() => {
      fail(new Error('The media command timed out.'));
    }, timeout);
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (stdout.length > 4_000_000) fail(new Error('The media command returned too much output.'));
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-8_000);
    });
    child.once('error', fail);
    child.once('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr.trim() || `The media command exited with code ${String(code)}.`));
    });
  });
}
