import { AppFault } from '../../domain/diagnostics';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, realpath } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { emptyPackaging, tasteFiles } from '../../domain/defaults';
import { initialScript } from '../../domain/templates';
import type { Brand, Clip, Scope, VideoSummary } from '../../domain/models';
import type {
  GitPort,
  ImportedClip,
  ImportedVideo,
  NewClip,
  ProjectPreparation,
  RecoveryListener,
} from '../../domain/storage';
import { ImportedMediaHashes, initializeImportedVideo } from './finished-video';
import { initializeImportedClip } from './imported-clip';
import type { AssetStore } from './assets';
import { atomicWrite, containedPath, exists, safeName } from './files';
import type { Registry } from './registry';
import { brandConfigSchema, packagingSchema, videoRecordSchema, type VideoRecord } from './schemas';
import { readYaml, writeYaml } from './yaml-files';
import { createBrand } from './brand-creation';
import { initializeComposition } from './project-creation';

const ignore =
  '.vandashi-recovery/\n.vandashi-write-*\nnode_modules/\noutput/\n.thumbnails/\nrenders/\n.cache/\n.transcode-cache/\n.waveform-cache/\n.DS_Store\n';

export class ProjectStore {
  private readonly importedMedia = new ImportedMediaHashes();
  constructor(
    readonly registry: Registry,
    readonly git: GitPort,
    readonly assets: AssetStore,
    private readonly onRecovery?: RecoveryListener,
  ) {}

  async brand(id: string): Promise<Brand> {
    const summary = (await this.registry.state()).brands.find((item) => item.id === id);
    if (!summary) throw new AppFault({ id: 'storageBrandMissing' });
    const path = await realpath(summary.path);
    const identity = await containedPath(path, 'brand_identity');
    const config = await readYaml(identity, 'brand_config.yml', brandConfigSchema, this.git, this.onRecovery);
    return { ...summary, name: config.name, path, config };
  }

  async createBrand(input: { parentPath: string; name: string }): Promise<Brand> {
    const name = safeName(input.name, 3);
    const parent = await realpath(input.parentPath);
    const path = await containedPath(parent, name);
    return createBrand(this.registry, this.git, { parent, path, name, ignore });
  }

  private async records(directory: string): Promise<{ path: string; record: VideoRecord }[]> {
    const result: { path: string; record: VideoRecord }[] = [];
    if (!(await exists(directory))) return result;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name.startsWith('.')) continue;
      const path = await containedPath(directory, entry.name);
      if (!(await exists(join(path, '.vandashi.yml')))) continue;
      result.push({
        path,
        record: await readYaml(path, '.vandashi.yml', videoRecordSchema, this.git, this.onRecovery),
      });
    }
    return result;
  }

  private async summary(path: string, record: VideoRecord): Promise<VideoSummary> {
    let renderedPath = record.renderedPath;
    if (renderedPath !== null) renderedPath = await containedPath(path, renderedPath);
    if (
      renderedPath !== null &&
      (!(await exists(renderedPath)) ||
        record.renderedRevision !==
          (record.origin === 'imported'
            ? await this.importedMedia.revision(renderedPath)
            : await this.git.contentRevision(path)) ||
        (record.origin !== 'imported' &&
          (await this.git.status(path)).paths.some(
            (file) => !['.vandashi.yml', 'video_packaging.yml', 'launch.yml'].includes(file),
          )))
    )
      renderedPath = null;
    return {
      id: record.id,
      brandId: record.brandId,
      name: record.name,
      path,
      ratio: record.ratio,
      origin: record.origin,
      updatedAt: record.updatedAt,
      renderedPath,
      packaging: await readYaml(path, 'video_packaging.yml', packagingSchema, this.git, this.onRecovery),
    };
  }

  async listVideos(brandId: string): Promise<VideoSummary[]> {
    const brand = await this.brand(brandId);
    const records = await this.records(await containedPath(brand.path, 'videos'));
    const videos: VideoSummary[] = [];
    for (const { path, record } of records) {
      if (record.brandId !== brandId || record.parentVideoId !== undefined)
        throw new AppFault({ id: 'storageVideoBrandInvalid' });
      videos.push(await this.summary(path, record));
    }
    return videos.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async video(scope: Scope): Promise<VideoSummary | null> {
    if (scope.videoId === null) {
      if (scope.clipId !== null) throw new AppFault({ id: 'storageClipParentRequired' });
      return null;
    }
    const parent = (await this.listVideos(scope.brandId)).find((item) => item.id === scope.videoId);
    if (!parent) throw new AppFault({ id: 'storageVideoMissing' });
    if (scope.clipId === null) return parent;
    const clip = (await this.clips(parent)).find((item) => item.id === scope.clipId);
    if (!clip) throw new AppFault({ id: 'storageClipMissing' });
    return clip;
  }

  async repositories(scope: Scope): Promise<string[]> {
    const brand = await this.brand(scope.brandId);
    const paths = [
      await containedPath(brand.path, 'brand_identity'),
      await containedPath(brand.path, 'shared_assets'),
    ];
    const parent = await this.video({ ...scope, clipId: null });
    if (parent) paths.push(parent.path);
    if (scope.clipId !== null) {
      const clip = await this.video(scope);
      if (clip) paths.push(clip.path);
    }
    return paths;
  }

  async clips(video: VideoSummary): Promise<Clip[]> {
    const clips: Clip[] = [];
    for (const { path, record } of await this.records(await containedPath(video.path, 'clips'))) {
      if (
        record.parentVideoId !== video.id ||
        record.brandId !== video.brandId ||
        record.start === undefined ||
        record.end === undefined
      ) {
        throw new AppFault({ id: 'storageClipParentInvalid' });
      }
      clips.push({
        ...(await this.summary(path, record)),
        parentVideoId: video.id,
        start: record.start,
        end: record.end,
      });
    }
    return clips;
  }

  private async initialize(path: string, record: VideoRecord, sharedRoot: string): Promise<void> {
    for (const folder of ['thumbnails', 'video_assets', 'clips']) await mkdir(join(path, folder));
    await writeYaml(path, '.vandashi.yml', record);
    await writeYaml(path, 'video_packaging.yml', emptyPackaging());
    await writeYaml(path, 'launch.yml', []);
    await atomicWrite(join(path, 'script.md'), initialScript);
    await atomicWrite(join(path, '.gitignore'), `${ignore}clips/\n`);
    await this.assets.syncShared(sharedRoot, join(path, 'video_assets'));
    await this.git.init(path);
    await this.git.commit(
      path,
      `Create ${record.parentVideoId ? 'clip' : 'video'}: ${record.name}`,
      'Initialize packaging, script, asset folders, and release state.',
    );
  }

  async createVideo(
    input: { brandId: string; name: string; ratio: '16:9' | '9:16' },
    prepare?: ProjectPreparation,
  ): Promise<{ scope: Scope; path: string }> {
    const brand = await this.brand(input.brandId);
    const name = safeName(input.name);
    const record: VideoRecord = {
      id: randomUUID(),
      brandId: brand.id,
      name,
      ratio: input.ratio,
      origin: 'composition',
      updatedAt: new Date().toISOString(),
      renderedPath: null,
    };
    const shared = await containedPath(brand.path, 'shared_assets');
    const { path, prepared } = await initializeComposition(
      await containedPath(brand.path, 'videos'),
      record,
      this.git,
      (path) => this.initialize(path, record, shared),
      prepare,
      () => Promise.resolve({ brandId: brand.id, videoId: record.id, clipId: null }),
    );
    return { scope: prepared, path };
  }

  async importVideo(input: ImportedVideo, validateCopy: (path: string) => Promise<void>): Promise<Scope> {
    const brand = await this.brand(input.brandId);
    const name = safeName(input.name, 3);
    if (name.startsWith('.')) throw new AppFault({ id: 'storageProjectNameHidden' });
    const record: VideoRecord = {
      id: randomUUID(),
      brandId: brand.id,
      name,
      ratio: input.ratio,
      origin: 'imported',
      updatedAt: new Date().toISOString(),
      renderedPath: null,
    };
    const shared = await containedPath(brand.path, 'shared_assets');
    await initializeImportedVideo(
      await containedPath(brand.path, 'videos'),
      input,
      record,
      this.git,
      (path) => this.initialize(path, record, shared),
      validateCopy,
    );
    return { brandId: brand.id, videoId: record.id, clipId: null };
  }

  async createClip(input: NewClip, prepare?: ProjectPreparation): Promise<Clip> {
    const parent = await this.video({ ...input.scope, clipId: null });
    if (parent?.ratio !== '16:9') throw new AppFault({ id: 'storageClipLandscapeRequired' });
    if (
      !Number.isFinite(input.start) ||
      !Number.isFinite(input.end) ||
      input.start < 0 ||
      input.end <= input.start
    )
      throw new AppFault({ id: 'storageClipRangeInvalid' });
    const brand = await this.brand(input.scope.brandId);
    const name = safeName(input.name);
    const record: VideoRecord = {
      id: randomUUID(),
      brandId: brand.id,
      name,
      ratio: input.ratio,
      origin: 'composition',
      updatedAt: new Date().toISOString(),
      renderedPath: null,
      parentVideoId: parent.id,
      start: input.start,
      end: input.end,
    };
    const shared = await containedPath(brand.path, 'shared_assets');
    const { path, prepared } = await initializeComposition(
      await containedPath(parent.path, 'clips'),
      record,
      this.git,
      (staging) => this.initialize(staging, record, shared),
      prepare,
      (staging) => this.summary(staging, record),
    );
    return {
      ...prepared,
      path,
      parentVideoId: parent.id,
      start: input.start,
      end: input.end,
    };
  }

  async setRenderedPath(scope: Scope, path: string): Promise<void> {
    const video = await this.video(scope);
    if (!video) throw new AppFault({ id: 'storageRenderVideoRequired' });
    const valid = await containedPath(video.path, path);
    if (!(await exists(valid))) throw new AppFault({ id: 'storageRenderedFileMissing' });
    const record = await readYaml(video.path, '.vandashi.yml', videoRecordSchema, this.git, this.onRecovery);
    await writeYaml(video.path, '.vandashi.yml', {
      ...record,
      renderedPath: relative(video.path, valid).split('\\').join('/'),
      renderedRevision: await this.git.contentRevision(video.path),
      updatedAt: new Date().toISOString(),
    });
  }

  async importClip(input: ImportedClip, validateCopy: (path: string) => Promise<void>): Promise<Clip> {
    const parent = await this.video({ ...input.scope, clipId: null });
    if (parent?.ratio !== '16:9') throw new AppFault({ id: 'storageClipLandscapeRequired' });
    const brand = await this.brand(input.scope.brandId);
    const shared = await containedPath(brand.path, 'shared_assets');
    const { path, record } = await initializeImportedClip(
      parent,
      input,
      this.git,
      (staging, created) => this.initialize(staging, created, shared),
      validateCopy,
    );
    return { ...(await this.summary(path, record)), parentVideoId: parent.id, start: 0, end: input.duration };
  }

  async documents(
    brand: Brand,
    video: VideoSummary | null,
  ): Promise<{ path: string; name: string; content: string; kind: 'taste' | 'script' }[]> {
    const documents: { path: string; name: string; content: string; kind: 'taste' | 'script' }[] = [];
    const identity = await containedPath(brand.path, 'brand_identity');
    for (const name of tasteFiles) {
      const path = await containedPath(identity, name);
      documents.push({ path, name, content: await readFile(path, 'utf8'), kind: 'taste' });
    }
    if (video) {
      const path = await containedPath(video.path, 'script.md');
      documents.push({ path, name: 'script.md', content: await readFile(path, 'utf8'), kind: 'script' });
    }
    return documents;
  }
}
