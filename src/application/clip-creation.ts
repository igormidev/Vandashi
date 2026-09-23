import type { CreatedClip, DesktopApi } from '../domain/api';
import { AppFault, diagnosticFromError } from '../domain/diagnostics';
import { clipHandoffText } from '../domain/clip-handoff';
import type { MediaPort } from '../domain/media';
import type { AppEvent, Clip, ClipHandoff, Workspace } from '../domain/models';
import type { StoragePort } from '../domain/storage';
import type { Chats } from './chats';
import type { OperationGate } from './operation-gate';

export class ClipCreation {
  constructor(
    private readonly store: StoragePort,
    private readonly media: MediaPort,
    private readonly chats: Chats,
    private readonly gate: OperationGate,
    private readonly remember: (workspace: Workspace) => Workspace,
    private readonly emit: (event: AppEvent) => void,
  ) {}

  async create(input: Parameters<DesktopApi['createClip']>[0]): Promise<CreatedClip> {
    if (this.gate.readingWorkspace) await this.gate.waitUntilIdle();
    const release = this.gate.acquire('create-clip');
    let clip: Clip | undefined;
    let transferred = false;
    const handoff: ClipHandoff = {
      message: { id: 'clipHandoff', params: { ratio: input.ratio, start: input.start, end: input.end } },
      guidance: input.prompt,
    };
    try {
      const workspace = await this.store.openWorkspace(input.scope);
      if (!workspace.video?.renderedPath) throw new AppFault({ id: 'appRenderBeforeClip' });
      const sourceVideoPath = workspace.video.renderedPath;
      clip = await this.store.createClip(input, ({ path, name }) =>
        this.media.createClip({
          projectPath: path,
          sourceVideoPath,
          ratio: input.ratio,
          start: input.start,
          end: input.end,
          title: name,
        }),
      );
      // Publication is durable. Queue the parent-list refresh even if later hydration or startup fails.
      this.emit({ type: 'workspace-changed', scope: input.scope });
      const scope = { ...input.scope, clipId: clip.id };
      this.remember(await this.store.openWorkspace(scope));
      transferred = true;
      await this.chats.startOwned(
        { scope, topic: 'clip', title: input.name },
        {
          text: clipHandoffText(handoff),
          handoff,
          mode: 'edit',
          selection: input.selection,
          attachments: [],
        },
        release,
      );
      return { clip, generation: { status: 'started' } };
    } catch (error) {
      if (!clip) throw error;
      return { clip, generation: { status: 'failed', diagnostic: diagnosticFromError(error), handoff } };
    } finally {
      if (!transferred) release();
    }
  }
}
