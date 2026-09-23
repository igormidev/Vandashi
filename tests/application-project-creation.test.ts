import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppFault } from '../src/domain/diagnostics';
import { clipHandoffText } from '../src/domain/clip-handoff';
import { createClipProject, seedProject } from '../src/infrastructure/media/compositions';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
  app.media.seedProject.mockImplementation(seedProject);
  app.media.createClip.mockImplementation((input) => createClipProject(input, app.media.probeMedia));
  const renders = join(app.path, 'renders');
  await mkdir(renders);
  const output = join(renders, 'output.mp4');
  await writeFile(output, 'Fixture source bytes (probe supplied separately)');
  await app.store.setRenderedPath(app.scope, output);
  await app.git.commit(app.path, 'Export parent', 'Save current render reference.');
});
afterEach(async () => {
  await app.idle();
  vi.restoreAllMocks();
  await app.cleanup();
});
const input = () => ({
  scope: app.scope,
  name: 'Prepared clip',
  ratio: '9:16' as const,
  start: 2,
  end: 6,
  prompt: 'Keep the green title centered.',
  selection: app.request.selection,
});

describe('application project acceptance', () => {
  it('retries a video media seed failure without leaving a visible project', async () => {
    app.media.seedProject.mockImplementationOnce(async (path) => {
      await writeFile(join(path, 'unfinished.html'), 'Partial seed');
      throw new Error('Bundled GSAP unavailable');
    });
    const request = { brandId: app.scope.brandId, name: 'Prepared video', ratio: '16:9' as const };
    await expect(app.api.createVideo(request)).rejects.toThrow('GSAP unavailable');
    expect((await app.store.listVideos(app.scope.brandId)).map(({ name }) => name)).toEqual(['Video']);
    const workspace = await app.api.createVideo(request);
    if (!workspace.video) throw new Error('Missing video');
    expect(await readFile(join(workspace.video.path, 'index.html'), 'utf8')).toContain('Prepared video');
    expect((await app.git.status(workspace.video.path)).dirty).toBe(false);
    expect(workspace.dirty).toBe(false);
  });

  it('identifies an accepted video after hydration fails and opens it without creating a duplicate', async () => {
    const open = vi
      .spyOn(app.store, 'openWorkspace')
      .mockRejectedValueOnce(new Error('Asset index temporarily unavailable'));
    const request = { brandId: app.scope.brandId, name: 'Saved video', ratio: '16:9' as const };
    await expect(app.api.createVideo(request)).rejects.toMatchObject({
      diagnostic: {
        kind: 'app',
        message: {
          id: 'storageCreatedVideoUnavailable',
          params: { path: join(app.workspace.brand.path, 'videos', 'Saved video') },
        },
        externalDetail: 'Asset index temporarily unavailable',
      },
    });
    open.mockRestore();
    const video = (await app.api.listVideos(app.scope.brandId)).find(({ name }) => name === request.name);
    if (!video) throw new Error('Accepted video missing');
    expect(await readFile(join(video.path, 'index.html'), 'utf8')).toContain('Saved video');
    expect((await app.git.status(video.path)).dirty).toBe(false);
    await expect(app.api.createVideo(request)).rejects.toThrow('already exists');
    const workspace = await app.api.openWorkspace({ ...app.scope, videoId: video.id });
    expect(workspace.video?.id).toBe(video.id);
    expect(
      (await app.api.listVideos(app.scope.brandId)).filter(({ name }) => name === request.name),
    ).toHaveLength(1);
  });

  it('retries a clip seed failure and starts its chat only after complete publication', async () => {
    app.media.createClip.mockImplementationOnce(async ({ projectPath }) => {
      await writeFile(join(projectPath, 'index.html'), 'Unfinished source extraction');
      throw new Error('Media copy failed');
    });
    await expect(app.api.createClip(input())).rejects.toThrow('Media copy failed');
    expect(await readdir(join(app.path, 'clips'))).toEqual([]);
    expect(app.agent.run).not.toHaveBeenCalled();
    const result = await app.api.createClip(input());
    expect(result.generation.status).toBe('started');
    await app.idle();
    expect(await readFile(join(result.clip.path, 'video_assets', 'original.mp4'), 'utf8')).toContain(
      'Fixture source bytes',
    );
    expect(await readFile(join(result.clip.path, 'index.html'), 'utf8')).toContain('data-media-start="2"');
    expect((await app.git.status(result.clip.path)).dirty).toBe(false);
    expect((await app.store.openWorkspace(app.scope)).clips.map(({ id }) => id)).toEqual([result.clip.id]);
  });

  it.each(['session', 'preflight', 'start', 'refresh'] as const)(
    'preserves the accepted clip and retry prompt when %s fails',
    async (failure) => {
      if (failure === 'session')
        vi.spyOn(app.store, 'saveSession').mockRejectedValueOnce(new Error('Session disk full'));
      if (failure === 'preflight')
        app.agent.capabilities.mockRejectedValueOnce(new AppFault({ id: 'appSaveBeforeAi' }));
      if (failure === 'start') app.agent.run.mockRejectedValueOnce(new Error('Codex authentication expired'));
      if (failure === 'refresh') {
        const read = app.store.openWorkspace.bind(app.store);
        vi.spyOn(app.store, 'openWorkspace').mockImplementation((scope) =>
          scope.clipId ? Promise.reject(new Error('Snapshot temporarily unavailable')) : read(scope),
        );
      }
      const result = await app.api.createClip(input());
      expect(result.generation.status).toBe('failed');
      if (result.generation.status !== 'failed') throw new Error('Expected recoverable chat failure');
      expect(result.generation.handoff).toEqual({
        message: { id: 'clipHandoff', params: { ratio: '9:16', start: 2, end: 6 } },
        guidance: input().prompt,
      });
      if (failure === 'preflight')
        expect(result.generation.diagnostic).toEqual({ kind: 'app', message: { id: 'appSaveBeforeAi' } });
      else expect(result.generation.diagnostic.kind).toBe('external');
      expect(await readFile(join(result.clip.path, 'index.html'), 'utf8')).toContain(
        'data-composition-id="main"',
      );
      expect((await app.git.status(result.clip.path)).dirty).toBe(false);
      expect(await readdir(join(app.path, 'clips'))).toEqual(['Prepared clip']);
      if (failure !== 'start') expect(app.agent.run).not.toHaveBeenCalled();
      vi.restoreAllMocks();
      const workspace = await app.store.openWorkspace({ ...app.scope, clipId: result.clip.id });
      expect(workspace.video?.id).toBe(result.clip.id);
      const session = await app.api.openChat({
        scope: workspace.scope,
        topic: 'clip',
        title: result.clip.name,
      });
      await app.api.sendChat({
        ...app.request,
        sessionId: session.id,
        text: clipHandoffText(result.generation.handoff),
        handoff: result.generation.handoff,
      });
      await app.idle();
      expect((await app.store.openWorkspace(app.scope)).clips).toHaveLength(1);
      expect((await app.git.status(result.clip.path)).dirty).toBe(false);
    },
  );
});
