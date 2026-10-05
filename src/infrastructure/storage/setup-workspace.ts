import { mkdir, realpath } from 'node:fs/promises';
import { containedPath } from './files';

export async function setupWorkspace(directory: string): Promise<string> {
  const root = await realpath(directory);
  const path = await containedPath(root, 'setup');
  await mkdir(path, { recursive: true });
  return containedPath(root, 'setup');
}
