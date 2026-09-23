import { AppFault } from '../domain/diagnostics';
import { platforms } from '../domain/defaults';
import { horizontalPlatforms } from '../domain/launch';
import type { MediaPort } from '../domain/media';
import type { Platform, Scope, Workspace } from '../domain/models';
import type { StoragePort } from '../domain/storage';

interface PublishScope {
  scope: Scope;
  workspace: Workspace;
  target: Workspace;
  platform: Platform;
  clipId: string | null;
}

/** Resolve the operation before reading any workspace that may synchronize or repair files. */
export function publishTarget(owner: Scope, topic: string): { scope: Scope; platform: Platform } | null {
  if (!topic.startsWith('publish:')) return null;
  const parts = topic.split(':');
  const platform = platforms.find((value) => value === parts[1]);
  if (!platform) throw new AppFault({ id: 'appPublishPlatformUnsupported' });
  if (!owner.videoId || owner.clipId) throw new AppFault({ id: 'appPublishTargetMissing' });
  const clipId = parts[2] ?? null;
  if (parts.length > 3 || clipId === '') throw new AppFault({ id: 'appPublishClipMissing' });
  return { scope: { ...owner, clipId }, platform };
}

/** The conversation and launch ledger belong to the parent; the operation also owns its chosen clip. */
export async function publishScope(
  store: StoragePort,
  owner: Scope,
  topic: string,
): Promise<PublishScope | null> {
  const publication = publishTarget(owner, topic);
  if (!publication) return null;
  const { scope, platform } = publication;
  const { clipId } = scope;
  const workspace = await store.openWorkspace(owner);
  if (!workspace.video) throw new AppFault({ id: 'appPublishTargetMissing' });
  if (clipId && !workspace.clips.some((clip) => clip.id === clipId && clip.parentVideoId === owner.videoId))
    throw new AppFault({ id: 'appPublishClipMissing' });
  const target = clipId ? await store.openWorkspace(scope) : workspace;
  return { scope, workspace, target, platform, clipId };
}

export async function verifyPublishMedia(context: PublishScope, media: MediaPort | undefined) {
  const { target, platform, clipId } = context;
  const video = target.video;
  if (target.dirty) throw new AppFault({ id: 'appSaveBeforePublish' });
  if (!video?.renderedPath) throw new AppFault({ id: 'appPublishNeedRender' });
  if (!media) throw new AppFault({ id: 'appRenderedVideoInvalid' });
  const probe = await media.probeMedia(video.renderedPath);
  if (!Number.isFinite(probe.duration) || probe.duration <= 0 || !probe.width || !probe.height)
    throw new AppFault({ id: 'appRenderedVideoInvalid' });
  const horizontal = horizontalPlatforms.includes(platform);
  if (horizontal && (clipId || video.ratio !== '16:9' || probe.width <= probe.height))
    throw new AppFault({ id: 'appPublishLandscapeRequired' });
  if (!horizontal && (video.ratio === '16:9' || probe.width > probe.height))
    throw new AppFault({ id: 'appPublishPortraitRequired' });
  return { video, probe };
}

export function publishScopeGuidance(context: PublishScope, repositories: string[]): string {
  return `[VANDASHI_PUBLICATION_SCOPE]\nThe operation's selected project is ${JSON.stringify(context.target.video?.path)}. Its current rendered file is ${JSON.stringify(context.target.video?.renderedPath)}. The canonical launch ledger remains ${JSON.stringify(`${context.workspace.video?.path ?? ''}/launch.yml`)} in the parent video. Use only this selected media; if the user's prepared request names an older or different file, pause for a fresh review instead of uploading that file. All participating repositories, including the selected clip, are ${JSON.stringify(repositories)}. Preserve unrelated releases and commit pending changes in each affected repository.\n[/VANDASHI_PUBLICATION_SCOPE]\n`;
}
