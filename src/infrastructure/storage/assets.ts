import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Asset, AssetDraft, AssetKind } from '../../domain/models';
import {
  atomicWrite,
  containedPath,
  errorCode,
  exists,
  hashFile,
  hashText,
  safeName,
  walkFiles,
} from './files';
import { metadataSchema } from './schemas';
import { embedMetadata, readEmbeddedMetadata, type AssetMetadata } from './embedded-metadata';
import { z } from 'zod';

export const metadataSuffix = '.vandashi.json';

export function assetKind(path: string): AssetKind {
  const extension = extname(path).toLowerCase();
  if (
    ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.bmp', '.tif', '.tiff'].includes(extension)
  )
    return 'image';
  if (['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'].includes(extension)) return 'video';
  if (['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.aiff'].includes(extension)) return 'audio';
  return 'other';
}

function cleanTags(tags: string[]): string[] {
  return [...new Set(tags.map((tag) => tag.trim().replace(/^#+/u, '')).filter(Boolean))];
}

export class AssetStore {
  private readonly cache = new Map<string, { stamp: string; hash: string }>();
  private readonly embedded = new Map<string, { stamp: string; metadata: AssetMetadata }>();
  constructor(private readonly mediaUrl: (path: string) => string) {}

  private async read(root: string, path: string, shared: boolean): Promise<Asset> {
    const info = await stat(path);
    const stamp = `${String(info.size)}:${String(info.mtimeMs)}:${String(info.ctimeMs)}`;
    const prior = this.cache.get(path);
    const hash = prior?.stamp === stamp ? prior.hash : await hashFile(path);
    this.cache.set(path, { stamp, hash });
    let metadata: z.infer<typeof metadataSchema> = {
      title: basename(path, extname(path)),
      description: '',
      tags: [],
      hash,
    };
    try {
      metadata = metadataSchema.parse(
        JSON.parse(await readFile(await containedPath(root, path + metadataSuffix), 'utf8')),
      );
    } catch (error) {
      if (errorCode(error) !== 'ENOENT')
        throw new Error(`The metadata for ${basename(path)} is invalid.`, { cause: error });
      const cached = this.embedded.get(path);
      const embedded = cached?.stamp === stamp ? cached.metadata : await readEmbeddedMetadata(path);
      this.embedded.set(path, { stamp, metadata: embedded });
      metadata = { ...metadata, ...embedded, title: embedded.title || metadata.title };
    }
    const relativePath = relative(root, path).split('\\').join('/');
    return {
      id: hashText(relativePath).slice(0, 24),
      path,
      relativePath,
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      hash: metadata.contentHash === hash ? metadata.hash : hash,
      size: info.size,
      kind: assetKind(path),
      shared: shared || relativePath.startsWith('_shared/'),
      mediaUrl: this.mediaUrl(path),
    };
  }

  async list(root: string, shared: boolean): Promise<Asset[]> {
    const paths = (await walkFiles(root)).filter((path) => !path.endsWith(metadataSuffix));
    const assets: Asset[] = [];
    for (const path of paths) assets.push(await this.read(root, path, shared));
    return assets;
  }

  async import(root: string, draft: AssetDraft, shared: boolean): Promise<Asset> {
    const source = await lstat(draft.sourcePath);
    if (!source.isFile() || source.isSymbolicLink())
      throw new Error('Choose a regular media file to import.');
    if (assetKind(draft.sourcePath) === 'other') throw new Error('This media file format is not supported.');
    const hash = await hashFile(draft.sourcePath);
    const duplicate = (await this.list(root, shared)).find((asset) => asset.hash === hash);
    if (duplicate) return duplicate;
    const sourceName = safeName(basename(draft.sourcePath));
    let path = await containedPath(root, sourceName);
    if (await exists(path))
      path = await containedPath(
        root,
        `${basename(sourceName, extname(sourceName))}-${hash.slice(0, 10)}${extname(sourceName)}`,
      );
    await copyFile(draft.sourcePath, path, constants.COPYFILE_EXCL);
    try {
      if ((await hashFile(path)) !== hash)
        throw new Error('The source file changed while it was being imported.');
      const metadata = {
        title: draft.title.trim() || basename(sourceName, extname(sourceName)),
        description: draft.description.trim(),
        tags: cleanTags(draft.tags),
      };
      const embedding = await embedMetadata(path, metadata);
      await atomicWrite(
        path + metadataSuffix,
        JSON.stringify({ ...metadata, hash, contentHash: await hashFile(path), ...embedding }, null, 2),
      );
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }
    return this.read(root, path, shared);
  }

  async update(
    root: string,
    assetId: string,
    metadata: { title: string; description: string; tags: string[] },
    shared: boolean,
  ): Promise<Asset> {
    const asset = (await this.list(root, shared)).find((item) => item.id === assetId);
    if (!asset) throw new Error('The selected asset no longer exists.');
    if (!shared && asset.shared) throw new Error('Edit this asset in the shared library.');
    if (!metadata.title.trim()) throw new Error('The asset title cannot be empty.');
    const path = await containedPath(root, asset.path + metadataSuffix);
    const fields = {
      title: metadata.title.trim(),
      description: metadata.description,
      tags: cleanTags(metadata.tags),
    };
    const prior = (await exists(path))
      ? metadataSchema.parse(JSON.parse(await readFile(path, 'utf8')))
      : null;
    const preserveBytes = prior?.preserveBytes === true;
    const embedding = preserveBytes
      ? { metadataStorage: 'sidecar' as const, embeddingWarning: 'Finished video bytes are preserved.' }
      : await embedMetadata(asset.path, fields);
    await atomicWrite(
      path,
      JSON.stringify(
        {
          ...fields,
          hash: asset.hash,
          contentHash: await hashFile(asset.path),
          ...embedding,
          ...(preserveBytes ? { preserveBytes } : {}),
        },
        null,
        2,
      ),
    );
    return this.read(root, asset.path, shared);
  }

  async delete(root: string, assetId: string, shared: boolean): Promise<void> {
    const asset = (await this.list(root, shared)).find((item) => item.id === assetId);
    if (!asset) throw new Error('The selected asset no longer exists.');
    if (!shared && asset.shared) throw new Error('Remove this asset from the shared library.');
    await rm(await containedPath(root, asset.path));
    await rm(await containedPath(root, asset.path + metadataSuffix), { force: true });
    this.cache.delete(asset.path);
  }

  async syncShared(sharedRoot: string, videoRoot: string): Promise<void> {
    const target = await containedPath(videoRoot, '_shared');
    await mkdir(target, { recursive: true });
    const manifestPath = await containedPath(videoRoot, '.vandashi-shared.json');
    let manifest: Record<string, string> = {};
    try {
      manifest = z.record(z.string(), z.string()).parse(JSON.parse(await readFile(manifestPath, 'utf8')));
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
    }
    const sourceFiles = await walkFiles(sharedRoot);
    for (const source of sourceFiles) {
      const key = relative(sharedRoot, source).split('\\').join('/');
      const destination = await containedPath(videoRoot, join(target, key));
      const sourceHash = await hashFile(source);
      const destinationHash = (await exists(destination)) ? await hashFile(destination) : null;
      if (destinationHash === sourceHash) {
        manifest[key] = sourceHash;
        continue;
      }
      if (destinationHash !== null && destinationHash !== manifest[key]) {
        throw new Error(
          `The local shared copy of ${key} has changed. Preserve or move that copy before synchronizing the library.`,
        );
      }
      await mkdir(join(destination, '..'), { recursive: true });
      const temporary = `${destination}.vandashi-copy-${randomUUID()}`;
      await copyFile(source, temporary, constants.COPYFILE_EXCL);
      try {
        await rename(temporary, destination);
      } finally {
        await rm(temporary, { force: true });
      }
      manifest[key] = sourceHash;
      await atomicWrite(manifestPath, JSON.stringify(manifest, null, 2));
    }
    await atomicWrite(manifestPath, JSON.stringify(manifest, null, 2));
    // Removed library assets remain as snapshots in old videos so existing timelines do not break.
  }
}
