import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import type { z } from 'zod';
import type { GitPort, RecoveryListener } from '../../domain/storage';
import { atomicWrite, containedPath, errorCode } from './files';
import { storageFault } from './validation';

export async function writeYaml(root: string, name: string, value: unknown): Promise<void> {
  await atomicWrite(await containedPath(root, name), stringify(value));
}

export async function readYaml<T>(
  root: string,
  name: string,
  schema: z.ZodType<T>,
  git: GitPort,
  onRecovery?: RecoveryListener,
): Promise<T> {
  const path = await containedPath(root, name);
  let original: string | null = null;
  try {
    original = await readFile(path, 'utf8');
    return schema.parse(parse(original));
  } catch (failure) {
    if (failure instanceof Error && 'syscall' in failure && errorCode(failure) !== 'ENOENT') throw failure;
    for (const revision of await git.revisions(root, name)) {
      let candidate: T;
      try {
        candidate = schema.parse(parse(await git.readAt(root, revision, name)));
      } catch {
        continue;
      }
      let backupPath: string | null = null;
      if (original !== null) {
        backupPath = await containedPath(
          root,
          join('.vandashi-recovery', `${name.replaceAll('/', '_')}.${String(Date.now())}.invalid`),
        );
        await atomicWrite(backupPath, original);
      }
      await writeYaml(root, name, candidate);
      try {
        onRecovery?.({ path, backupPath, revision });
      } catch {
        /* Recovery remains valid if its observer is unavailable. */
      }
      return candidate;
    }
    throw storageFault({ id: 'storageRecoveryFailed', params: { name } }, failure);
  }
}
