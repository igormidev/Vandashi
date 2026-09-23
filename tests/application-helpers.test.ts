import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

function helperOutput(output: string) {
  vi.mocked(app.agent.run).mockResolvedValueOnce({
    threadId: 'helper',
    turnId: 'helper',
    status: 'completed',
    output,
    error: null,
  });
}

async function renderedFixture() {
  await mkdir(join(app.path, 'output'), { recursive: true });
  const path = join(app.path, 'output', 'render.mp4');
  await writeFile(path, 'The media port supplies the fixture duration.');
  await app.store.setRenderedPath(app.scope, path);
  await app.git.commit(app.path, 'Record render', 'Add the deterministic probe fixture.');
}

describe('automatic helper contracts', () => {
  it('includes unsaved manual changes in commit suggestion and handles fenced JSON', async () => {
    helperOutput('```json\n{"title":"  Update audience  ","body":" Explain the new audience. "}\n```');
    const head = await app.git.head(app.path);
    expect(
      await app.api.suggestCommit({ scope: app.scope, summary: 'Audience: children -> university students' }),
    ).toEqual({ title: 'Update audience', body: 'Explain the new audience.' });
    expect(app.agent.run.mock.calls[0]?.[0].prompt).toContain('Audience: children -> university students');
    expect(await app.git.head(app.path)).toBe(head);
  });

  it('validates actual asset metadata and normalizes duplicate tags without accepting empty names', async () => {
    helperOutput(
      '```json\n{"title":" Earth ","description":"A globe","tags":["#planet","planet"," "],"kind":"image"}\n```',
    );
    expect(await app.api.describeAsset({ scope: app.scope, path: '/tmp/globe.png' })).toEqual({
      sourcePath: '/tmp/globe.png',
      title: 'Earth',
      description: 'A globe',
      tags: ['planet'],
      kind: 'image',
    });
    helperOutput('{"title":" ","description":"A globe","tags":[],"kind":"image"}');
    await expect(app.api.describeAsset({ scope: app.scope, path: '/tmp/globe.png' })).rejects.toThrow(
      'Invalid asset',
    );
  });

  it('explicit entry checks recover dirty repositories even when the cheap helper cannot run', async () => {
    await writeFile(join(app.path, 'script.md'), '# Interrupted script');
    vi.mocked(app.agent.run).mockRejectedValueOnce(new Error('Unavailable'));
    const checks = await app.api.checks({ scope: app.scope, video: false });
    expect(checks.find((check) => check.id === 'Git')?.status).toBe('ready');
    expect((await app.git.status(app.path)).dirty).toBe(false);
    expect((await app.git.history(app.path, 0)).commits[0]?.title).toBe('Save workspace changes');
  });

  it('rejects chapters beyond actual media duration and accepts bounded ordered chapters', async () => {
    await renderedFixture();
    helperOutput(
      '{"chapters":[{"seconds":0,"title":"Start"},{"seconds":20,"title":"Middle"},{"seconds":59,"title":"End"}]}',
    );
    await expect(app.api.generateChapters(app.scope)).rejects.toThrow('ten seconds');
    helperOutput(
      '{"chapters":[{"seconds":0,"title":"Start"},{"seconds":20,"title":"Middle"},{"seconds":40,"title":"End"}]}',
    );
    expect(await app.api.generateChapters(app.scope)).toHaveLength(3);
    expect(app.agent.run.mock.calls[0]?.[0].mode).toBe('read');
    expect(app.agent.run.mock.calls[0]?.[0].writableRoots).toEqual([]);
  });

  it('prepares upload for the actual selected clip with the correct launch file', async () => {
    const clip = await app.store.createClip({
      scope: app.scope,
      name: 'Finished clip',
      ratio: '9:16',
      start: 0,
      end: 20,
    });
    const scope = { ...app.scope, clipId: clip.id };
    await mkdir(join(clip.path, 'output'), { recursive: true });
    const output = join(clip.path, 'output', 'render.mp4');
    await writeFile(output, 'Validated by the media adapter in production.');
    await app.store.setRenderedPath(scope, output);
    await app.git.commit(clip.path, 'Save rendered clip', 'Record a fresh output for upload preparation.');
    if (!app.workspace.video) throw new Error('Fixture missing video');
    const current = await app.store.openWorkspace(app.scope);
    await app.store.saveWorkspace({
      scope: app.scope,
      revision: current.revision,
      documents: [],
      packaging: null,
      brandConfig: {
        ...current.brand.config,
        platforms: { youtube: { url: 'https://youtube.com/@fixture', browser: 'Arc' } },
      },
      commit: { title: 'Set channel', body: 'Configure the fixture destination.' },
    });
    app.media.probeMedia.mockResolvedValueOnce({
      duration: 20,
      width: 1080,
      height: 1920,
      hasAudio: true,
      format: 'mp4',
    });
    const packaging = { ...app.workspace.video.packaging, titles: { long: [], short: ['Fixture clip'] } };
    const prepared = await app.api.preparePublish({
      scope: app.scope,
      platform: 'youtubeShorts',
      browser: 'Arc',
      packaging,
      clipId: clip.id,
    });
    expect(prepared.session.scope).toEqual(app.scope);
    expect(prepared.session.topic).toBe(`publish:youtubeShorts:${clip.id}`);
    expect(prepared.prompt).toContain(output);
    expect(prepared.prompt).toContain('launch.yml');
    expect(prepared.prompt).not.toContain('launch_status.yml');
  });
});
