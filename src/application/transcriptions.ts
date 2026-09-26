import { AppFault } from '../domain/diagnostics';
import type { AppEvent, Asset, AssetDraft, Scope } from '../domain/models';
import type { GitPort, StoragePort } from '../domain/storage';
import type {
  AssetAnalysis,
  AssetCategoryChoice,
  AudioCategory,
  TranscriptionModel,
  TranscriptionPort,
  TranscriptionPreparation,
  TranscriptionProgress,
} from '../domain/transcription';

/** The caller owns the operation lease, including persistence and recovery after this service. */
export class Transcriptions {
  private readonly inspected = new Map<string, AssetAnalysis>();
  constructor(
    private readonly store: StoragePort,
    private readonly git: GitPort,
    private readonly runtime: TranscriptionPort,
    private readonly emit: (event: AppEvent) => void,
  ) {}
  get guidePath(): string | undefined {
    return this.runtime.guidePath;
  }
  private progress(progress: TranscriptionProgress, active = true): void {
    this.emit({ type: 'transcription', active, progress });
  }
  private async work<T>(task: () => Promise<T>): Promise<T> {
    this.progress({ phase: 'checking' });
    try {
      return await task();
    } finally {
      this.progress({ phase: 'checking' }, false);
    }
  }
  prepareModel(model: TranscriptionModel): Promise<void> {
    return this.work(() =>
      this.runtime.prepare(model, (progress) => {
        this.progress(progress);
      }),
    );
  }
  async prepare(input: {
    scope: Scope | null;
    categories?: AssetCategoryChoice[];
  }): Promise<TranscriptionPreparation> {
    return this.work(async () => {
      const assets = await this.store.transcriptionAssets(
        input.scope ? { kind: 'scope', scope: input.scope } : { kind: 'shared' },
      );
      const choices = new Map<string, AssetCategoryChoice>();
      for (const choice of input.categories ?? []) {
        const asset = assets.find((entry) => entry.id === choice.assetId);
        if (!asset || asset.kind !== 'audio' || asset.revision !== choice.revision || choices.has(asset.id))
          throw new AppFault({ id: 'appTranscriptionChoiceStale' });
        choices.set(asset.id, choice);
      }
      const unclassified = input.scope?.videoId
        ? assets.filter((asset) => asset.kind === 'audio' && !asset.analysis && !choices.has(asset.id))
        : [];
      // Return all decisions before downloads or file writes. A later request revalidates exact revisions.
      if (unclassified.length)
        return {
          status: 'needs-classification',
          assets: unclassified.map(({ id, title, relativePath, revision }) => ({
            id,
            title,
            relativePath,
            revision,
          })),
        };
      const state = await this.store.getState();
      const repositories = input.scope
        ? [
            await (input.scope.videoId
              ? this.store.projectPath(input.scope)
              : this.store.assetDirectory(input.scope)),
          ]
        : await Promise.all(
            state.brands.map((brand) =>
              this.store.assetDirectory({ brandId: brand.id, videoId: null, clipId: null }),
            ),
          );
      let failure: Error | undefined;
      try {
        await this.runtime.prepare(state.settings.transcriptionModel, (progress) => {
          this.progress(progress);
        });
        await this.repair(assets, choices);
      } catch (error) {
        failure =
          error instanceof Error ? error : new AppFault({ id: 'appTranscriptionFailed' }, String(error));
      }
      // Preserve successful metadata and any pre-existing recovery work even when another file fails.
      for (const repository of [...new Set(repositories)]) {
        if ((await this.git.status(repository)).dirty)
          await this.git.commit(
            repository,
            'Prepare asset transcription metadata',
            'Preserve asset categories and source-timed speech evidence for video editing.',
          );
        if ((await this.git.status(repository)).dirty)
          throw new AppFault({ id: 'appRepositorySaveFailed', params: { repository } });
      }
      if (failure) throw failure;
      return { status: 'ready' };
    });
  }
  /** Includes committed agent edits; dirty status alone cannot discover all new media. */
  reconcileRepositories(paths: string[]): Promise<void> {
    return this.work(async () => {
      const assets = await this.store.transcriptionAssets({ kind: 'repositories', paths });
      await this.repair(assets, new Map());
    });
  }
  private async repair(assets: Asset[], choices: Map<string, AssetCategoryChoice>): Promise<void> {
    const model = (await this.store.getState()).settings.transcriptionModel;
    const pending = assets.filter((asset) => !asset.analysis);
    for (const [index, asset] of pending.entries()) {
      if (asset.kind !== 'audio' && asset.kind !== 'video') continue;
      const category = choices.get(asset.id)?.category;
      const progress = (value: TranscriptionProgress) => {
        this.progress({ ...value, file: asset.relativePath, completed: index, total: pending.length });
      };
      progress({ phase: 'checking' });
      const analysis = await this.runtime.analyze(
        { path: asset.path, kind: asset.kind, model, ...(category ? { category } : {}) },
        progress,
      );
      progress({ phase: 'saving' });
      await this.store.saveAssetAnalysis({
        assetPath: asset.path,
        expectedRevision: asset.revision,
        analysis,
      });
    }
  }
  /** Runs before description so the same full-file evidence is used for review and import. */
  analyze(
    input: { path: string; kind: 'audio' | 'video'; category?: AudioCategory },
    signal?: AbortSignal,
  ): Promise<AssetAnalysis> {
    return this.work(async () => {
      const model = (await this.store.getState()).settings.transcriptionModel;
      const analysis = await this.runtime.analyze(
        { ...input, model },
        (progress) => {
          this.progress({ ...progress, file: input.path });
        },
        signal,
      );
      this.inspected.set(input.path, analysis);
      // Retain only a small current review cache; analysis supplied by the renderer is never authority.
      if (this.inspected.size > 32) {
        const first = this.inspected.keys().next().value;
        if (first !== undefined) this.inspected.delete(first);
      }
      return analysis;
    });
  }
  async importDraft(draft: AssetDraft, kind: 'audio' | 'video'): Promise<AssetDraft> {
    if (kind === 'audio' && !draft.audioCategory)
      throw new AppFault({ id: 'appTranscriptionClassificationRequired' });
    const cached = this.inspected.get(draft.sourcePath);
    const analysis =
      cached &&
      draft.sourceHash === cached.sourceHash &&
      (kind !== 'audio' || cached.category === draft.audioCategory)
        ? cached
        : await this.analyze({
            path: draft.sourcePath,
            kind,
            ...(draft.audioCategory ? { category: draft.audioCategory } : {}),
          });
    if (draft.sourceHash && draft.sourceHash !== analysis.sourceHash)
      throw new AppFault({ id: 'appTranscriptionChanged' });
    return { ...draft, kind, sourceHash: analysis.sourceHash, analysis };
  }
}
