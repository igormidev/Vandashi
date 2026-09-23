import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { referenceText } from '../src/renderer/features/chat/mention-document';

describe('parent asset references from independent clip repositories', () => {
  let directory = '';
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('protects exact encoded parent references without confusing same-named clip assets', async () => {
    directory = await mkdtemp(join(tmpdir(), 'vandashi-parent-assets-'));
    const git = new LocalGit();
    const storage = new LocalStorage(join(directory, 'settings'), git);
    const brand = await storage.createBrand({ parentPath: directory, name: 'Parent assets' });
    const video = await storage.createVideo({ brandId: brand.id, name: 'Parent', ratio: '16:9' });
    const sourcePath = join(directory, 'ambience final.ogg');
    await writeFile(sourcePath, 'Original sound bytes');
    const asset = await storage.importAsset({
      scope: video.scope,
      draft: { sourcePath, title: 'Ambience', description: '', tags: [], kind: 'audio' },
    });
    const clip = await storage.createClip({
      scope: video.scope,
      name: 'Child',
      ratio: '9:16',
      start: 0,
      end: 1,
    });
    const childAsset = join(clip.path, 'video_assets', 'ambience final.ogg');
    await writeFile(childAsset, 'Independent clip sound');
    await mkdir(join(clip.path, 'scenes'));
    const scene = join(clip.path, 'scenes', 'opening.html');
    await writeFile(scene, '<audio src="../../../video_assets/ambience%20final.ogg"></audio>');
    await writeFile(join(clip.path, 'script.md'), '[Ambience](../../video_assets/ambience&#32;final.ogg)');
    await git.commit(clip.path, 'Use parent sound', 'Reference the parent asset from nested clip sources.');
    const parent = await storage.projectPath(video.scope);
    const before = {
      media: await readFile(asset.path),
      sidecar: await readFile(`${asset.path}.vandashi.json`),
      parentHead: await git.head(parent),
      childHead: await git.head(clip.path),
    };
    await expect(
      storage.deleteAsset({ scope: video.scope, assetId: asset.id, expectedRevision: asset.revision }),
    ).rejects.toThrow('clips/Child/scenes/opening.html, clips/Child/script.md');
    expect(await readFile(asset.path)).toEqual(before.media);
    expect(await readFile(`${asset.path}.vandashi.json`)).toEqual(before.sidecar);
    expect(await git.head(parent)).toBe(before.parentHead);
    expect(await git.head(clip.path)).toBe(before.childHead);
    await writeFile(scene, '<audio src="../video_assets/ambience%20final.ogg"></audio>');
    await writeFile(join(clip.path, 'script.md'), '[Ambience](video_assets/ambience%20final.ogg)');
    const outside = join(directory, 'outside.md');
    await writeFile(outside, asset.path);
    await symlink(outside, join(clip.path, 'outside.md'));
    await git.commit(
      clip.path,
      'Use own sound',
      'Remove parent references and retain the independent sound.',
    );
    const childHead = await git.head(clip.path);
    await storage.deleteAsset({ scope: video.scope, assetId: asset.id, expectedRevision: asset.revision });
    await expect(readFile(asset.path)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(readFile(`${asset.path}.vandashi.json`)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(childAsset, 'utf8')).toBe('Independent clip sound');
    expect(await git.head(clip.path)).toBe(childHead);
    expect(await git.head(parent)).not.toBe(before.parentHead);
    expect((await git.status(parent)).dirty).toBe(false);
  });

  it.each(['raw Windows', 'serialized Windows', 'JSON unicode Windows'] as const)(
    'protects %s parent paths while allowing the same-named child asset',
    async (encoding) => {
      directory = await mkdtemp(join(tmpdir(), 'vandashi-windows-asset-paths-'));
      const git = new LocalGit();
      const storage = new LocalStorage(join(directory, 'settings'), git);
      const brand = await storage.createBrand({ parentPath: directory, name: 'Windows paths' });
      const video = await storage.createVideo({ brandId: brand.id, name: 'Parent', ratio: '16:9' });
      const sourcePath = join(directory, 'ambience final.ogg');
      await writeFile(sourcePath, 'Parent source bytes');
      const asset = await storage.importAsset({
        scope: video.scope,
        draft: { sourcePath, title: 'Sound', description: '', tags: [], kind: 'audio' },
      });
      const clip = await storage.createClip({
        scope: video.scope,
        name: 'Child',
        ratio: '9:16',
        start: 0,
        end: 1,
      });
      const childAsset = join(clip.path, 'video_assets', 'ambience final.ogg');
      await writeFile(childAsset, 'Independent child bytes');
      const reference = join(clip.path, 'scene.json');
      const encode = (path: string): string => {
        const windows = path.replaceAll('/', '\\');
        if (encoding === 'raw Windows') return `<audio src="${windows}">`;
        const serialized = JSON.stringify({ media: windows });
        return encoding === 'serialized Windows' ? serialized : serialized.replaceAll('\\\\', '\\u005c');
      };
      await writeFile(reference, encode('../../video_assets/ambience final.ogg'));
      await git.commit(clip.path, 'Reference parent sound', 'Keep an explicit Windows-encoded parent path.');
      const parent = await storage.projectPath(video.scope);
      const heads = [await git.head(parent), await git.head(clip.path)];
      const bytes = [await readFile(asset.path), await readFile(`${asset.path}.vandashi.json`)];
      await expect(
        storage.deleteAsset({ scope: video.scope, assetId: asset.id, expectedRevision: asset.revision }),
      ).rejects.toThrow('clips/Child/scene.json');
      expect([await git.head(parent), await git.head(clip.path)]).toEqual(heads);
      expect([await readFile(asset.path), await readFile(`${asset.path}.vandashi.json`)]).toEqual(bytes);
      await writeFile(reference, encode('video_assets/ambience final.ogg'));
      await git.commit(clip.path, 'Use child sound', 'Remove the actual parent reference.');
      const childHead = await git.head(clip.path);
      await storage.deleteAsset({ scope: video.scope, assetId: asset.id, expectedRevision: asset.revision });
      expect(await readFile(childAsset, 'utf8')).toBe('Independent child bytes');
      expect(await git.head(clip.path)).toBe(childHead);
      await expect(readFile(asset.path)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it.each(['x64.png', 'u1234.wav'])(
    'preserves the exact %s basename in native and serialized Windows references',
    async (name) => {
      directory = await mkdtemp(join(tmpdir(), 'vandashi-windows-literal-basename-'));
      const git = new LocalGit();
      const storage = new LocalStorage(join(directory, 'settings'), git);
      const brand = await storage.createBrand({ parentPath: directory, name: 'Literal paths' });
      const video = await storage.createVideo({ brandId: brand.id, name: 'Parent', ratio: '16:9' });
      const sourcePath = join(directory, name);
      const kind = name.endsWith('.png') ? 'image' : 'audio';
      await writeFile(
        sourcePath,
        kind === 'image'
          ? Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
              'base64',
            )
          : 'Parent sound bytes',
      );
      const asset = await storage.importAsset({
        scope: video.scope,
        draft: { sourcePath, title: name, description: '', tags: [], kind },
      });
      const clip = await storage.createClip({
        scope: video.scope,
        name: 'Child',
        ratio: '9:16',
        start: 0,
        end: 1,
      });
      const childAsset = join(clip.path, 'video_assets', name);
      await writeFile(childAsset, 'Independent child bytes');
      const encodings: Record<string, (path: string) => string> = {
        'raw.md': (path) => `<${path}>`,
        'reference-text.md': (path) => referenceText({ name, path, kind }),
        'json.json': (path) => JSON.stringify({ media: path }),
        'json-unicode.json': (path) => JSON.stringify({ media: path }).replaceAll('\\\\', '\\u005c'),
        'javascript-hex.js': (path) => `"${path.replaceAll('\\', '\\x5c')}"`,
        'percent.html': (path) => `<audio src="${path.replaceAll('\\', '%5c')}">`,
        'entity.html': (path) => `<audio src="${path.replaceAll('\\', '&#92;')}">`,
      };
      for (const [file, encode] of Object.entries(encodings))
        await writeFile(join(clip.path, file), encode(`..\\..\\video_assets\\${name}`));
      await git.commit(clip.path, 'Use parent media', 'Cover literal and encoded Windows separators.');
      const parent = await storage.projectPath(video.scope);
      const heads = [await git.head(parent), await git.head(clip.path)];
      const bytes = [await readFile(asset.path), await readFile(`${asset.path}.vandashi.json`)];
      await expect(
        storage.deleteAsset({ scope: video.scope, assetId: asset.id, expectedRevision: asset.revision }),
      ).rejects.toThrow(
        Object.keys(encodings)
          .map((file) => `clips/Child/${file}`)
          .sort()
          .join(', '),
      );
      expect([await git.head(parent), await git.head(clip.path)]).toEqual(heads);
      expect([await readFile(asset.path), await readFile(`${asset.path}.vandashi.json`)]).toEqual(bytes);
      for (const [file, encode] of Object.entries(encodings))
        await writeFile(join(clip.path, file), encode(`video_assets\\${name}`));
      await git.commit(clip.path, 'Use independent media', 'Remove every actual parent reference.');
      const childHead = await git.head(clip.path);
      await storage.deleteAsset({ scope: video.scope, assetId: asset.id, expectedRevision: asset.revision });
      expect(await readFile(childAsset, 'utf8')).toBe('Independent child bytes');
      expect(await git.head(clip.path)).toBe(childHead);
      await expect(readFile(asset.path)).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(`${asset.path}.vandashi.json`)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );
});
