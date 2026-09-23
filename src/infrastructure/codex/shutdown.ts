import { execFile } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';

/** Resolves only after the owned stdio process closes; signaling is not proof of termination. */
export async function shutdownProcess(
  child: ChildProcessWithoutNullStreams,
  closed: Promise<void>,
  graceMs = 5_000,
): Promise<void> {
  const pid = child.pid;
  const killGroup = () => {
    if (!pid) return;
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      // An already exited process group is the expected graceful case.
    }
  };
  if (process.platform === 'win32' && pid) {
    // Kill the launcher and its native Codex child together, without invoking a shell.
    await new Promise<void>((resolve) => {
      execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => {
        resolve();
      });
    });
    await closed;
    return;
  }
  child.stdin.end();
  child.kill('SIGTERM');
  const timer = setTimeout(killGroup, graceMs);
  try {
    await closed;
    // The launcher can exit before a child with detached stdio. The process group belongs only to us.
    killGroup();
  } finally {
    clearTimeout(timer);
  }
}
