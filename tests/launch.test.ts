import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { chapterIssue, chapterTime, appendChapters } from '../src/domain/launch';
import { applicationFixture, type ApplicationFixture } from './application-fixture';
import { buildWorkspacePrompt } from '../src/domain/prompts';

const chapters = [
  { seconds: 0, title: 'Opening' },
  { seconds: 20, title: 'Story' },
  { seconds: 40, title: 'Ending' },
];
describe('YouTube chapter rules', () => {
  it('validates titles, order, whole seconds, and the final chapter against the actual duration', () => {
    expect(chapterIssue(chapters, 60)).toBeNull();
    expect(chapterIssue(chapters.slice(0, 2), 60)).toBe('chapterCountError');
    expect(
      chapterIssue(
        chapters.map((chapter) => ({ ...chapter, seconds: chapter.seconds + 1 })),
        60,
      ),
    ).toBe('chapterStartError');
    expect(
      chapterIssue(
        [
          { seconds: 0, title: 'Start' },
          { seconds: 9, title: 'Next' },
          { seconds: 25, title: 'End' },
        ],
        60,
      ),
    ).toBe('chapterSpacingError');
    expect(chapterIssue(chapters, 49)).toBe('chapterDurationError');
    expect(chapterIssue([...chapters.slice(0, 2), { seconds: 40.3, title: 'End' }], 60)).toBe(
      'chapterTimeError',
    );
    expect(chapterIssue([...chapters.slice(0, 2), { seconds: 40, title: '   ' }], 60)).toBe(
      'chapterTitleError',
    );
    expect(chapterTime(0)).toBe('00:00');
    expect(chapterTime(3661)).toBe('1:01:01');
    expect(appendChapters('Description', chapters)).toBe(
      'Description\n\n00:00 Opening\n00:20 Story\n00:40 Ending',
    );
  });
});

describe('release workflows with real storage and Git', () => {
  let app: ApplicationFixture;
  beforeEach(async () => {
    app = await applicationFixture();
    const current = await app.store.openWorkspace(app.scope);
    await mkdir(join(app.path, 'output'), { recursive: true });
    const output = join(app.path, 'output', 'render.mp4');
    await writeFile(output, 'Probe supplied by the test media port.');
    await app.store.setRenderedPath(app.scope, output);
    await app.store.saveWorkspace({
      scope: app.scope,
      revision: current.revision,
      documents: [],
      packaging: {
        titles: { long: ['Main title'], short: ['Short title'] },
        descriptions: { long: 'Main description', short: '' },
        tags: { long: [], short: [] },
        thumbnails: [],
        theme: '',
      },
      brandConfig: {
        ...current.brand.config,
        platforms: {
          youtube: { url: 'https://youtube.com/@fixture', browser: 'Chrome' },
          tiktok: { url: 'https://tiktok.com/@fixture', browser: 'Arc' },
        },
      },
      commit: { title: 'Configure release fixture', body: 'Set channels, packaging, and rendered output.' },
    });
  });
  afterEach(async () => {
    await app.cleanup();
  });
  async function packaging() {
    const value = (await app.store.openWorkspace(app.scope)).video?.packaging;
    if (!value) throw new Error('No video');
    return value;
  }
  it('prepares the selected main media with reviewed fields and chapters without publishing or altering saved packaging', async () => {
    const original = await packaging();
    const reviewed = { ...original, descriptions: { ...original.descriptions, long: 'Reviewed only' } };
    const result = await app.api.preparePublish({
      scope: app.scope,
      platform: 'youtube',
      browser: 'Firefox',
      packaging: reviewed,
      clipId: null,
      chapters,
    });
    expect(result.session.scope).toEqual(app.scope);
    expect(result.prompt).toContain('Firefox');
    expect(result.prompt).toContain('https://youtube.com/@fixture');
    expect(result.prompt).toContain('Reviewed only\\n\\n00:00 Opening');
    expect(result.prompt).toContain('clipId:null');
    expect(await packaging()).toEqual(original);
    expect(app.agent.run).not.toHaveBeenCalled();
    await expect(
      app.api.preparePublish({
        scope: app.scope,
        platform: 'youtube',
        browser: 'Firefox',
        packaging: reviewed,
        clipId: null,
        chapters: [...chapters.slice(0, 2), { seconds: 59, title: 'Too late' }],
      }),
    ).rejects.toThrow('ten seconds');
  });
  it('keeps clip conversations and launch records distinct while targeting the parent release file', async () => {
    const clip = await app.store.createClip({
      scope: app.scope,
      name: 'Excerpt',
      ratio: '9:16',
      start: 0,
      end: 20,
    });
    await mkdir(join(clip.path, 'output'), { recursive: true });
    const output = join(clip.path, 'output', 'clip.mp4');
    await writeFile(output, 'Vertical video fixture');
    await app.store.setRenderedPath({ ...app.scope, clipId: clip.id }, output);
    await app.git.commit(
      clip.path,
      'Save clip export',
      'Record the current export before preparing an upload.',
    );
    app.media.probeMedia.mockResolvedValue({
      duration: 20,
      width: 1080,
      height: 1920,
      hasAudio: true,
      format: 'mp4',
    });
    const result = await app.api.preparePublish({
      scope: app.scope,
      platform: 'youtubeShorts',
      browser: 'Chrome',
      packaging: await packaging(),
      clipId: clip.id,
    });
    expect(result.session.scope).toEqual(app.scope);
    expect(result.session.topic).toBe(`publish:youtubeShorts:${clip.id}`);
    expect(result.prompt).toContain(output);
    expect(result.prompt).toContain(join(app.path, 'launch.yml'));
    expect(result.prompt).not.toContain(join(clip.path, 'launch.yml'));
    const guidance = buildWorkspacePrompt({
      workspace: await app.store.openWorkspace(app.scope),
      topic: result.session.topic,
      mode: 'edit',
      text: result.prompt,
    });
    expect(guidance).toContain(join(clip.path, 'video_packaging.yml'));
    expect(guidance).toContain(`clipId="${clip.id}"`);
    await app.api.updateLaunch({
      scope: app.scope,
      launch: {
        platform: 'youtubeShorts',
        status: 'uploaded',
        url: 'https://youtube.com/shorts/example',
        clipId: clip.id,
      },
    });
    await app.api.updateLaunch({
      scope: app.scope,
      launch: { platform: 'youtube', status: 'not_started', url: '', clipId: null },
    });
    const releases = (await app.store.openWorkspace(app.scope)).launches;
    expect(releases).toHaveLength(2);
    expect(releases.find((entry) => entry.clipId === clip.id)?.status).toBe('uploaded');
    expect(await readFile(join(clip.path, 'launch.yml'), 'utf8')).toBe('[]\n');
  });
  it('rejects wrong format, missing browser/channel, unsupported destinations, and mismatched rendered dimensions', async () => {
    const input = {
      scope: app.scope,
      platform: 'youtube',
      browser: 'Chrome',
      packaging: await packaging(),
      clipId: null,
    };
    await expect(app.api.preparePublish({ ...input, browser: ' ' })).rejects.toThrow('browser');
    await expect(app.api.preparePublish({ ...input, platform: 'rumble' })).rejects.toThrow('channel URL');
    await expect(app.api.preparePublish({ ...input, platform: 'unknown' })).rejects.toThrow('supported');
    await expect(app.api.preparePublish({ ...input, platform: 'tiktok' })).rejects.toThrow(
      'vertical or square',
    );
    app.media.probeMedia.mockResolvedValueOnce({
      duration: 60,
      width: 1080,
      height: 1920,
      hasAudio: true,
      format: 'mp4',
    });
    await expect(app.api.preparePublish(input)).rejects.toThrow('landscape');
    await expect(
      app.api.updateLaunch({
        scope: app.scope,
        launch: { platform: 'youtube', status: 'uploaded', url: 'javascript:alert(1)', clipId: null },
      }),
    ).rejects.toThrow('web URL');
    await expect(
      app.api.updateLaunch({
        scope: app.scope,
        launch: { platform: 'youtubeShorts', status: 'uploaded', url: '', clipId: 'missing' },
      }),
    ).rejects.toThrow('no longer exists');
    app.agent.capabilities.mockResolvedValueOnce({ skills: [], plugins: [], browserTools: [] });
    await expect(app.api.preparePublish(input)).rejects.toThrow('Browser controls are unavailable');
  });
  it('rejects uncommitted brand edits even when the selected export is fresh', async () => {
    const workspace = await app.store.openWorkspace(app.scope);
    const identity = join(workspace.brand.path, 'brand_identity', 'VISUAL_IDENTITY_TASTE.md');
    await writeFile(identity, `${await readFile(identity, 'utf8')}\nPending brand change.\n`);
    expect((await app.store.openWorkspace(app.scope)).video?.renderedPath).toBeTruthy();
    await expect(
      app.api.preparePublish({
        scope: app.scope,
        platform: 'youtube',
        browser: 'Chrome',
        packaging: await packaging(),
        clipId: null,
      }),
    ).rejects.toThrow('Save or discard');
  });
});
