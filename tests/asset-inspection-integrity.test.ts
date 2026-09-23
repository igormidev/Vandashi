import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AssetDraft } from '../src/domain/models';
import { AssetStore } from '../src/infrastructure/storage/assets';
import { hashFile } from '../src/infrastructure/storage/files';
import { parseInvocation } from '../src/desktop/validation';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

const fixtures: ApplicationFixture[] = [];
async function setup() {
  const app = await applicationFixture();
  fixtures.push(app);
  const sourcePath = join(app.root, 'selected.ogg');
  await writeFile(sourcePath, 'Recording A');
  app.media.inspectAsset.mockImplementation(async () => ({
    sourceHash: await hashFile(sourcePath),
    kind: 'audio',
    images: [],
    transcript: [{ start: 0, end: 1, text: await readFile(sourcePath, 'utf8'), language: 'en' }],
    note: { frames: 0, sampledSeconds: 1, duration: 1, speech: 'recognized' },
    dispose: () => Promise.resolve(undefined),
  }));
  const described = (title: string) => ({
    threadId: 'metadata',
    turnId: 'metadata',
    status: 'completed' as const,
    error: null,
    output: JSON.stringify({ title, description: `Speech about ${title}`, tags: ['speech'], kind: 'audio' }),
  });
  return { ...app, sourcePath, described };
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(fixtures.splice(0).map((app) => app.cleanup()));
});

describe('reviewed asset source integrity', () => {
  it.each(['model', 'review'] as const)(
    'rejects replacement during %s, preserves the library, and accepts a new inspection',
    async (when) => {
      const app = await setup();
      const originalHash = await hashFile(app.sourcePath);
      const root = await app.store.assetDirectory(app.scope);
      const before = await readdir(root);
      const head = await app.git.head(app.path);
      app.agent.run.mockImplementationOnce(async () => {
        if (when === 'model') await writeFile(app.sourcePath, 'Recording B');
        return app.described('Recording A');
      });
      const draft = await app.api.describeAsset({
        requestId: 'first',
        scope: app.scope,
        path: app.sourcePath,
      });
      expect(draft.sourceHash).toBe(originalHash);
      expect(draft.description).toBe('Speech about Recording A');
      if (when === 'review') await writeFile(app.sourcePath, 'Recording B');
      await expect(app.api.importAsset({ scope: app.scope, draft })).rejects.toMatchObject({
        diagnostic: { kind: 'app', message: { id: 'storageAssetInspectionStale' } },
      });
      expect(await readdir(root)).toEqual(before);
      expect(await app.git.head(app.path)).toBe(head);
      expect((await app.store.openWorkspace(app.scope)).assets).toEqual([]);
      expect(await readFile(app.sourcePath, 'utf8')).toBe('Recording B');
      app.agent.run.mockResolvedValueOnce(app.described('Recording B'));
      const inspected = await app.api.describeAsset({
        requestId: 'second',
        scope: app.scope,
        path: app.sourcePath,
      });
      expect(inspected.sourceHash).toBe(await hashFile(app.sourcePath));
      expect(inspected.sourceHash).not.toBe(draft.sourceHash);
      const imported = await app.api.importAsset({ scope: app.scope, draft: inspected });
      expect(imported.description).toBe('Speech about Recording B');
      expect(imported.hash).toBe(inspected.sourceHash);
      expect(await readFile(imported.path, 'utf8')).toBe('Recording B');
      expect((await app.git.status(app.path)).dirty).toBe(false);
    },
  );

  it('rejects stale inspection before returning an existing duplicate', async () => {
    const app = await setup();
    const matching = join(app.root, 'existing.ogg');
    await writeFile(matching, 'Recording B');
    const existing = await app.api.importAsset({
      scope: app.scope,
      draft: {
        sourcePath: matching,
        title: 'Keep original metadata',
        description: 'Already approved',
        tags: [],
        kind: 'audio',
      },
    });
    app.agent.run.mockResolvedValueOnce(app.described('Recording A'));
    const draft = await app.api.describeAsset({ requestId: 'first', scope: app.scope, path: app.sourcePath });
    await writeFile(app.sourcePath, 'Recording B');
    const head = await app.git.head(app.path);
    await expect(app.api.importAsset({ scope: app.scope, draft })).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'storageAssetInspectionStale' } },
    });
    const assets = (await app.store.openWorkspace(app.scope)).assets;
    expect(assets).toHaveLength(1);
    expect(assets[0]).toMatchObject({
      id: existing.id,
      title: 'Keep original metadata',
      description: 'Already approved',
    });
    expect(await app.git.head(app.path)).toBe(head);
  });

  it('checks copied bytes against the reviewed hash if the source changes after the initial comparison', async () => {
    const app = await setup();
    const root = join(await realpath(app.root), 'isolated-library');
    await mkdir(root);
    const draft: AssetDraft = {
      sourcePath: app.sourcePath,
      sourceHash: await hashFile(app.sourcePath),
      title: 'Recording A',
      description: 'Inspected A',
      tags: [],
      kind: 'audio',
    };
    const store = new AssetStore((path) => path);
    vi.spyOn(store, 'list').mockImplementationOnce(async () => {
      await writeFile(app.sourcePath, 'Recording B');
      return [];
    });
    await expect(store.import(root, draft, false)).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'storageImportSourceChanged' } },
    });
    expect(await readdir(root)).toEqual([]);
    expect(await readFile(app.sourcePath, 'utf8')).toBe('Recording B');
  });

  it('accepts only exact SHA256 tokens at IPC while retaining intentional manual import', () => {
    const input = {
      scope: { brandId: 'brand', videoId: null, clipId: null },
      draft: { sourcePath: '/selected.ogg', title: 'Manual title', description: '', tags: [], kind: 'audio' },
    };
    expect(() => parseInvocation('importAsset', [input])).not.toThrow();
    expect(
      parseInvocation('importAsset', [{ ...input, draft: { ...input.draft, sourceHash: 'a'.repeat(64) } }])
        .args,
    ).toEqual([{ ...input, draft: { ...input.draft, sourceHash: 'a'.repeat(64) } }]);
    for (const sourceHash of ['a'.repeat(63), 'A'.repeat(64), '', null, 123])
      expect(() =>
        parseInvocation('importAsset', [{ ...input, draft: { ...input.draft, sourceHash } }]),
      ).toThrow();
  });
});
