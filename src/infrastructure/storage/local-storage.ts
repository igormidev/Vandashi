import { AppFault } from '../../domain/diagnostics';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import type {
  AppState,
  Asset,
  AssetDraft,
  Brand,
  ChatSession,
  Clip,
  Launch,
  SaveInput,
  Scope,
  Settings,
  VideoSummary,
  Workspace,
} from '../../domain/models';
import type {
  GitPort,
  ImportedVideo,
  NewClip,
  ProjectPreparation,
  RecoveryListener,
  StoragePort,
} from '../../domain/storage';
import { AssetStore, assetKind } from './assets';
import { saveBrandImage } from './brand-image';
import { assetReferences } from './asset-references';
import { atomicWrite, containedPath, hashText, isWithin, SerialQueue } from './files';
import { ProjectStore } from './projects';
import { Registry } from './registry';
import { brandConfigSchema, launchesSchema, launchSchema, packagingSchema } from './schemas';
import { readYaml, writeYaml } from './yaml-files';
import { parseStorage } from './validation';

export class LocalStorage implements StoragePort {
  private readonly registry: Registry;
  private readonly assets: AssetStore;
  private readonly projects: ProjectStore;
  private readonly writes = new SerialQueue();

  constructor(
    userData: string,
    private readonly git: GitPort,
    mediaUrl: (path: string) => string = (path) => pathToFileURL(path).href,
    private readonly onRecovery?: RecoveryListener,
  ) {
    this.registry = new Registry(userData);
    this.assets = new AssetStore(mediaUrl);
    this.projects = new ProjectStore(this.registry, git, this.assets, onRecovery);
  }

  async getState(): Promise<AppState> {
    const state = await this.registry.state();
    return { ...state, brands: [...state.brands].sort((a, b) => b.lastOpened.localeCompare(a.lastOpened)) };
  }
  settings(settings: Settings): Promise<void> {
    return this.registry.settings(settings);
  }
  createBrand(input: { parentPath: string; name: string }): Promise<Brand> {
    return this.writes.run(() => this.projects.createBrand(input));
  }
  listVideos(brandId: string): Promise<VideoSummary[]> {
    return this.projects.listVideos(brandId);
  }
  async createVideo(
    input: { brandId: string; name: string; ratio: '16:9' | '9:16' },
    prepare?: ProjectPreparation,
  ): Promise<Workspace> {
    return this.writes.run(async () => {
      const created = await this.projects.createVideo(input, prepare);
      try {
        return await this.openWorkspace(created.scope);
      } catch (error) {
        throw new AppFault(
          { id: 'storageCreatedVideoUnavailable', params: { path: created.path } },
          error instanceof Error ? error.message : String(error),
        );
      }
    });
  }
  async importVideo(input: ImportedVideo, validateCopy: (path: string) => Promise<void>): Promise<Workspace> {
    return this.writes.run(async () =>
      this.openWorkspace(await this.projects.importVideo(input, validateCopy)),
    );
  }
  createClip(input: NewClip, prepare?: ProjectPreparation): Promise<Clip> {
    return this.writes.run(() => this.projects.createClip(input, prepare));
  }
  importClip(
    input: Parameters<StoragePort['importClip']>[0],
    validateCopy: (path: string) => Promise<void>,
  ): Promise<Clip> {
    return this.writes.run(() => this.projects.importClip(input, validateCopy));
  }

  async openBrand(id: string): Promise<Workspace> {
    const brand = await this.projects.brand(id);
    await this.registry.update((state) => ({
      ...state,
      lastBrandId: id,
      brands: state.brands.map((item) =>
        item.id === id ? { ...item, name: brand.name, lastOpened: new Date().toISOString() } : item,
      ),
    }));
    return this.openWorkspace({ brandId: id, videoId: null, clipId: null });
  }

  async projectPath(scope: Scope): Promise<string> {
    const video = await this.projects.video(scope);
    return video?.path ?? containedPath((await this.projects.brand(scope.brandId)).path, 'brand_identity');
  }

  async assetDirectory(scope: Scope): Promise<string> {
    const video = await this.projects.video(scope);
    return video
      ? containedPath(video.path, 'video_assets')
      : containedPath((await this.projects.brand(scope.brandId)).path, 'shared_assets');
  }

  async setRenderedPath(scope: Scope, path: string): Promise<void> {
    await this.writes.run(() => this.projects.setRenderedPath(scope, path));
  }

  async repositories(scope: Scope): Promise<string[]> {
    const brand = await this.projects.brand(scope.brandId);
    const paths = [
      await containedPath(brand.path, 'brand_identity'),
      await containedPath(brand.path, 'shared_assets'),
    ];
    const parent = await this.projects.video({ ...scope, clipId: null });
    if (parent) paths.push(parent.path);
    if (scope.clipId !== null) paths.push(await this.projectPath(scope));
    return paths;
  }

  async openWorkspace(scope: Scope): Promise<Workspace> {
    const brand = await this.projects.brand(scope.brandId);
    if ((await this.registry.state()).brands.find((entry) => entry.id === brand.id)?.name !== brand.name)
      await this.registry.update((state) => ({
        ...state,
        brands: state.brands.map((entry) => (entry.id === brand.id ? { ...entry, name: brand.name } : entry)),
      }));
    const video = await this.projects.video(scope);
    const directory = await this.assetDirectory(scope);
    if (video) await this.assets.syncShared(await containedPath(brand.path, 'shared_assets'), directory);
    const documents = await this.projects.documents(brand, video);
    const assets = await this.assets.list(directory, video === null);
    const launches = video
      ? await readYaml(video.path, 'launch.yml', launchesSchema, this.git, this.onRecovery)
      : [];
    const parent = scope.clipId === null ? video : await this.projects.video({ ...scope, clipId: null });
    const clips = parent ? await this.projects.clips(parent) : [];
    const statuses = await Promise.all(
      (await this.repositories(scope)).map(async (repository) => this.git.status(repository)),
    );
    const revision = hashText(
      JSON.stringify({
        config: brand.config,
        packaging: video?.packaging,
        documents,
        source: video ? await this.git.contentRevision(video.path) : null,
      }),
    );
    return {
      scope,
      brand,
      video,
      documents,
      assets,
      clips,
      launches,
      revision,
      dirty: statuses.some((status) => status.dirty),
    };
  }

  private async assertRevision(scope: Scope, revision: string): Promise<Workspace> {
    const workspace = await this.openWorkspace(scope);
    if (workspace.revision !== revision) throw new AppFault({ id: 'storageWorkspaceConflict' });
    return workspace;
  }

  saveWorkspace(input: SaveInput): Promise<Workspace> {
    return this.writes.run(async () => {
      if (!input.commit.title.trim() || !input.commit.body.trim())
        throw new AppFault({ id: 'appCommitRequired' });
      const workspace = await this.assertRevision(input.scope, input.revision);
      const config =
        input.brandConfig === null
          ? null
          : parseStorage(brandConfigSchema, input.brandConfig, { id: 'storageBrandConfigInvalid' });
      const packaging =
        input.packaging === null
          ? null
          : parseStorage(packagingSchema, input.packaging, { id: 'storagePackagingInvalid' });
      if (packaging !== null && !workspace.video) throw new AppFault({ id: 'storagePackagingVideoRequired' });
      const targets = new Set(workspace.documents.map((document) => document.path));
      const updates = input.documents.map((document) => {
        if (!targets.has(document.path)) throw new AppFault({ id: 'storageDocumentReadOnly' });
        return document;
      });
      for (const document of updates)
        await atomicWrite(await this.allowedPath(document.path), document.content);
      if (config !== null) {
        const identity = await containedPath(workspace.brand.path, 'brand_identity');
        config.image = await saveBrandImage(identity, config.image);
        await writeYaml(identity, 'brand_config.yml', config);
      }
      if (packaging !== null && workspace.video)
        await writeYaml(workspace.video.path, 'video_packaging.yml', packaging);
      for (const repository of await this.repositories(input.scope))
        await this.git.commit(repository, input.commit.title, input.commit.body);
      return this.openWorkspace(input.scope);
    });
  }

  async writeScript(input: { scope: Scope; revision: string; content: string }): Promise<void> {
    await this.writes.run(async () => {
      const workspace = await this.assertRevision(input.scope, input.revision);
      if (!workspace.video) throw new AppFault({ id: 'storageScriptVideoRequired' });
      for (const repository of await this.repositories(input.scope)) {
        if ((await this.git.status(repository)).dirty)
          throw new AppFault({ id: 'storageScriptOtherChanges' });
      }
      await atomicWrite(await containedPath(workspace.video.path, 'script.md'), input.content);
      await this.git.stage(workspace.video.path, ['script.md']);
    });
  }

  sessions(scope: Scope): Promise<ChatSession[]> {
    return this.registry.sessions(scope);
  }
  getSession(id: string): Promise<ChatSession> {
    return this.registry.getSession(id);
  }
  saveSession(session: ChatSession): Promise<void> {
    return this.registry.saveSession(session);
  }

  private async assetCommit(scope: Scope, title: string, body: string): Promise<void> {
    const root = scope.videoId === null ? await this.assetDirectory(scope) : await this.projectPath(scope);
    await this.git.commit(root, title, body);
  }

  importAsset(input: { scope: Scope; draft: AssetDraft }): Promise<Asset> {
    return this.writes.run(async () => {
      const asset = await this.assets.import(
        await this.assetDirectory(input.scope),
        input.draft,
        input.scope.videoId === null,
      );
      await this.assetCommit(
        input.scope,
        `Add asset: ${asset.title}`,
        `Import ${asset.relativePath} with its title, description, and tags.`,
      );
      return asset;
    });
  }

  updateAsset(input: {
    scope: Scope;
    assetId: string;
    expectedRevision: string;
    title: string;
    description: string;
    tags: string[];
    commit?: { title: string; body: string };
  }): Promise<Asset> {
    return this.writes.run(async () => {
      if (input.commit && (!input.commit.title.trim() || !input.commit.body.trim()))
        throw new AppFault({ id: 'appCommitRequired' });
      const asset = await this.assets.update(
        await this.assetDirectory(input.scope),
        input.assetId,
        input,
        input.scope.videoId === null,
      );
      await this.assetCommit(
        input.scope,
        input.commit?.title ?? `Update asset: ${asset.title}`,
        input.commit?.body ?? `Update metadata for ${asset.relativePath}.`,
      );
      return asset;
    });
  }

  async deleteAsset(input: { scope: Scope; assetId: string }): Promise<void> {
    await this.writes.run(async () => {
      const root = await this.assetDirectory(input.scope);
      const asset = (await this.assets.list(root, input.scope.videoId === null)).find(
        (item) => item.id === input.assetId,
      );
      if (!asset) throw new AppFault({ id: 'storageAssetMissing' });
      if (input.scope.videoId !== null) {
        const project = await this.projectPath(input.scope);
        const references = await assetReferences(project, asset);
        if (references.length)
          throw new AppFault({ id: 'storageAssetReferenced', params: { paths: references.join(', ') } });
      }
      await this.assets.delete(root, input.assetId, input.scope.videoId === null);
      await this.assetCommit(
        input.scope,
        `Remove asset: ${asset.title}`,
        `Remove ${asset.relativePath} and its metadata.`,
      );
    });
  }

  importThumbnail(input: { scope: Scope; sourcePath: string }): Promise<Workspace> {
    return this.writes.run(async () => {
      const video = await this.projects.video(input.scope);
      if (!video) throw new AppFault({ id: 'storageThumbnailVideoRequired' });
      if (assetKind(input.sourcePath) !== 'image')
        throw new AppFault({ id: 'storageThumbnailImageRequired' });
      const asset = await this.assets.import(
        await containedPath(video.path, 'thumbnails'),
        {
          sourcePath: input.sourcePath,
          title: basename(input.sourcePath),
          description: '',
          tags: ['thumbnail'],
          kind: 'image',
        },
        false,
      );
      const reference = `thumbnails/${asset.relativePath}`;
      if (!video.packaging.thumbnails.includes(reference)) video.packaging.thumbnails.push(reference);
      await writeYaml(video.path, 'video_packaging.yml', video.packaging);
      await this.git.commit(
        video.path,
        'Add thumbnail candidate',
        `Add ${reference} to the ordered thumbnail candidates.`,
      );
      return this.openWorkspace(input.scope);
    });
  }

  async updateLaunch(input: { scope: Scope; launch: Launch }): Promise<void> {
    await this.writes.run(async () => {
      const video = await this.projects.video(input.scope);
      if (!video) throw new AppFault({ id: 'storageLaunchVideoRequired' });
      const launch = parseStorage(launchSchema, input.launch, { id: 'storageLaunchInvalid' });
      const launches = await readYaml(video.path, 'launch.yml', launchesSchema, this.git, this.onRecovery);
      const updated = launches.filter(
        (item) => !(item.platform === launch.platform && item.clipId === launch.clipId),
      );
      updated.push(launch);
      await writeYaml(video.path, 'launch.yml', updated);
      await this.git.commit(
        video.path,
        `Update ${launch.platform} release status`,
        `Set release status to ${launch.status}.`,
      );
    });
  }

  async allowedPath(path: string): Promise<string> {
    for (const brand of (await this.registry.state()).brands) {
      if (isWithin(brand.path, path)) return containedPath(brand.path, path);
    }
    throw new AppFault({ id: 'storageUnregisteredPath' });
  }
}
