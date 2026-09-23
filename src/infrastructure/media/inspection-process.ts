import { AppFault } from '../../domain/diagnostics';
import { spawn } from 'node:child_process';
import { terminateProcess } from './runtime';

/** A cancelled/failed operation waits for its process to close before removing temporary files. */
export async function inspectionProcess(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
  timeoutMs = 60_000,
  maxBytes = 1_000_000,
): Promise<Buffer> {
  signal.throwIfAborted();
  const child = spawn(command, args, {
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let failure: unknown;
  const abort = (): void => {
    failure = signal.reason;
    void terminateProcess(child);
  };
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => {
    failure = new AppFault({ id: 'mediaInspectionTimedOut' });
    void terminateProcess(child);
  }, timeoutMs);
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) {
          failure = new AppFault({ id: 'mediaInspectionOutputLimit' });
          void terminateProcess(child);
        } else chunks.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-4_000);
      });
      child.once('error', (error) => {
        failure = error;
      });
      child.once('close', (code) => {
        if (failure)
          reject(failure instanceof Error ? failure : new AppFault({ id: 'mediaInspectionCancelled' }));
        else if (code !== 0)
          reject(stderr ? new Error(stderr) : new AppFault({ id: 'mediaInspectionFailed' }));
        else resolve(Buffer.concat(chunks));
      });
      if (signal.aborted) abort();
    });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    await terminateProcess(child);
  }
}
