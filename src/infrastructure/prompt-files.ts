import { realpath } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import type { PromptFilesPort } from '../domain/chat-prompt';
import { AppFault } from '../domain/diagnostics';
import { readFilePreview } from './file-preview';

const textExtensions = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.yml',
  '.yaml',
  '.json',
  '.toml',
  '.html',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.css',
  '.xml',
  '.csv',
  '.srt',
  '.vtt',
  '.log',
  '.svg',
]);

export class NativePromptFiles implements PromptFilesPort {
  directory = dirname;
  resolve(reference: string, directory: string): string | null {
    if (!reference || reference.length > 4096 || /[\0\n\r]/u.test(reference)) return null;
    if (/^[a-z]+:/iu.test(reference) && !/^[A-Za-z]:[/\\]/u.test(reference)) return null;
    return resolve(directory, reference);
  }
  readable(path: string): boolean {
    return textExtensions.has(extname(path).toLowerCase());
  }
  authorized(path: string, roots: string[], exactPaths: string[]): boolean {
    const candidate = resolve(path);
    return (
      exactPaths.some((value) => resolve(value) === candidate) ||
      roots.some((root) => {
        const child = relative(resolve(root), candidate);
        return Boolean(
          child &&
          child !== '..' &&
          !child.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) &&
          !isAbsolute(child),
        );
      })
    );
  }
  async read(path: string, roots: string[], exactPaths: string[]): Promise<string> {
    const canonical = await this.authorize(path, roots, exactPaths);
    if (!this.readable(canonical)) throw new AppFault({ id: 'desktopPreviewInvalid' });
    const document = await readFilePreview(canonical, '');
    if (document.kind !== 'text') throw new AppFault({ id: 'desktopPreviewInvalid' });
    if ((await this.authorize(path, roots, exactPaths)) !== canonical)
      throw new AppFault({ id: 'desktopSelectedLocationChanged' });
    return document.text;
  }
  private async authorize(path: string, roots: string[], exactPaths: string[]): Promise<string> {
    const candidate = resolve(path);
    const canonical = await realpath(candidate);
    // Reject symlinks, including intermediate components, rather than widening the inspected scope.
    if (candidate !== canonical) throw new AppFault({ id: 'desktopSelectedLocationChanged' });
    if (exactPaths.some((value) => resolve(value) === candidate)) return canonical;
    for (const root of roots) {
      const canonicalRoot = await realpath(root);
      if (canonicalRoot !== resolve(root)) continue;
      const child = relative(canonicalRoot, canonical);
      if (
        child &&
        child !== '..' &&
        !child.startsWith('..' + (process.platform === 'win32' ? '\\' : '/')) &&
        !isAbsolute(child)
      )
        return canonical;
    }
    throw new AppFault({ id: 'untrustedRequest' });
  }
}
