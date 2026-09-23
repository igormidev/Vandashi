import { parseAgentJson } from './agent-json';
import type { AgentPort } from '../domain/agent';
import type { Chapter, Clip, Scope } from '../domain/models';
import type { MediaPort } from '../domain/media';
import type { StoragePort } from '../domain/storage';
import type { Commits } from './commits';
import type { OperationGate } from './operation-gate';
import type { Chats } from './chats';
import type { DesktopApi } from '../domain/api';
import { platforms } from '../domain/defaults';
import { appendChapters, chapterIssue, horizontalPlatforms } from '../domain/launch';

const chapterErrors = {
  chapterCountError: 'YouTube chapters need at least three timestamps.',
  chapterStartError: 'The first chapter must start at 00:00.',
  chapterTitleError: 'Every chapter needs a nonempty single-line title.',
  chapterTimeError: 'Chapter timestamps must be nonnegative whole seconds.',
  chapterSpacingError: 'Chapter timestamps must be ordered with at least ten seconds between them.',
  chapterDurationError: 'Every chapter must include at least ten seconds of the actual video.',
};

export class Publishing {
  constructor(
    private readonly store: StoragePort,
    private readonly agent: AgentPort,
    private readonly media: MediaPort,
    private readonly gate: OperationGate,
    private readonly commits: Commits,
  ) {}
  updateLaunch(input: Parameters<DesktopApi['updateLaunch']>[0]): Promise<void> {
    return this.gate.run('release-status', async () => {
      const scope = { ...input.scope, clipId: null };
      const workspace = await this.store.openWorkspace(scope);
      const target = input.launch.clipId
        ? workspace.clips.find((clip) => clip.id === input.launch.clipId)
        : workspace.video;
      if (!target) throw new Error('The selected video or clip no longer exists.');
      if (horizontalPlatforms.includes(input.launch.platform) !== (target.ratio === '16:9'))
        throw new Error('This destination does not match the selected video format.');
      const url = input.launch.url.trim();
      if (url) {
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password)
          throw new Error('Use a valid published video web URL.');
      }
      await this.store.updateLaunch({ scope, launch: { ...input.launch, url } });
    });
  }
  async chapters(scope: Scope): Promise<Chapter[]> {
    return this.gate.run('chapters', async () => {
      const workspace = await this.store.openWorkspace(scope);
      const cwd = await this.store.projectPath(scope);
      if (!workspace.video?.renderedPath) throw new Error('Render the video before generating chapters.');
      const duration = (await this.media.probeMedia(workspace.video.renderedPath)).duration;
      if (!Number.isFinite(duration) || duration < 30)
        throw new Error('YouTube chapters require at least thirty seconds of video.');
      const guidance = workspace.documents.find((document) => document.name === 'YOUTUBE_SECTIONS_TASTE.md');
      const script = workspace.documents.find((document) => document.kind === 'script');
      const result = await this.agent.run(
        {
          threadId: null,
          cwd,
          mode: 'read',
          writableRoots: [],
          selection: (await this.store.getState()).settings.chapters,
          attachments: [],
          prompt: `Create accurate YouTube chapter timestamps from the actual video timeline and script. MANDATORY read ${JSON.stringify(script?.path)} and ${JSON.stringify(guidance?.path)}. The rendered video is ${JSON.stringify(workspace.video.renderedPath)}, duration ${String(duration)} seconds. Inspect index.html and relevant media to verify times. First chapter starts at zero; at least 3 chapters, each at least 10 seconds, timestamps in whole seconds. Do not invent timing. Return JSON {chapters:[{seconds:number,title:string}]}. Do not edit files.`,
          outputSchema: {
            type: 'object',
            properties: {
              chapters: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { seconds: { type: 'number' }, title: { type: 'string' } },
                  required: ['seconds', 'title'],
                  additionalProperties: false,
                },
              },
            },
            required: ['chapters'],
            additionalProperties: false,
          },
        },
        () => undefined,
      );
      if (result.status !== 'completed') throw new Error(result.error ?? 'Could not create chapters.');
      const parsed: unknown = parseAgentJson(result.output);
      if (!parsed || typeof parsed !== 'object' || !('chapters' in parsed) || !Array.isArray(parsed.chapters))
        throw new Error('Invalid chapter response.');
      const chapters = parsed.chapters.map((entry: unknown): Chapter => {
        if (
          !entry ||
          typeof entry !== 'object' ||
          !('seconds' in entry) ||
          typeof entry.seconds !== 'number' ||
          !Number.isFinite(entry.seconds) ||
          entry.seconds < 0 ||
          !('title' in entry) ||
          typeof entry.title !== 'string' ||
          !entry.title.trim()
        )
          throw new Error('Invalid chapter.');
        return { seconds: entry.seconds, title: entry.title.trim() };
      });
      const issue = chapterIssue(chapters, duration);
      if (issue) throw new Error(chapterErrors[issue]);
      return chapters;
    });
  }
  prepare(
    input: Parameters<DesktopApi['preparePublish']>[0],
    chats: Chats,
  ): ReturnType<DesktopApi['preparePublish']> {
    const platform = platforms.find((entry) => entry === input.platform);
    if (!platform) return Promise.reject(new Error('Choose a supported publishing platform.'));
    const scope = { ...input.scope, clipId: null };
    const clipId = input.clipId ?? input.scope.clipId;
    const topic = `publish:${platform}${clipId ? `:${clipId}` : ''}`;
    return chats.withSession({ scope, topic, title: platform }, async (session) => {
      const workspace = await this.store.openWorkspace(scope);
      const target = clipId ? await this.store.openWorkspace({ ...scope, clipId }) : workspace;
      const video = target.video;
      if (target.dirty)
        throw new Error('Save or discard pending workspace changes before preparing an upload.');
      if (!video?.renderedPath)
        throw new Error('Render the selected video or clip before preparing an upload.');
      if (!input.browser.trim()) throw new Error('Choose the browser where your channel is signed in.');
      const channel = workspace.brand.config.platforms[platform === 'youtubeShorts' ? 'youtube' : platform];
      if (!channel?.url.trim())
        throw new Error('Set the destination channel URL in the brand workspace first.');
      const channelUrl = new URL(channel.url);
      if (!['http:', 'https:'].includes(channelUrl.protocol) || channelUrl.username || channelUrl.password)
        throw new Error('Use a valid destination channel web URL.');
      const probe = await this.media.probeMedia(video.renderedPath);
      if (!Number.isFinite(probe.duration) || probe.duration <= 0 || !probe.width || !probe.height)
        throw new Error('The selected rendered file is not a valid video.');
      const horizontal = horizontalPlatforms.includes(platform);
      if (horizontal && (clipId || video.ratio !== '16:9' || probe.width <= probe.height))
        throw new Error('Choose the main landscape video for this destination.');
      if (!horizontal && (video.ratio === '16:9' || probe.width > probe.height))
        throw new Error('Choose a rendered vertical or square clip for this destination.');
      const packaging = structuredClone(input.packaging);
      const format = horizontal ? 'long' : 'short';
      if (!packaging.titles[format].some((title) => title.trim()))
        throw new Error('Enter at least one title for this upload.');
      if (input.chapters?.length) {
        if (platform !== 'youtube')
          throw new Error('Manual chapters are supported for the main YouTube video.');
        const issue = chapterIssue(input.chapters, probe.duration);
        if (issue) throw new Error(chapterErrors[issue]);
        packaging.descriptions.long = appendChapters(packaging.descriptions.long, input.chapters);
      }
      const thumbnails = await Promise.all(
        packaging.thumbnails.map((file) =>
          this.store.allowedPath(/^(?:[/\\]|[A-Za-z]:)/.test(file) ? file : `${video.path}/${file}`),
        ),
      );
      const capabilities = await this.agent.capabilities(video.path);
      if (!capabilities.browserTools?.length)
        throw new Error(
          'Browser controls are unavailable to Codex. Enable the browser or unified-computer-use Codex plugin, then retry preparing the upload.',
        );
      return {
        session,
        prompt: `Upload ${JSON.stringify(video.name)} using this verified local video file: ${JSON.stringify(video.renderedPath)}. Destination: ${platform}. Browser: ${JSON.stringify(input.browser.trim())}. Exact channel: ${JSON.stringify(channelUrl.toString())}.\nUse this reviewed packaging (use the ${format}-form fields):\n${JSON.stringify(packaging, null, 2)}\nOrdered thumbnail files: ${JSON.stringify(thumbnails)}. The first is the main thumbnail; use additional title/thumbnail candidates only when this account and platform currently support testing, and report unsupported options.\nLaunch file: ${JSON.stringify(`${workspace.video?.path ?? video.path}/launch.yml`)}. Update only the record {platform:${JSON.stringify(platform)},clipId:${JSON.stringify(clipId)}}; preserve other releases.\nVerify the exact channel before taking any upload action. If the account differs, switch only when the matching account can be positively identified; otherwise stop and notify me. If signed out, pause so I can sign in directly in the browser. Never request passwords or codes in chat. Monitor actual upload and processing through completion, then set uploaded and the verified public URL. If it fails, set failed and explain the remaining work. Do not invent successful results.`,
      };
    });
  }
  async importClip(input: { scope: Scope; sourcePath: string }): Promise<Clip> {
    return this.gate.run('import-clip', async () => {
      const probe = await this.media.probeMedia(input.sourcePath);
      if (!probe.width || !probe.height || probe.duration <= 0) throw new Error('Choose a valid video file.');
      if (probe.width > probe.height) throw new Error('Choose a vertical or square finished clip.');
      const name = `imported-${String(Date.now())}`;
      const ratio = probe.width === probe.height ? '1:1' : '9:16';
      const clip = await this.store.createClip({
        scope: input.scope,
        name,
        ratio,
        start: 0,
        end: probe.duration,
      });
      const scope = { ...input.scope, clipId: clip.id };
      const asset = await this.store.importAsset({
        scope,
        draft: {
          sourcePath: input.sourcePath,
          title: name,
          description: 'Imported finished clip.',
          tags: [],
          kind: 'video',
        },
      });
      await this.store.setRenderedPath(scope, asset.path);
      await this.commits.reconcile(scope);
      return { ...clip, renderedPath: asset.path };
    });
  }
}
