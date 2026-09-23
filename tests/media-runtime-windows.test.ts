import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import { expect, it } from 'vitest';
import { terminateProcess } from '../src/infrastructure/media/runtime';

const execute = promisify(execFile);

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function ownedPid(child: ChildProcess): Promise<number> {
  const stdout = child.stdout;
  if (!stdout) throw new Error('Fixture requires a PID pipe.');
  let text = '';
  for await (const chunk of stdout) {
    text += String(chunk);
    if (text.includes('\n')) {
      const pid = Number(text.trim());
      if (!Number.isInteger(pid) || pid <= 0) throw new Error('Invalid fixture PID.');
      return pid;
    }
  }
  throw new Error('Fixture exited without a PID.');
}

it.skipIf(process.platform !== 'win32')(
  'terminates a real Windows media process tree while leaving an unrelated process running',
  async () => {
    const grandchildCode = 'setInterval(() => {}, 1000);';
    const parentCode = `
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', ${JSON.stringify(grandchildCode)}], { stdio: 'ignore', windowsHide: true });
process.stdout.write(String(child.pid) + '\\n');
setInterval(() => {}, 1000);
`;
    const parent = spawn(process.execPath, ['-e', parentCode], {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true,
    });
    const unrelated = spawn(process.execPath, ['-e', grandchildCode], {
      stdio: 'ignore',
      windowsHide: true,
    });
    let descendant: number | undefined;
    try {
      descendant = await ownedPid(parent);
      if (!parent.pid || !unrelated.pid) throw new Error('Fixture process did not start.');
      expect(alive(descendant)).toBe(true);
      await Promise.all([terminateProcess(parent), terminateProcess(parent)]);
      expect(alive(parent.pid)).toBe(false);
      expect(alive(descendant)).toBe(false);
      expect(alive(unrelated.pid)).toBe(true);
    } finally {
      for (const child of [parent, unrelated]) {
        if (child.exitCode !== null || child.signalCode !== null) continue;
        const closed = once(child, 'close');
        child.kill('SIGKILL');
        await closed;
      }
      if (descendant && alive(descendant))
        await execute('taskkill', ['/PID', String(descendant), '/T', '/F']).catch(() => undefined);
    }
  },
  15_000,
);
