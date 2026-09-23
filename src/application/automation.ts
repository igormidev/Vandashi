import { parseAgentJson } from './agent-json';
import type { AgentPort } from '../domain/agent';
import type { AssetDraft, Scope } from '../domain/models';
import type { StoragePort } from '../domain/storage';
import type { OperationGate } from './operation-gate';

export class Automation {
  constructor(
    private readonly store: StoragePort,
    private readonly agent: AgentPort,
    private readonly gate: OperationGate,
  ) {}
  async describeAsset(input: { scope: Scope; path: string }): Promise<AssetDraft> {
    return this.gate.run('asset-description', async () => {
      const cwd = await this.store.projectPath(input.scope);
      const settings = (await this.store.getState()).settings;
      const workspace = await this.store.openWorkspace(input.scope);
      const result = await this.agent.run(
        {
          threadId: null,
          cwd,
          mode: 'read',
          writableRoots: [],
          selection: settings.assetMetadata,
          attachments: [input.path],
          prompt: `Inspect this local asset ${JSON.stringify(input.path)}. Return JSON with title (concise descriptive name), description (what is actually visible/audible), tags (array of useful plain tags), and kind (image, video, audio, or other). Existing library tags: ${JSON.stringify([...new Set(workspace.assets.flatMap((asset) => asset.tags))])}. Do not invent unseen content. If media inspection is unavailable, say so in description. Do not modify any files.`,
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
      if (result.status !== 'completed') throw new Error(result.error ?? 'Could not describe this asset.');
      const parsed: unknown = parseAgentJson(result.output);
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !('title' in parsed) ||
        typeof parsed.title !== 'string' ||
        !parsed.title.trim() ||
        !('description' in parsed) ||
        typeof parsed.description !== 'string' ||
        !('tags' in parsed) ||
        !Array.isArray(parsed.tags) ||
        !parsed.tags.every((tag: unknown) => typeof tag === 'string') ||
        !('kind' in parsed) ||
        (parsed.kind !== 'image' &&
          parsed.kind !== 'video' &&
          parsed.kind !== 'audio' &&
          parsed.kind !== 'other')
      )
        throw new Error('Invalid asset description.');
      return {
        sourcePath: input.path,
        title: parsed.title.trim(),
        description: parsed.description,
        tags: [...new Set(parsed.tags.map((tag) => tag.trim().replace(/^#+/u, '')).filter(Boolean))],
        kind: parsed.kind,
      };
    });
  }
}
