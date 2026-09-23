import { AppFault } from '../../domain/diagnostics';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, open, readdir, realpath, rename, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export function errorCode(error: unknown): string | undefined {
  return error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : undefined;
}

export function safeName(input: string, minimum = 1): string {
  const name = input.normalize('NFC').trim();
  if (
    name.length < minimum ||
    name.length > 100 ||
    name.startsWith('.') ||
    /[<>:"/\\|?*]/u.test(name) ||
    /\p{Cc}/u.test(name) ||
    /[. ]$/u.test(name) ||
    name === '.' ||
    name === '..' ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/iu.test(name)
  ) {
    throw new AppFault({ id: 'storageInvalidName' });
  }
  return name;
}

export function isWithin(root: string, path: string): boolean {
  const difference = relative(resolve(root), resolve(path));
  return (
    difference === '' ||
    (!difference.startsWith(`..${sep}`) && difference !== '..' && !isAbsolute(difference))
  );
}

/** Validate every existing ancestor; this also rejects an escaping symlink for a new file. */
export async function containedPath(root: string, path: string): Promise<string> {
  const canonicalRoot = await realpath(root);
  const target = resolve(root, path);
  if (!isWithin(canonicalRoot, target)) throw new AppFault({ id: 'storagePathOutside' });
  let current = target;
  for (;;) {
    try {
      const canonical = await realpath(current);
      if (!isWithin(canonicalRoot, canonical)) throw new AppFault({ id: 'storageSymlinkOutside' });
      break;
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
      const parent = dirname(current);
      if (parent === current) throw error;
      current = parent;
    }
  }
  return target;
}

/** Records exact intended bytes before installation, never a later read of the destination. */
export type WriteReceipt = (path: string, hash: string | null) => void;

export async function atomicWrite(
  path: string,
  content: string | Uint8Array,
  receipt?: WriteReceipt,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(dirname(path), `.vandashi-write-${randomUUID()}`);
  const handle = await open(temporary, 'wx', 0o600);
  try {
    try {
      await handle.writeFile(content);
      await handle.sync();
    } finally {
      await handle.close();
    }
    receipt?.(path, createHash('sha256').update(content).digest('hex'));
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw error;
  }
}

export async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export function hashText(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

export async function walkFiles(root: string): Promise<string[]> {
  const result: string[] = [];
  if (!(await exists(root))) return result;
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const path = await containedPath(root, join(directory, entry.name));
      const info = await lstat(path);
      if (info.isSymbolicLink()) continue;
      if (info.isDirectory()) await visit(path);
      else if (info.isFile()) result.push(path);
    }
  };
  await visit(root);
  return result.sort();
}

/** Serializes local registry writes so simultaneous tabs never drop another update. */
export class SerialQueue {
  private tail: Promise<void> = Promise.resolve();
  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
