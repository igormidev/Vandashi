import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { applicationFixture } from './application-fixture';

export async function publishSessionFixture() {
  const app = await applicationFixture();
  const workspace = await app.store.openWorkspace(app.scope);
  await app.store.saveWorkspace({
    scope: app.scope,
    revision: workspace.revision,
    documents: [],
    packaging: null,
    brandConfig: {
      ...workspace.brand.config,
      platforms: { youtube: { url: 'https://youtube.com/@fixture', browser: 'Chrome' } },
    },
    commit: { title: 'Configure publication', body: 'Use a deterministic test destination.' },
  });
  const clip = await app.store.createClip({
    scope: app.scope,
    name: 'Publication excerpt',
    ratio: '9:16',
    start: 0,
    end: 20,
  });
  const scope = { ...app.scope, clipId: clip.id };
  await mkdir(join(clip.path, 'renders'), { recursive: true });
  const renderedPath = join(clip.path, 'renders', 'ready.mp4');
  await writeFile(renderedPath, 'Media probe is supplied by the test port.');
  await app.store.setRenderedPath(scope, renderedPath);
  await app.git.commit(clip.path, 'Save export', 'Record the source-matched exported clip.');
  app.media.probeMedia.mockResolvedValue({
    duration: 20,
    width: 1080,
    height: 1920,
    hasAudio: true,
    format: 'mp4',
  });
  await app.api.updateLaunch({
    scope: app.scope,
    launch: {
      platform: 'youtube',
      status: 'uploaded',
      url: 'https://youtube.com/watch?v=older',
      clipId: null,
    },
  });
  const prepared = await app.api.preparePublish({
    scope: app.scope,
    clipId: clip.id,
    platform: 'youtubeShorts',
    browser: 'Chrome',
    packaging: { ...clip.packaging, titles: { long: [], short: ['Reviewed excerpt'] } },
  });
  prepared.session = await app.store.getSession(prepared.session.id);
  return {
    app,
    clip,
    scope,
    renderedPath,
    prepared,
    request: { ...app.request, sessionId: prepared.session.id, text: prepared.prompt },
  };
}
export type PublishSessionFixture = Awaited<ReturnType<typeof publishSessionFixture>>;
