import { mkdir, readFile, readdir, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { finishedClipRatio } from '../src/application/finished-clip';
import { PathPermissions } from '../src/desktop/path-permissions';
import { parseInvocation } from '../src/desktop/validation';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

const fixtures: ApplicationFixture[] = [];
async function setup() {
  const app = await applicationFixture();
  fixtures.push(app);
  const sourcePath = join(app.root, 'Finished portrait.mp4');
  await writeFile(sourcePath, 'Original finished clip bytes\0with embedded metadata');
  app.media.probeMedia.mockResolvedValue({
    width: 1080,
    height: 1920,
    duration: 12,
    hasAudio: true,
    format: 'mp4',
  });
  return { ...app, sourcePath, input: { scope: app.scope, sourcePath } };
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(fixtures.splice(0).map((app) => app.cleanup()));
});

describe('finished clip import', () => {
  it.each([
    [1080, 1920, '9:16'],
    [1082, 1920, '9:16'],
    [1080, 1080, '1:1'],
    [1080, 1082, '1:1'],
  ])('classifies measured %s × %s output as %s', (width, height, ratio) => {
    expect(finishedClipRatio({ width, height, duration: 12, hasAudio: true, format: 'mp4' })).toBe(ratio);
  });
  it.each([
    [1080, 1350],
    [1920, 1080],
    [1080, 2000],
  ])('rejects %s × %s without silently changing the aspect label', (width, height) => {
    expect(() => finishedClipRatio({ width, height, duration: 12, hasAudio: true, format: 'mp4' })).toThrow(
      'square 1:1 or portrait 9:16',
    );
  });

  it('preserves imported media in an independent clean release workspace without a fake composition', async () => {
    const app = await setup();
    const original = await readFile(app.sourcePath);
    const parentHead = await app.git.head(app.path);
    const clip = await app.api.importFinishedClip(app.input);
    const scope = { ...app.scope, clipId: clip.id };
    if (!clip.renderedPath) throw new Error('Imported media missing');
    expect(clip).toMatchObject({
      name: 'Finished portrait',
      origin: 'imported',
      ratio: '9:16',
      start: 0,
      end: 12,
    });
    expect(await readFile(clip.renderedPath)).toEqual(original);
    expect(await readFile(app.sourcePath)).toEqual(original);
    expect(await readdir(clip.path)).not.toContain('index.html');
    expect(app.media.seedProject).not.toHaveBeenCalled();
    expect(app.media.createClip).not.toHaveBeenCalled();
    expect(app.agent.run).not.toHaveBeenCalled();
    expect(await app.git.head(app.path)).toBe(parentHead);
    expect((await app.git.status(clip.path)).dirty).toBe(false);
    expect((await app.git.status(app.path)).dirty).toBe(false);
    await expect(app.api.startStudio(scope)).rejects.toThrow('no editable composition');
    await expect(app.api.renderVideo(scope)).rejects.toThrow('already ready');

    const workspace = await app.store.openWorkspace(scope);
    const asset = workspace.assets.find((entry) => entry.path === clip.renderedPath);
    if (!asset) throw new Error('Missing source asset');
    await expect(app.store.deleteAsset({ scope, assetId: asset.id })).rejects.toThrow('.vandashi.yml');
    await app.store.updateAsset({
      scope,
      assetId: asset.id,
      expectedRevision: asset.revision,
      title: 'My finished clip',
      description: 'Approved release',
      tags: ['ready'],
    });
    expect(await readFile(clip.renderedPath)).toEqual(original);
    const current = await app.store.openWorkspace(scope);
    await app.store.saveWorkspace({
      scope,
      revision: current.revision,
      documents: [],
      brandConfig: null,
      packaging: { ...clip.packaging, titles: { long: [], short: ['Ready for release'] } },
      commit: { title: 'Name finished clip', body: 'Set the short-form release title.' },
    });
    await rm(app.sourcePath);
    expect((await app.store.openWorkspace(scope)).video?.renderedPath).toBe(clip.renderedPath);
    await writeFile(clip.renderedPath, 'Changed finished media');
    expect((await app.store.openWorkspace(scope)).video?.renderedPath).toBeNull();
    expect(
      (await app.store.openWorkspace(app.scope)).clips.find((entry) => entry.id === clip.id)?.renderedPath,
    ).toBeNull();
  });

  it('prepares imported square clips through the ordinary reviewed publishing flow', async () => {
    const app = await setup();
    app.media.probeMedia.mockResolvedValue({
      width: 1080,
      height: 1080,
      duration: 12,
      hasAudio: true,
      format: 'mp4',
    });
    await app.store.saveWorkspace({
      scope: app.scope,
      revision: app.workspace.revision,
      documents: [],
      packaging: null,
      brandConfig: {
        ...app.workspace.brand.config,
        platforms: { x: { url: 'https://x.com/approved', browser: 'Chrome' } },
      },
      commit: { title: 'Set channel', body: 'Use the approved publishing account.' },
    });
    const clip = await app.api.importFinishedClip(app.input);
    const result = await app.api.preparePublish({
      scope: app.scope,
      platform: 'x',
      browser: 'Chrome',
      clipId: clip.id,
      packaging: { ...clip.packaging, titles: { long: [], short: ['Reviewed square clip'] } },
    });
    expect(result.session.topic).toBe(`publish:x:${clip.id}`);
    expect(result.prompt).toContain(JSON.stringify(clip.renderedPath));
    expect(result.prompt).toContain('Reviewed square clip');
    expect(app.agent.run).not.toHaveBeenCalled();
  });

  it('removes unpublished files on copy validation or Git failure and permits retry', async () => {
    const app = await setup();
    const directory = join(app.path, 'clips');
    app.media.probeMedia.mockResolvedValueOnce({
      width: 1080,
      height: 1920,
      duration: 12,
      hasAudio: true,
      format: 'mp4',
    });
    app.media.probeMedia.mockRejectedValueOnce(new Error('Copied media truncated'));
    await expect(app.api.importFinishedClip(app.input)).rejects.toThrow('Copied media truncated');
    expect(await readdir(directory)).toEqual([]);
    expect((await app.store.openWorkspace(app.scope)).clips).toEqual([]);
    const commit = vi.spyOn(app.git, 'commit').mockRejectedValueOnce(new Error('Git storage unavailable'));
    await expect(app.api.importFinishedClip(app.input)).rejects.toThrow('Git storage unavailable');
    expect(await readdir(directory)).toEqual([]);
    commit.mockRestore();
    const clip = await app.api.importFinishedClip(app.input);
    expect(clip.name).toBe('Finished portrait');
    expect(await readdir(directory)).toEqual(['Finished portrait']);
    expect((await app.git.status(clip.path)).dirty).toBe(false);
  });

  it('rejects invalid ratios, unselected paths and symlinks without creating a clip', async () => {
    const app = await setup();
    app.media.probeMedia.mockResolvedValueOnce({
      width: 1080,
      height: 1350,
      duration: 12,
      hasAudio: true,
      format: 'mp4',
    });
    await expect(app.api.importFinishedClip(app.input)).rejects.toThrow('square 1:1 or portrait 9:16');
    const link = join(app.root, 'linked.mp4');
    await symlink(app.sourcePath, link);
    await expect(app.api.importFinishedClip({ ...app.input, sourcePath: link })).rejects.toThrow(
      'regular supported',
    );
    expect(await readdir(join(app.path, 'clips'))).toEqual([]);
    const permissions = new PathPermissions(vi.fn(() => Promise.reject(new Error('outside workspace'))));
    await expect(permissions.authorize('importFinishedClip', [app.input])).rejects.toThrow(
      'outside workspace',
    );
    await permissions.grantFile(app.sourcePath);
    await expect(permissions.authorize('importFinishedClip', [app.input])).resolves.toBeUndefined();
    expect(() => parseInvocation('importFinishedClip', [{ ...app.input, ratio: '1:1' }])).toThrow();
  });

  it.each([false, true])(
    'preserves external files inserted during import (validation fails: %s)',
    async (fail) => {
      const app = await setup();
      const destination = join(app.path, 'clips', 'Finished portrait');
      app.media.probeMedia.mockResolvedValueOnce({
        width: 1080,
        height: 1920,
        duration: 12,
        hasAudio: true,
        format: 'mp4',
      });
      app.media.probeMedia.mockImplementationOnce(async () => {
        await writeFile(join(destination, 'script.md'), 'External work must survive');
        if (fail) throw new Error('Copied media invalid');
        return { width: 1080, height: 1920, duration: 12, hasAudio: true, format: 'mp4' };
      });
      await expect(app.api.importFinishedClip(app.input)).rejects.toMatchObject({
        diagnostic: {
          kind: 'app',
          message: { id: 'storageImportFilesPreserved', params: { path: destination } },
        },
      });
      expect(await readFile(join(destination, 'script.md'), 'utf8')).toBe('External work must survive');
      expect(await readdir(destination)).toEqual(['script.md']);
      expect((await app.store.openWorkspace(app.scope)).clips).toEqual([]);
      expect(await readdir(join(app.path, 'clips'))).toEqual(['Finished portrait']);
    },
  );

  it('does not write into or delete a replaced private staging directory', async () => {
    const app = await setup();
    let replacement = '';
    app.media.probeMedia.mockResolvedValueOnce({
      width: 1080,
      height: 1920,
      duration: 12,
      hasAudio: true,
      format: 'mp4',
    });
    app.media.probeMedia.mockImplementationOnce(async (copied) => {
      replacement = dirname(dirname(copied));
      await rename(replacement, `${replacement}-original`);
      await mkdir(replacement);
      await writeFile(join(replacement, 'external.txt'), 'Do not delete this directory');
      return { width: 1080, height: 1920, duration: 12, hasAudio: true, format: 'mp4' };
    });
    await expect(app.api.importFinishedClip(app.input)).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'storageImportStagingChanged' } },
    });
    expect(await readdir(replacement)).toEqual(['external.txt']);
    expect(await readFile(join(replacement, 'external.txt'), 'utf8')).toBe('Do not delete this directory');
    expect((await app.store.openWorkspace(app.scope)).clips).toEqual([]);
  });
});
