import { lstat, readFile, readdir } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Asset } from '../../domain/models';
import { containedPath, isWithin } from './files';
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
const excludedDirectories = new Set(['.git', 'node_modules', 'output', '.vandashi-recovery']);
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
    .replace(/\\+\//gu, '/')
    .replace(/\\+/gu, '/')
    .normalize('NFC')
    .toLowerCase();
}

function sourceForms(value: string): string[] {
  // A native separator followed by x64/u1234 is a literal filename, not necessarily an escape.
  // Retain that form and consume serialized backslash pairs before interpreting character escapes.
  const unescaped = value.replace(
    /\\(?:([\\/])|u([0-9a-f]{4})|x([0-9a-f]{2}))/giu,
    (_escape, literal: string | undefined, unicode: string | undefined, hex: string | undefined) =>
      literal ?? String.fromCharCode(Number.parseInt(unicode ?? hex ?? '', 16)),
  );
  return [...new Set([decoded(value), decoded(unescaped)])];
}

function referencesParentAsset(content: string[], project: string, source: string, asset: Asset): boolean {
  // Child repositories own their video_assets directory. A basename alone cannot identify a parent asset.
  const candidates = [
    asset.path,
    pathToFileURL(asset.path).href,
    relative(project, asset.path),
    relative(dirname(source), asset.path),
  ];
  return candidates.some((candidate) => {
    const target = decoded(candidate).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const reference = new RegExp(`(?:^|[\\s"'\u0060(=<>])${target}(?=$|[\\s"'\u0060)<>?#])`, 'u');
    return content.some((form) => reference.test(form));
  });
}

/** Conservative references include scripts and native Studio state; uncertain large sources block deletion. */
export async function assetReferences(project: string, asset: Asset): Promise<string[]> {
  const target = decoded(basename(asset.path));
  const references: string[] = [];
  let count = 0;
  const visit = async (directory: string, owner = project): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name.startsWith('.vandashi-write-')) continue;
      if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
      const path = await containedPath(project, join(directory, entry.name));
      if (entry.isDirectory()) {
        await visit(path, basename(directory) === 'clips' ? path : owner);
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
      const content = sourceForms(await readFile(path, 'utf8'));
      const referenced = isWithin(join(project, 'clips'), path)
        ? referencesParentAsset(content, owner, path, asset)
        : content.some((form) => form.includes(target));
      if (referenced) references.push(relative(project, path).split('\\').join('/'));
    }
  };
  await visit(project);
  return references.sort();
}
