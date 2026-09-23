import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { indexAssets, filterAssets } from '../src/renderer/features/assets/asset-index';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

describe('asset path and conversation scope boundaries', () => {
  it.each(['local', 'shared'])(
    'retains legitimate storage-named subfolders from the real %s asset index',
    async (library) => {
      const scope = library === 'local' ? app.scope : { ...app.scope, videoId: null };
      const directory = await app.store.assetDirectory(scope);
      for (const folder of ['assets', 'video_assets', 'shared_assets']) {
        await mkdir(join(directory, folder));
        await writeFile(join(directory, folder, 'reference.txt'), `Reference inside ${folder}`);
      }
      const actual = (await app.store.openWorkspace(scope)).assets;
      expect(actual.map((asset) => asset.relativePath).sort()).toEqual([
        'assets/reference.txt',
        'shared_assets/reference.txt',
        'video_assets/reference.txt',
      ]);
      const index = indexAssets(actual);
      const filters = { query: '', folder: '', kinds: ['other'] as const, tag: '' };
      const browse = { ...filters, kinds: [...filters.kinds] };
      expect(filterAssets(index, browse)).toEqual({
        assets: [],
        folders: ['assets', 'shared_assets', 'video_assets'],
      });
      for (const folder of ['assets', 'video_assets', 'shared_assets'])
        expect(filterAssets(index, { ...browse, folder }).assets.map((asset) => asset.path)).toEqual([
          join(directory, folder, 'reference.txt'),
        ]);
    },
  );

  it.each(['read', 'edit'] as const)(
    'rejects a deleted asset chat in %s mode without starting a turn or changing its transcript',
    async (mode) => {
      const file = join(await app.store.assetDirectory(app.scope), 'reference.txt');
      await writeFile(file, 'A media reference');
      await app.git.commit(
        app.path,
        'Add reference asset',
        'Create the selected asset for this conversation.',
      );
      const selected = (await app.store.openWorkspace(app.scope)).assets.find((asset) => asset.path === file);
      if (!selected) throw new Error('Missing fixture asset');
      const session = await app.api.openChat({
        scope: app.scope,
        topic: `asset:${selected.id}`,
        title: selected.title,
      });
      await app.api.sendChat({ ...app.request, sessionId: session.id, mode, text: 'Describe this asset.' });
      await app.idle();
      await app.store.deleteAsset({ scope: app.scope, assetId: selected.id });
      const before = await app.store.getSession(session.id);
      const heads = await Promise.all(
        (await app.store.repositories(app.scope)).map((path) => app.git.head(path)),
      );
      const script = await readFile(join(app.path, 'script.md'), 'utf8');
      const messages = app.events.filter((event) => event.type === 'chat').length;
      app.agent.run.mockClear();
      await expect(
        app.api.sendChat({ ...app.request, sessionId: session.id, mode, text: 'Edit its description.' }),
      ).rejects.toThrow('asset for this conversation no longer exists');
      expect(app.agent.run).not.toHaveBeenCalled();
      expect(await app.store.getSession(session.id)).toEqual(before);
      expect(app.events.filter((event) => event.type === 'chat')).toHaveLength(messages);
      expect(
        await Promise.all((await app.store.repositories(app.scope)).map((path) => app.git.head(path))),
      ).toEqual(heads);
      expect(await readFile(join(app.path, 'script.md'), 'utf8')).toBe(script);
      expect((await app.git.status(app.path)).dirty).toBe(false);
    },
  );
});
