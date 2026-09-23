import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExifTool } from 'exiftool-vendored';
import NodeID3 from 'node-id3';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { AssetStore } from '../src/infrastructure/storage/assets';
import { hashFile } from '../src/infrastructure/storage/files';
import type { Scope } from '../src/domain/models';

const pixel = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

describe('asset persistence and metadata', () => {
  let directory = '';
  let storage: LocalStorage;
  let scope: Scope;
  let source = '';
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vandashi-assets-'));
    storage = new LocalStorage(join(directory, 'settings'), new LocalGit());
    const brand = await storage.createBrand({ parentPath: directory, name: 'Asset Studio' });
    scope = { brandId: brand.id, videoId: null, clipId: null };
    source = join(directory, 'original.png');
    await writeFile(source, pixel);
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('embeds verified image metadata into the imported copy and deduplicates original bytes', async () => {
    const originalHash = await hashFile(source);
    const draft = {
      sourcePath: source,
      title: 'Blue planet',
      description: 'A reusable scientific background.',
      tags: ['#background', 'science', 'science'],
      kind: 'image' as const,
    };
    const asset = await storage.importAsset({ scope, draft });
    expect(asset.hash).toBe(originalHash);
    expect(await hashFile(source)).toBe(originalHash);
    expect(asset.tags).toEqual(['background', 'science']);
    const tool = new ExifTool({ maxProcs: 1 });
    try {
      const tags = await tool.read(asset.path);
      expect(tags.Title).toBe(draft.title);
      expect(tags.Description).toBe(draft.description);
      expect(tags.Subject).toEqual(['background', 'science']);
    } finally {
      await tool.end();
    }
    const duplicate = await storage.importAsset({ scope, draft: { ...draft, title: 'Different title' } });
    expect(duplicate.id).toBe(asset.id);
    expect((await storage.openWorkspace(scope)).assets).toHaveLength(1);
    const updated = await storage.updateAsset({
      scope,
      assetId: asset.id,
      expectedRevision: asset.revision,
      title: 'Earth',
      description: 'New metadata',
      tags: ['planet'],
      commit: { title: 'Clarify planetary artwork', body: 'Identify Earth and add the selected planet tag.' },
    });
    expect(updated.hash).toBe(originalHash);
    expect(updated.title).toBe('Earth');
    expect((await storage.openWorkspace(scope)).dirty).toBe(false);
    const root = await storage.assetDirectory(scope);
    const history = await new LocalGit().history(root, 0);
    expect(history.commits[0]?.title).toBe('Clarify planetary artwork');
    expect(history.commits[0]?.body).toBe('Identify Earth and add the selected planet tag.');
    await writeFile(join(root, 'external.png'), await readFile(updated.path));
    const external = (await storage.openWorkspace(scope)).assets.find(
      (item) => item.relativePath === 'external.png',
    );
    expect(external?.title).toBe('Earth');
    expect(external?.description).toBe('New metadata');
  });

  it('exposes shared assets in an isolated subtree without overwriting same-named local media', async () => {
    const draft = {
      sourcePath: source,
      title: 'Shared',
      description: 'Reusable',
      tags: ['shared'],
      kind: 'image' as const,
    };
    await storage.importAsset({ scope, draft });
    const video = await storage.createVideo({ brandId: scope.brandId, name: 'Assets', ratio: '16:9' });
    const root = await storage.assetDirectory(video.scope);
    await writeFile(join(root, 'original.png'), pixel);
    const workspace = await storage.openWorkspace(video.scope);
    expect(workspace.assets.map((asset) => asset.relativePath).sort()).toEqual([
      '_shared/original.png',
      'original.png',
    ]);
    expect(workspace.assets.find((asset) => asset.shared)?.description).toBe('Reusable');
    expect(await readFile(join(root, 'original.png'))).toEqual(pixel);
    const copied = workspace.assets.find((asset) => asset.shared);
    if (!copied) throw new Error('Expected shared copy');
    await expect(
      storage.updateAsset({
        scope: video.scope,
        assetId: copied.id,
        expectedRevision: copied.revision,
        title: 'Wrong place',
        description: '',
        tags: [],
      }),
    ).rejects.toThrow('shared library');
  });

  it('indexes nested folder metadata and preserves unsupported media bytes with sidecars', async () => {
    const root = await storage.assetDirectory(scope);
    await mkdir(join(root, 'audio'));
    const audio = join(root, 'audio', 'tone.ogg');
    await writeFile(audio, 'Fixture for an unsupported embedding container');
    await writeFile(
      `${audio}.vandashi.json`,
      JSON.stringify({
        title: 'Gentle tone',
        description: 'Soft transition cue',
        tags: ['transition'],
        hash: await hashFile(audio),
      }),
    );
    const assets = new AssetStore((path) => path);
    const indexed = await assets.list(root, true);
    expect(indexed[0]?.relativePath).toBe('audio/tone.ogg');
    expect(indexed[0]?.description).toBe('Soft transition cue');
    const item = indexed[0];
    if (!item) throw new Error('Expected audio fixture');
    const before = await hashFile(audio);
    await assets.update(
      root,
      item.id,
      { title: 'Gentle tone', description: 'A transition', tags: ['sound'], expectedRevision: item.revision },
      true,
    );
    expect(await hashFile(audio)).toBe(before);
  });

  it('preserves edits to a materialized shared copy and reports a synchronization conflict', async () => {
    await storage.importAsset({
      scope,
      draft: { sourcePath: source, title: 'Shared', description: '', tags: [], kind: 'image' },
    });
    const video = await storage.createVideo({ brandId: scope.brandId, name: 'Conflicts', ratio: '16:9' });
    const local = join(await storage.assetDirectory(video.scope), '_shared', 'original.png');
    await writeFile(local, 'Locally edited copy');
    await expect(storage.openWorkspace(video.scope)).rejects.toThrow('local shared copy');
    expect(await readFile(local, 'utf8')).toBe('Locally edited copy');
  });

  it('propagates authoritative shared metadata updates while retaining removed assets in older videos', async () => {
    const asset = await storage.importAsset({
      scope,
      draft: {
        sourcePath: source,
        title: 'Shared mark',
        description: 'Original',
        tags: ['brand'],
        kind: 'image',
      },
    });
    const video = await storage.createVideo({
      brandId: scope.brandId,
      name: 'Shared updates',
      ratio: '16:9',
    });
    await storage.updateAsset({
      scope,
      assetId: asset.id,
      expectedRevision: asset.revision,
      title: 'Updated shared mark',
      description: 'Reviewed description',
      tags: ['##identity', 'identity'],
    });
    const synced = await storage.openWorkspace(video.scope);
    expect(synced.assets[0]?.title).toBe('Updated shared mark');
    expect(synced.assets[0]?.description).toBe('Reviewed description');
    expect(synced.assets[0]?.tags).toEqual(['identity']);
    expect(synced.dirty).toBe(true);
    await storage.deleteAsset({ scope, assetId: asset.id });
    expect((await storage.openWorkspace(scope)).assets).toHaveLength(0);
    const retained = (await storage.openWorkspace(video.scope)).assets[0];
    expect(retained?.title).toBe('Updated shared mark');
    expect(retained?.shared).toBe(true);
  });

  it('stores only rendered files contained within the current project', async () => {
    const video = await storage.createVideo({ brandId: scope.brandId, name: 'Rendered', ratio: '16:9' });
    const project = await storage.projectPath(video.scope);
    await mkdir(join(project, 'output'));
    const rendered = join(project, 'output', 'final.mp4');
    await writeFile(rendered, 'Rendered output fixture');
    await storage.setRenderedPath(video.scope, rendered);
    expect((await storage.openWorkspace(video.scope)).video?.renderedPath).toBe(rendered);
    await expect(storage.setRenderedPath(video.scope, source)).rejects.toThrow('outside');
    expect(await readFile(join(project, '.vandashi.yml'), 'utf8')).toContain(
      'renderedPath: output/final.mp4',
    );
    const git = new LocalGit();
    await git.commit(project, 'Record render', 'Record the current export.');
    const current = await storage.openWorkspace(video.scope);
    if (!current.video) throw new Error('Expected video');
    await storage.saveWorkspace({
      scope: video.scope,
      revision: current.revision,
      documents: [],
      brandConfig: null,
      packaging: { ...current.video.packaging, titles: { long: ['Revised title'], short: [] } },
      commit: { title: 'Update title', body: 'Change packaging without changing rendered content.' },
    });
    expect((await storage.openWorkspace(video.scope)).video?.renderedPath).toBe(rendered);
    await writeFile(join(project, 'index.html'), '<main>Changed composition</main>');
    expect((await storage.openWorkspace(video.scope)).video?.renderedPath).toBeNull();
    await git.commit(project, 'Change composition', 'Revise the visual scene.');
    const changed = await storage.openWorkspace(video.scope);
    expect(changed.video?.renderedPath).toBeNull();
    expect(changed.revision).not.toBe(current.revision);
    expect(await readFile(rendered, 'utf8')).toBe('Rendered output fixture');
    await storage.setRenderedPath(video.scope, rendered);
    expect((await storage.openWorkspace(video.scope)).video?.renderedPath).toBe(rendered);
  });

  it('blocks deletion for nested and encoded scene references and identifies the affected source files', async () => {
    const namedSource = join(directory, 'mark final.png');
    await writeFile(namedSource, pixel);
    const video = await storage.createVideo({ brandId: scope.brandId, name: 'References', ratio: '16:9' });
    const asset = await storage.importAsset({
      scope: video.scope,
      draft: { sourcePath: namedSource, title: 'Mark', description: '', tags: [], kind: 'image' },
    });
    const project = await storage.projectPath(video.scope);
    await mkdir(join(project, '.hyperframes'));
    await mkdir(join(project, 'src'));
    const native = join(project, '.hyperframes', 'studio-manual-edits.json');
    const scene = join(project, 'src', 'scene.html');
    await writeFile(native, JSON.stringify({ media: 'video_assets/mark%20final.png' }));
    await writeFile(scene, '<img src="../video_assets/mark&#32;final.png">');
    await expect(storage.deleteAsset({ scope: video.scope, assetId: asset.id })).rejects.toThrow(
      '.hyperframes/studio-manual-edits.json, src/scene.html',
    );
    expect(await readFile(asset.path)).not.toHaveLength(0);
    await writeFile(native, '{}');
    await writeFile(scene, '<main>Asset removed from scene</main>');
    await storage.deleteAsset({ scope: video.scope, assetId: asset.id });
    expect((await storage.openWorkspace(video.scope)).assets).toHaveLength(0);
  });

  it('copies a chosen brand image into identity history and stores a portable reference', async () => {
    const workspace = await storage.openWorkspace(scope);
    const saved = await storage.saveWorkspace({
      scope,
      revision: workspace.revision,
      documents: [],
      packaging: null,
      brandConfig: { ...workspace.brand.config, image: source },
      commit: {
        title: 'Choose brand image',
        body: 'Store the selected image with the portable brand identity.',
      },
    });
    expect(saved.brand.config.image).toBe('brand_icon.png');
    const identity = join(saved.brand.path, 'brand_identity');
    expect(await readFile(join(identity, saved.brand.config.image))).toEqual(pixel);
    expect(await readFile(source)).toEqual(pixel);
    expect(saved.dirty).toBe(false);
    expect((await new LocalGit().history(identity, 0)).commits[0]?.files.map((file) => file.path)).toContain(
      'brand_icon.png',
    );
    await expect(
      storage.saveWorkspace({
        scope,
        revision: saved.revision,
        documents: [],
        packaging: null,
        brandConfig: { ...saved.brand.config, image: '../private.png' },
        commit: { title: 'Invalid path', body: 'Should not write a traversing reference.' },
      }),
    ).rejects.toThrow('outside');
  });

  it('writes MP3 ID3 metadata while preserving the original compressed audio bytes', async () => {
    const audioPath = join(directory, 'audio.mp3');
    const frame = Buffer.alloc(417);
    frame.set([0xff, 0xfb, 0x90, 0x64]);
    const audio = Buffer.concat([frame, frame, frame]);
    await writeFile(audioPath, audio);
    const imported = await storage.importAsset({
      scope,
      draft: {
        sourcePath: audioPath,
        title: 'Ambient cue',
        description: 'A soft entrance',
        tags: ['ambient'],
        kind: 'audio',
      },
    });
    const tags = await NodeID3.Promise.read(imported.path);
    expect(tags.title).toBe('Ambient cue');
    expect(tags.comment?.text).toBe('A soft entrance');
    expect(tags.userDefinedText?.find((tag) => tag.description === 'Vandashi tags')?.value).toBe(
      '["ambient"]',
    );
    const importedBytes = await readFile(imported.path);
    const audioOffset = 10 + importedBytes.subarray(6, 10).reduce((size, byte) => (size << 7) | byte, 0);
    expect(importedBytes.subarray(audioOffset)).toEqual(audio);
    expect(await readFile(audioPath)).toEqual(audio);
  });
});
