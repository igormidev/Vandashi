import { lstat, readFile, readdir } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';
import type { Asset } from '../../domain/models';
import { containedPath } from './files';
import { AppFault } from '../../domain/diagnostics';

const textExtensions = new Set([
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.json',
  '.md',
  '.yaml',
  '.yml',
  '.svg',
]);
const excludedDirectories = new Set(['.git', 'node_modules', 'output', 'clips', '.vandashi-recovery']);
const excludedFiles = new Set(['video_packaging.yml', 'launch.yml', '.vandashi-shared.json']);

function decoded(value: string): string {
  return value
    .replace(/(?:%[0-9a-f]{2})+/giu, (sequence) => {
      try {
        return decodeURIComponent(sequence);
      } catch {
        return sequence;
      }
    })
    .replace(
      /&#(?:x([0-9a-f]+)|([0-9]+));/giu,
      (entity: string, hex: string | undefined, decimal: string | undefined) => {
        const code = Number.parseInt(hex ?? decimal ?? '', hex ? 16 : 10);
        return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
      },
    )
    .replaceAll('&amp;', '&')
    .normalize('NFC')
    .toLowerCase();
}

/** Conservative references include scripts and native Studio state; uncertain large sources block deletion. */
export async function assetReferences(project: string, asset: Asset): Promise<string[]> {
  const target = decoded(basename(asset.path));
  const references: string[] = [];
  let count = 0;
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.vandashi-write-')) continue;
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
      const path = await containedPath(project, join(directory, entry.name));
      if (entry.isDirectory()) {
        await visit(path);
        continue;
      }
      if (
        !entry.isFile() ||
        path === asset.path ||
        excludedFiles.has(entry.name) ||
        entry.name.endsWith('.vandashi.json') ||
        !textExtensions.has(extname(entry.name).toLowerCase())
      )
        continue;
      count += 1;
      if (count > 5_000 || (await lstat(path)).size > 10 * 1024 * 1024)
        throw new AppFault({ id: 'storageReferenceCheckFailed', params: { path: relative(project, path) } });
      if (decoded(await readFile(path, 'utf8')).includes(target))
        references.push(relative(project, path).split('\\').join('/'));
    }
  };
  await visit(project);
  return references.sort();
}
