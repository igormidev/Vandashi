import { renderSystemPrompt } from '../domain/system-prompts/templates';
import { AppFault } from '../domain/diagnostics';
import { parseAgentJson } from './agent-json';
import type { AgentPort } from '../domain/agent';
import type { MediaPort } from '../domain/media';
import type { AppEvent, AssetDraft, Scope } from '../domain/models';
import type { StoragePort } from '../domain/storage';
import type { OperationGate } from './operation-gate';
import type { Transcriptions } from './transcriptions';
import type { AudioCategory } from '../domain/transcription';
import { assetKind } from '../domain/asset-kind';

interface Inspection {
  requestId: string;
  controller: AbortController;
  agentRunning: boolean;
  done: Promise<void>;
}

export class Automation {
  private inspection: Inspection | null = null;
  constructor(
    private readonly store: StoragePort,
    private readonly agent: AgentPort,
    private readonly gate: OperationGate,
    private readonly media: MediaPort,
    private readonly emit: (event: AppEvent) => void,
    private readonly transcriptions?: Transcriptions,
  ) {}
  async cancelAssetInspection(requestId: string): Promise<void> {
    const inspection = this.inspection;
    if (!inspection || inspection.requestId !== requestId) return;
    inspection.controller.abort();
    if (inspection.agentRunning) await this.agent.stop();
    // Keep the lease until every owned worker and temporary evidence file is settled.
    await inspection.done;
  }
  describeAsset(input: {
    scope: Scope;
    path: string;
    requestId: string;
    category?: AudioCategory;
  }): Promise<AssetDraft> {
    const inspection: Inspection = {
      requestId: input.requestId,
      controller: new AbortController(),
      agentRunning: false,
      done: Promise.resolve(),
    };
    const pending = this.gate
      .run('asset-description', async () => {
        this.inspection = inspection;
        this.emit({
          type: 'asset-inspection',
          scope: input.scope,
          sourcePath: input.path,
          requestId: input.requestId,
          inspection: { phase: 'preparing', progress: 0 },
        });
        try {
          return await this.describe(input, inspection);
        } catch (error) {
          if (inspection.controller.signal.aborted) throw new AppFault({ id: 'mediaInspectionCancelled' });
          throw error;
        }
      })
      .finally(() => {
        if (this.inspection === inspection) this.inspection = null;
      });
    inspection.done = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }
  private async describe(
    input: { scope: Scope; path: string; requestId: string; category?: AudioCategory },
    inspection: Inspection,
  ): Promise<AssetDraft> {
    const signal = inspection.controller.signal;
    const cwd = await this.store.projectPath(input.scope);
    const settings = (await this.store.getState()).settings;
    const workspace = await this.store.openWorkspace(input.scope);
    signal.throwIfAborted();
    const kind = assetKind(input.path);
    if (kind === 'audio' && !input.category)
      throw new AppFault({ id: 'appTranscriptionClassificationRequired' });
    const analysis =
      (kind === 'audio' || kind === 'video') && this.transcriptions
        ? await this.transcriptions.analyze(
            { path: input.path, kind, ...(input.category ? { category: input.category } : {}) },
            signal,
          )
        : undefined;
    if ((kind === 'audio' || kind === 'video') && !analysis)
      throw new AppFault({ id: 'appTranscriptionUnavailable' });
    const evidence = await this.media.inspectAsset(
      input.path,
      (progress) => {
        this.emit({
          type: 'asset-inspection',
          scope: input.scope,
          sourcePath: input.path,
          requestId: input.requestId,
          inspection: progress,
        });
      },
      signal,
      analysis ? { speech: false } : undefined,
    );
    try {
      signal.throwIfAborted();
      if (analysis && analysis.sourceHash !== evidence.sourceHash)
        throw new AppFault({ id: 'appTranscriptionChanged' });
      const transcript =
        analysis?.transcription.status === 'complete' ? analysis.transcription.segments : evidence.transcript;
      if (!evidence.images.length && !transcript.length && !analysis)
        throw new AppFault({ id: 'mediaNoEvidence' });
      this.emit({
        type: 'asset-inspection',
        scope: input.scope,
        sourcePath: input.path,
        requestId: input.requestId,
        inspection: { phase: 'describing', progress: 0 },
      });
      inspection.agentRunning = true;
      const result = await this.agent.run(
        {
          threadId: null,
          cwd,
          mode: 'read',
          writableRoots: [],
          selection: settings.assetMetadata,
          attachments: evidence.images.map((image) => image.path),
          prompt: renderSystemPrompt('automation-2', {
            kind: evidence.kind,
            filename: JSON.stringify(input.path),
            samples: JSON.stringify(
              evidence.images.map((image, index) => ({ attachment: index + 1, seconds: image.seconds })),
            ),
            transcript: JSON.stringify(
              transcript.slice(0, 100).map((segment) => ({ ...segment, text: segment.text.slice(0, 300) })),
            ),
            preparation: JSON.stringify(
              analysis ? { category: analysis.category, transcription: analysis.transcription.status } : null,
            ),
            coverage: JSON.stringify(evidence.note),
            tags: JSON.stringify([...new Set(workspace.assets.flatMap((asset) => asset.tags))]),
          }),
          outputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              description: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
              kind: { type: 'string', enum: ['image', 'video', 'audio', 'other'] },
            },
            required: ['title', 'description', 'tags', 'kind'],
            additionalProperties: false,
          },
        },
        () => undefined,
      );
      inspection.agentRunning = false;
      signal.throwIfAborted();
      if (result.status !== 'completed')
        throw new AppFault({ id: 'mediaDescriptionFailed' }, result.error ?? undefined);
      const parsed: unknown = parseAgentJson(result.output);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('title' in parsed) ||
        typeof parsed.title !== 'string' ||
        !parsed.title.trim() ||
        !('description' in parsed) ||
        typeof parsed.description !== 'string' ||
        !parsed.description.trim() ||
        !('tags' in parsed) ||
        !Array.isArray(parsed.tags) ||
        !parsed.tags.every((tag: unknown) => typeof tag === 'string') ||
        !('kind' in parsed) ||
        (parsed.kind !== 'image' &&
          parsed.kind !== 'video' &&
          parsed.kind !== 'audio' &&
          parsed.kind !== 'other')
      )
        throw new AppFault({ id: 'mediaDescriptionInvalid' });
      return {
        sourcePath: input.path,
        sourceHash: evidence.sourceHash,
        ...(analysis ? { analysis } : {}),
        ...(input.category ? { audioCategory: input.category } : {}),
        title: parsed.title.trim(),
        description: parsed.description,
        tags: [...new Set(parsed.tags.map((tag) => tag.trim().replace(/^#+/u, '')).filter(Boolean))],
        kind: evidence.kind,
        ...(evidence.kind === 'image' && evidence.images.length === 1 ? {} : { inspection: evidence.note }),
      };
    } finally {
      inspection.agentRunning = false;
      await evidence.dispose();
    }
  }
}
