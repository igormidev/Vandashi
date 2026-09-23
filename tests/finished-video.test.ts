import { readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applicationFixture, type ApplicationFixture } from './application-fixture';
import { finishedVideoRatio } from '../src/application/finished-video';
import { PathPermissions } from '../src/desktop/path-permissions';
import { parseInvocation } from '../src/desktop/validation';

const fixtures: ApplicationFixture[] = [];
async function setup() {
  const app = await applicationFixture();
  fixtures.push(app);
  const source = join(app.root, 'finished.mp4');
  await writeFile(source, 'Original media bytes\0with embedded tags');
  return {
    ...app,
    source,
    input: { brandId: app.scope.brandId, name: 'Finished release', sourcePath: source },
  };
}
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((app) => app.cleanup()));
});

describe('finished video import', () => {
  it.each([
    [1920, 1080, '16:9'],
    [1080, 1920, '9:16'],
    [1920, 1082, '16:9'],
  ])('detects supported %s × %s media with pixel rounding', (width, height, ratio) => {
    expect(
      finishedVideoRatio({
        width,
        height,
        duration: 10,
        hasAudio: true,
        format: 'mp4',
      }),
    ).toBe(ratio);
  });
  it.each([
    [1080, 1080],
    [1080, 1350],
    [1920, 800],
    [-1920, -1080],
    [2, 2],
  ])('rejects unsupported %s × %s media', (width, height) => {
    expect(() =>
      finishedVideoRatio({ width, height, duration: 10, hasAudio: false, format: 'mp4' }),
    ).toThrow();
  });
  it('copies media unchanged into a clean release workspace without seeding or rendering', async () => {
    const app = await setup();
    const original = await readFile(app.source);
    const imported = await app.api.importFinishedVideo(app.input);
    const video = imported.video;
    if (!video?.renderedPath) throw new Error('Imported media missing');
    expect(video.origin).toBe('imported');
    expect(video.ratio).toBe('16:9');
    expect(imported.dirty).toBe(false);
    expect(await readFile(video.renderedPath)).toEqual(original);
    expect(await readdir(video.path)).not.toContain('index.html');
    expect(app.media.seedProject).not.toHaveBeenCalled();
    expect(app.media.renderVideo).not.toHaveBeenCalled();
    await expect(app.api.startStudio(imported.scope)).rejects.toThrow('no editable composition');
    await expect(app.api.renderVideo(imported.scope)).rejects.toThrow('already ready');
    const sourceAsset = imported.assets.find((asset) => asset.path === video.renderedPath);
    if (!sourceAsset) throw new Error('Imported asset metadata missing');
    await expect(app.store.deleteAsset({ scope: imported.scope, assetId: sourceAsset.id })).rejects.toThrow(
      '.vandashi.yml',
    );
    await app.store.updateAsset({
      scope: imported.scope,
      assetId: sourceAsset.id,
      expectedRevision: sourceAsset.revision,
      title: 'Edited metadata',
      description: 'Prepared for release',
      tags: ['release'],
    });
    expect(await readFile(video.renderedPath)).toEqual(original);
    await rm(app.source);
    expect((await app.store.openWorkspace(imported.scope)).video?.renderedPath).toBe(video.renderedPath);
    await app.store.saveWorkspace({
      scope: imported.scope,
      revision: (await app.store.openWorkspace(imported.scope)).revision,
      documents: [],
      brandConfig: null,
      packaging: { ...video.packaging, titles: { long: ['Ready to upload'], short: [] } },
      commit: { title: 'Name release', body: 'Set the upload title.' },
    });
    expect((await app.store.openWorkspace(imported.scope)).video?.renderedPath).toBe(video.renderedPath);
    await writeFile(video.renderedPath, 'Changed actual finished video');
    expect((await app.store.openWorkspace(imported.scope)).video?.renderedPath).toBeNull();
  });
  it('keeps a failed copy validation invisible and removes its reserved and temporary folders', async () => {
    const app = await setup();
    app.media.probeMedia.mockRejectedValueOnce(new Error('No video stream'));
    await expect(app.api.importFinishedVideo(app.input)).rejects.toThrow('No video stream');
    app.media.probeMedia.mockResolvedValueOnce({
      duration: 60,
      width: 1920,
      height: 1080,
      hasAudio: true,
      format: 'mp4',
    });
    app.media.probeMedia.mockRejectedValueOnce(new Error('Copied file was truncated'));
    await expect(app.api.importFinishedVideo(app.input)).rejects.toThrow('Copied file was truncated');
    expect((await app.store.listVideos(app.scope.brandId)).map((video) => video.name)).toEqual(['Video']);
    expect(await readdir(join(app.workspace.brand.path, 'videos'))).toEqual(['Video']);
    expect(await readFile(app.source, 'utf8')).toContain('Original media');
  });
  it('does not adopt an existing project or follow a source symlink', async () => {
    const app = await setup();
    await expect(app.api.importFinishedVideo({ ...app.input, name: 'Video' })).rejects.toThrow();
    await expect(app.api.importFinishedVideo({ ...app.input, name: '.Hidden' })).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'storageInvalidName' } },
    });
    const link = join(app.root, 'linked.mp4');
    await symlink(app.source, link);
    await expect(app.api.importFinishedVideo({ ...app.input, sourcePath: link })).rejects.toThrow(
      'regular supported',
    );
    expect((await app.store.listVideos(app.scope.brandId)).map((video) => video.name)).toEqual(['Video']);
  });
  it('cleans an unpublished repository if Git cannot save the import', async () => {
    const app = await setup();
    vi.spyOn(app.git, 'commit').mockRejectedValueOnce(new Error('Git storage unavailable'));
    await expect(app.api.importFinishedVideo(app.input)).rejects.toThrow('Git storage unavailable');
    expect(await readdir(join(app.workspace.brand.path, 'videos'))).toEqual(['Video']);
  });
  it('requires a native selection grant and strict import arguments', async () => {
    const app = await setup();
    const permissions = new PathPermissions(vi.fn(() => Promise.reject(new Error('outside workspace'))));
    await expect(permissions.authorize('importFinishedVideo', [app.input])).rejects.toThrow(
      'outside workspace',
    );
    await permissions.grantFile(app.source);
    await expect(permissions.authorize('importFinishedVideo', [app.input])).resolves.toBeUndefined();
    expect(() => parseInvocation('importFinishedVideo', [{ ...app.input, ratio: '1:1' }])).toThrow();
    expect(() =>
      parseInvocation('importFinishedVideo', [{ ...app.input, sourcePath: 'bad\0path' }]),
    ).toThrow();
  });
});
