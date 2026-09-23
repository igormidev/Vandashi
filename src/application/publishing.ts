import { AppFault } from '../domain/diagnostics';
import { parseAgentJson } from './agent-json';
import type { AgentPort } from '../domain/agent';
import type { Chapter, Clip, Scope } from '../domain/models';
import type { MediaPort } from '../domain/media';
import type { StoragePort } from '../domain/storage';
import type { OperationGate } from './operation-gate';
import type { Chats } from './chats';
import type { DesktopApi } from '../domain/api';
import { platforms } from '../domain/defaults';
import { appendChapters, chapterIssue, horizontalPlatforms } from '../domain/launch';
import { importFinishedClip } from './finished-clip';
import { publishScope, verifyPublishMedia } from './publish-scope';

function webUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

export class Publishing {
  constructor(
    private readonly store: StoragePort,
    private readonly agent: AgentPort,
    private readonly media: MediaPort,
    private readonly gate: OperationGate,
  ) {}
  updateLaunch(input: Parameters<DesktopApi['updateLaunch']>[0]): Promise<void> {
    return this.gate.run('release-status', async () => {
      const scope = { ...input.scope, clipId: null };
      const workspace = await this.store.openWorkspace(scope);
      const target = input.launch.clipId
        ? workspace.clips.find((clip) => clip.id === input.launch.clipId)
        : workspace.video;
      if (!target) throw new AppFault({ id: 'appPublishTargetMissing' });
      if (horizontalPlatforms.includes(input.launch.platform) !== (target.ratio === '16:9'))
        throw new AppFault({ id: 'appPublishFormatMismatch' });
      const url = input.launch.url.trim();
      if (url && !webUrl(url)) throw new AppFault({ id: 'appPublishedUrlInvalid' });
      await this.store.updateLaunch({ scope, launch: { ...input.launch, url } });
    });
  }
  async chapters(scope: Scope): Promise<Chapter[]> {
    return this.gate.run('chapters', async () => {
      const workspace = await this.store.openWorkspace(scope);
      const cwd = await this.store.projectPath(scope);
      if (!workspace.video?.renderedPath) throw new AppFault({ id: 'appChaptersNeedRender' });
      const duration = (await this.media.probeMedia(workspace.video.renderedPath)).duration;
      if (!Number.isFinite(duration) || duration < 30) throw new AppFault({ id: 'appChaptersVideoShort' });
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
      if (result.status !== 'completed')
        throw new AppFault({ id: 'appChaptersFailed' }, result.error ?? undefined);
      const parsed: unknown = parseAgentJson(result.output);
      if (!parsed || typeof parsed !== 'object' || !('chapters' in parsed) || !Array.isArray(parsed.chapters))
        throw new AppFault({ id: 'appChaptersInvalidResponse' });
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
          throw new AppFault({ id: 'appChapterInvalid' });
        return { seconds: entry.seconds, title: entry.title.trim() };
      });
      const issue = chapterIssue(chapters, duration);
      if (issue) throw new AppFault({ id: issue });
      return chapters;
    });
  }
  prepare(
    input: Parameters<DesktopApi['preparePublish']>[0],
    chats: Chats,
  ): ReturnType<DesktopApi['preparePublish']> {
    const platform = platforms.find((entry) => entry === input.platform);
    if (!platform) return Promise.reject(new AppFault({ id: 'appPublishPlatformUnsupported' }));
    const scope = { ...input.scope, clipId: null };
    const clipId = input.clipId ?? input.scope.clipId;
    const topic = `publish:${platform}${clipId ? `:${clipId}` : ''}`;
    return chats.withSession({ scope, topic, title: platform }, async (session) => {
      const context = await publishScope(this.store, scope, topic);
      if (!context) throw new AppFault({ id: 'appPublishTargetMissing' });
      const { workspace } = context;
      const { video, probe } = await verifyPublishMedia(context, this.media);
      if (!input.browser.trim()) throw new AppFault({ id: 'appPublishBrowserRequired' });
      const channel = workspace.brand.config.platforms[platform === 'youtubeShorts' ? 'youtube' : platform];
      if (!channel?.url.trim()) throw new AppFault({ id: 'appPublishChannelRequired' });
      const channelUrl = webUrl(channel.url);
      if (!channelUrl) throw new AppFault({ id: 'appPublishChannelInvalid' });
      const horizontal = horizontalPlatforms.includes(platform);
      const packaging = structuredClone(input.packaging);
      packaging.titles.long = packaging.titles.long.filter((title) => title.trim());
      packaging.titles.short = packaging.titles.short.filter((title) => title.trim());
      const format = horizontal ? 'long' : 'short';
      if (packaging.titles[format].length === 0) throw new AppFault({ id: 'appPublishTitleRequired' });
      if (input.chapters?.length) {
        if (platform !== 'youtube') throw new AppFault({ id: 'appManualChaptersUnsupported' });
        const issue = chapterIssue(input.chapters, probe.duration);
        if (issue) throw new AppFault({ id: issue });
        packaging.descriptions.long = appendChapters(packaging.descriptions.long, input.chapters);
      }
      const thumbnails = await Promise.all(
        packaging.thumbnails.map((file) =>
          this.store.allowedPath(/^(?:[/\\]|[A-Za-z]:)/.test(file) ? file : `${video.path}/${file}`),
        ),
      );
      const capabilities = await this.agent.capabilities(video.path);
      if (!capabilities.browserTools?.length) throw new AppFault({ id: 'appBrowserControlsUnavailable' });
      return {
        session,
        prompt: `Upload ${JSON.stringify(video.name)} using this verified local video file: ${JSON.stringify(video.renderedPath)}. Destination: ${platform}. Browser: ${JSON.stringify(input.browser.trim())}. Exact channel: ${JSON.stringify(channelUrl.toString())}.\nUse this reviewed packaging (use the ${format}-form fields):\n${JSON.stringify(packaging, null, 2)}\nOrdered thumbnail files: ${JSON.stringify(thumbnails)}. The first is the main thumbnail. Before submitting candidates, inspect the destination and exact account to determine whether title/thumbnail testing is available and its current maximum for each kind. Use only the leading supported prefix of each ordered list; never skip an earlier candidate or exceed the verified maximum. If testing is unavailable or its limit cannot be verified, use only the first title and main thumbnail where supported and report omitted alternatives. Never infer capability from the number of supplied candidates.\nLaunch file: ${JSON.stringify(`${workspace.video?.path ?? video.path}/launch.yml`)}. Update only the record {platform:${JSON.stringify(platform)},clipId:${JSON.stringify(clipId)}}; preserve other releases.\nVerify the exact channel before taking any upload action. If the account differs, switch only when the matching account can be positively identified; otherwise stop and notify me. If signed out, pause so I can sign in directly in the browser. Never request passwords or codes in chat. Monitor actual upload and processing through completion, then set uploaded and the verified public URL. If it fails, set failed and explain the remaining work. Do not invent successful results.`,
      };
    });
  }
  async importClip(input: { scope: Scope; sourcePath: string }): Promise<Clip> {
    return this.gate.run('import-clip', () => importFinishedClip(input, this.store, this.media));
  }
}
