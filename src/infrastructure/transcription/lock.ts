import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { z } from 'zod';
import { AppFault } from '../../domain/diagnostics';

const ownerSchema = z.object({ pid: z.number().int().positive(), token: z.string() });

/** Serializes app and CLI setup against the same private environment/cache. */
export async function withRuntimeLock<T>(
  directory: string,
  signal: AbortSignal,
  work: () => Promise<T>,
  timeoutMs = 30_000,
): Promise<T> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'runtime.lock');
  const owner = JSON.stringify({ pid: process.pid, token: randomUUID() });
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    signal.throwIfAborted();
    if (Date.now() >= deadline) throw new AppFault({ id: 'appTranscriptionSetupFailed' });
    try {
      const handle = await open(path, 'wx', 0o600);
      try {
        await handle.writeFile(owner);
        await handle.sync();
      } finally {
        await handle.close();
      }
      break;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
      let saved: string;
      try {
        saved = await readFile(path, 'utf8');
      } catch {
        continue;
      }
      let record: unknown;
      try {
        record = JSON.parse(saved) as unknown;
      } catch {
        record = null;
      }
      const parsed = ownerSchema.safeParse(record);
      if (parsed.success) {
        try {
          process.kill(parsed.data.pid, 0);
        } catch (cause) {
          if (
            cause instanceof Error &&
            'code' in cause &&
            cause.code === 'ESRCH' &&
            (await readFile(path, 'utf8')) === saved
          ) {
            await rm(path);
            continue;
          }
        }
      }
      // An empty file may belong to the process that just acquired exclusive creation.
      await setTimeout(250, undefined, { signal });
    }
  }
  try {
    return await work();
  } finally {
    await release(path, owner);
  }
}

async function release(path: string, owner: string): Promise<void> {
  if ((await readFile(path, 'utf8')) !== owner) throw new AppFault({ id: 'appTranscriptionSetupFailed' });
  await rm(path);
}
