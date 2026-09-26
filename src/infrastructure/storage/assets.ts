import { constants } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname, extname, join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Asset, AssetDraft } from '../../domain/models';
import { assetKind } from '../../domain/asset-kind';
export { assetKind } from '../../domain/asset-kind';
import { parseAssetAnalysis, type AssetAnalysis } from '../../domain/transcription';
import { AppFault } from '../../domain/diagnostics';
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
import {
  embedMetadata,
  prepareEmbeddedMetadata,
  readEmbeddedMetadata,
  type AssetMetadata,
  type PreparedMetadata,
} from './embedded-metadata';
import { z } from 'zod';
import { storageFault } from './validation';
import { appMessageEnglish } from '../../domain/messages';
import type { WriteReceipt } from './files';
import { analysisTags, checkedAssetPath } from './asset-metadata-fields';

export const metadataSuffix = '.vandashi.json';

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
    let sidecarHash: string | null = null;
    try {
      const content = await readFile(await checkedAssetPath(root, path + metadataSuffix));
      sidecarHash = hashText(content.toString('base64'));
      metadata = metadataSchema.parse(JSON.parse(content.toString('utf8')));
    } catch (error) {
      if (errorCode(error) !== 'ENOENT')
        throw storageFault({ id: 'storageMetadataInvalid', params: { name: basename(path) } }, error);
      const cached = this.embedded.get(path);
      const embedded = cached?.stamp === stamp ? cached.metadata : await readEmbeddedMetadata(path);
      this.embedded.set(path, { stamp, metadata: embedded });
      metadata = { ...metadata, ...embedded, title: embedded.title || metadata.title };
    }
    const relativePath = relative(root, path).split('\\').join('/');
    const analysis =
      ['audio', 'video'].includes(assetKind(path)) &&
      metadata.analysisContentHash === hash &&
      metadata.contentHash === hash
        ? parseAssetAnalysis(metadata.analysis)
        : null;
    return {
      id: hashText(relativePath).slice(0, 24),
      path,
      relativePath,
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      hash: metadata.contentHash === hash ? metadata.hash : hash,
      revision: hashText(JSON.stringify([hash, sidecarHash])),
      size: info.size,
      kind: assetKind(path),
      shared: shared || relativePath.startsWith('_shared/'),
      mediaUrl: this.mediaUrl(path),
      ...(analysis ? { analysis } : {}),
    };
  }

  async get(root: string, path: string, shared: boolean): Promise<Asset> {
    return this.read(root, await checkedAssetPath(root, path), shared);
  }

  /** Sidecar-only: callers retain their existing operation lease and own the final Git commit. */
  async saveAnalysis(
    root: string,
    input: { assetPath: string; expectedRevision: string; analysis: AssetAnalysis },
    shared: boolean,
  ): Promise<Asset> {
    return this.writeAnalysis(root, input, shared);
  }

  private async writeAnalysis(
    root: string,
    input: { assetPath: string; expectedRevision: string; analysis: AssetAnalysis },
    shared: boolean,
    importedSourceHash?: string,
  ): Promise<Asset> {
    const asset = await this.get(root, input.assetPath, shared);
    if (!shared && asset.shared) throw new AppFault({ id: 'storageSharedEditRequired' });
    this.assertRevision(asset, input.expectedRevision);
    const analysis = parseAssetAnalysis(input.analysis);
    if (!analysis || !['audio', 'video'].includes(asset.kind))
      throw new AppFault({ id: 'storageMetadataInvalid', params: { name: basename(asset.path) } });
    const contentHash = await hashFile(asset.path);
    const verifiedImport = importedSourceHash === analysis.sourceHash && asset.hash === importedSourceHash;
    if (analysis.sourceHash !== contentHash && !verifiedImport)
      throw new AppFault({ id: 'storageAssetInspectionStale' });
    const path = await containedPath(root, asset.path + metadataSuffix);
    const prior = (await exists(path))
      ? metadataSchema.parse(JSON.parse(await readFile(path, 'utf8')))
      : {
          title: asset.title,
          description: asset.description,
          tags: asset.tags,
          hash: asset.hash,
          metadataStorage: 'sidecar' as const,
        };
    const temporary = join(dirname(path), `.vandashi-analysis-${randomUUID()}.json`);
    try {
      await atomicWrite(
        temporary,
        JSON.stringify(
          {
            ...prior,
            hash: asset.hash,
            tags: analysisTags(prior.tags, analysis),
            contentHash,
            analysisContentHash: contentHash,
            analysis,
          },
          null,
          2,
        ),
      );
      this.assertRevision(await this.get(root, asset.path, shared), input.expectedRevision);
      if (await exists(path)) await checkedAssetPath(root, path);
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
    const saved = await this.get(root, asset.path, shared);
    if (!saved.analysis) throw new AppFault({ id: 'storageAssetInspectionStale' });
    return saved;
  }

  async list(root: string, shared: boolean): Promise<Asset[]> {
    const paths = (await walkFiles(root)).filter((path) => !path.endsWith(metadataSuffix));
    const assets: Asset[] = [];
    for (const path of paths) assets.push(await this.read(root, path, shared));
    return assets;
  }

  async import(root: string, draft: AssetDraft, shared: boolean): Promise<Asset> {
    const source = await lstat(draft.sourcePath);
    if (!source.isFile() || source.isSymbolicLink()) throw new AppFault({ id: 'storageMediaFileRequired' });
    if (assetKind(draft.sourcePath) === 'other') throw new AppFault({ id: 'storageMediaUnsupported' });
    const hash = await hashFile(draft.sourcePath);
    if (draft.sourceHash !== undefined && draft.sourceHash !== hash)
      throw new AppFault({ id: 'storageAssetInspectionStale' });
    const analysis = draft.analysis === undefined ? undefined : parseAssetAnalysis(draft.analysis);
    if (
      analysis === null ||
      (analysis &&
        (analysis.sourceHash !== hash || !['audio', 'video'].includes(assetKind(draft.sourcePath))))
    )
      throw new AppFault({ id: 'storageAssetInspectionStale' });
    const duplicate = (await this.list(root, shared)).find(
      (asset) =>
        (shared || !asset.shared) && (asset.hash === hash || this.cache.get(asset.path)?.hash === hash),
    );
    if (duplicate)
      return analysis
        ? this.writeAnalysis(
            root,
            { assetPath: duplicate.path, expectedRevision: duplicate.revision, analysis },
            shared,
            hash,
          )
        : duplicate;
    const sourceName = safeName(basename(draft.sourcePath));
    let path = await containedPath(root, sourceName);
    if (await exists(path))
      path = await containedPath(
        root,
        `${basename(sourceName, extname(sourceName))}-${hash.slice(0, 10)}${extname(sourceName)}`,
      );
    await copyFile(draft.sourcePath, path, constants.COPYFILE_EXCL);
    try {
      if ((await hashFile(path)) !== hash) throw new AppFault({ id: 'storageImportSourceChanged' });
      const metadata = {
        title: draft.title.trim() || basename(sourceName, extname(sourceName)),
        description: draft.description.trim(),
        tags: analysisTags(draft.tags, analysis),
      };
      const embedding = await embedMetadata(path, metadata);
      const contentHash = await hashFile(path);
      await atomicWrite(
        path + metadataSuffix,
        JSON.stringify(
          {
            ...metadata,
            hash,
            contentHash,
            ...embedding,
            ...(analysis ? { analysis, analysisContentHash: contentHash } : {}),
          },
          null,
          2,
        ),
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
    metadata: { title: string; description: string; tags: string[]; expectedRevision: string },
    shared: boolean,
    receipt?: WriteReceipt,
  ): Promise<Asset> {
    const asset = (await this.list(root, shared)).find((item) => item.id === assetId);
    if (!asset) throw new AppFault({ id: 'storageAssetMissing' });
    if (!shared && asset.shared) throw new AppFault({ id: 'storageSharedEditRequired' });
    if (!metadata.title.trim()) throw new AppFault({ id: 'storageAssetTitleRequired' });
    this.assertRevision(asset, metadata.expectedRevision);
    const path = await containedPath(root, asset.path + metadataSuffix);
    const fields = {
      title: metadata.title.trim(),
      description: metadata.description,
      tags: analysisTags(metadata.tags, asset.analysis),
    };
    const prior = (await exists(path))
      ? metadataSchema.parse(JSON.parse(await readFile(path, 'utf8')))
      : null;
    const preserveBytes = prior?.preserveBytes === true;
    const prepared: PreparedMetadata = preserveBytes
      ? {
          result: {
            metadataStorage: 'sidecar',
            embeddingWarning: appMessageEnglish({ id: 'storageFinishedBytesPreserved' }),
            embeddingDiagnostic: { kind: 'app', message: { id: 'storageFinishedBytesPreserved' } },
          },
          path: null,
          dispose: () => Promise.resolve(),
        }
      : await prepareEmbeddedMetadata(asset.path, fields);
    const stagedSidecar = join(dirname(path), `.vandashi-metadata-${randomUUID()}.json`);
    try {
      const contentHash = await hashFile(prepared.path ?? asset.path);
      await atomicWrite(
        stagedSidecar,
        JSON.stringify(
          {
            ...fields,
            hash: asset.hash,
            contentHash,
            ...prepared.result,
            ...(preserveBytes ? { preserveBytes } : {}),
            ...(asset.analysis ? { analysis: asset.analysis, analysisContentHash: contentHash } : {}),
          },
          null,
          2,
        ),
        (_temporary, hash) => receipt?.(path, hash),
      );
      this.assertRevision(await this.read(root, asset.path, shared), metadata.expectedRevision);
      if (prepared.path) {
        receipt?.(asset.path, contentHash);
        await rename(prepared.path, await containedPath(root, asset.path));
      }
      await rename(stagedSidecar, await containedPath(root, path));
    } finally {
      try {
        await prepared.dispose();
      } finally {
        await rm(stagedSidecar, { force: true });
      }
    }
    return this.read(root, asset.path, shared);
  }

  private assertRevision(asset: Asset, expected: string): void {
    if (asset.revision !== expected) throw new AppFault({ id: 'assetMetadataConflict' });
  }

  async delete(
    root: string,
    assetId: string,
    shared: boolean,
    expectedRevision: string,
    receipt?: WriteReceipt,
  ): Promise<void> {
    const asset = (await this.list(root, shared)).find((item) => item.id === assetId);
    if (!asset) throw new AppFault({ id: 'storageAssetMissing' });
    if (!shared && asset.shared) throw new AppFault({ id: 'storageSharedRemoveRequired' });
    if (asset.revision !== expectedRevision) throw new AppFault({ id: 'storageAssetDeleteConflict' });
    const path = await containedPath(root, asset.path);
    const sidecar = await containedPath(root, asset.path + metadataSuffix);
    receipt?.(path, null);
    await rm(path);
    receipt?.(sidecar, null);
    await rm(sidecar, { force: true });
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
      if (errorCode(error) !== 'ENOENT') throw storageFault({ id: 'storageSharedManifestInvalid' }, error);
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
        throw new AppFault({ id: 'storageSharedCopyConflict', params: { path: key } });
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
