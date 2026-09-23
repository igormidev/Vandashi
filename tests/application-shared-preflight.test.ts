import { createHash } from 'node:crypto';
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applicationFixture, type ApplicationFixture } from './application-fixture';
import type { Clip } from '../src/domain/models';

let app: ApplicationFixture;
let child: Clip;
let shared: string;
let identity: string;

async function tree(root: string): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.name === '.git') continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) Object.assign(result, await tree(path));
    else result[path] = (await readFile(path)).toString('base64');
  }
  return result;
}

beforeEach(async () => {
  app = await applicationFixture();
  child = await app.store.createClip({
    scope: app.scope,
    name: 'Child',
    ratio: '9:16',
    start: 0,
    end: 20,
  });
  identity = join(app.workspace.brand.path, 'brand_identity');
  shared = join(app.workspace.brand.path, 'shared_assets');
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><title>Pending shared copy</title></svg>';
  await writeFile(join(shared, 'new.svg'), svg);
  await writeFile(
    join(shared, 'new.svg.vandashi.json'),
    JSON.stringify({
      title: 'Pending shared copy',
      description: 'A newly committed library asset.',
      tags: [],
      hash: createHash('sha256').update(svg).digest('hex'),
    }),
  );
  await app.git.commit(shared, 'Add a shared asset', 'Leave parent and child snapshots stale.');
});

afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

it.each(['parent', 'child', 'packaging', 'manifest', 'brand config'] as const)(
  'rejects dirty %s without writing shared copies, recovering YAML, or changing history',
  async (target) => {
    const dirtyPath = {
      parent: join(app.path, 'script.md'),
      child: join(child.path, 'script.md'),
      packaging: join(app.path, 'video_packaging.yml'),
      manifest: join(child.path, '.vandashi.yml'),
      'brand config': join(identity, 'brand_config.yml'),
    }[target];
    await writeFile(dirtyPath, 'Unfinished manual draft: [');
    const before = await tree(app.workspace.brand.path);
    const history = await app.store.getSession(app.session.id);
    const repositories = [identity, shared, app.path, child.path];
    const heads = await Promise.all(repositories.map((path) => app.git.head(path)));
    const index = await Promise.all(repositories.map((path) => app.git.indexEntries(path)));
    const sync = vi.spyOn(app.store, 'syncSharedAssets');
    const events = app.events.length;
    await expect(app.api.sendChat(app.request)).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'appSaveBeforeAi' } },
    });
    expect(sync).not.toHaveBeenCalled();
    expect(app.agent.run).not.toHaveBeenCalled();
    expect(app.agent.capabilities).not.toHaveBeenCalled();
    expect(await tree(app.workspace.brand.path)).toEqual(before);
    expect(await Promise.all(repositories.map((path) => app.git.head(path)))).toEqual(heads);
    expect(await Promise.all(repositories.map((path) => app.git.indexEntries(path)))).toEqual(index);
    expect(await app.store.getSession(app.session.id)).toEqual(history);
    expect(app.events.slice(events).filter((event) => event.type === 'workspace-changed')).toEqual([]);
  },
);

it('checks dirty selected publishing clips before workspace hydration can synchronize the parent', async () => {
  const session = await app.api.openChat({
    scope: app.scope,
    topic: `publish:youtubeShorts:${child.id}`,
    title: 'Publish child',
  });
  await writeFile(join(child.path, 'video_packaging.yml'), 'Draft packaging: [');
  const before = await tree(app.workspace.brand.path);
  const open = vi.spyOn(app.store, 'openWorkspace');
  const events = app.events.length;
  await expect(app.api.sendChat({ ...app.request, sessionId: session.id })).rejects.toMatchObject({
    diagnostic: { kind: 'app', message: { id: 'appSaveBeforeAi' } },
  });
  expect(open).not.toHaveBeenCalled();
  expect(app.agent.run).not.toHaveBeenCalled();
  expect(await tree(app.workspace.brand.path)).toEqual(before);
  expect(app.events.slice(events).filter((event) => event.type === 'workspace-changed')).toEqual([]);
});

it('keeps a deleted child manifest in clean preflight using only its committed identity', async () => {
  await unlink(join(child.path, '.vandashi.yml'));
  const before = await tree(app.workspace.brand.path);
  await expect(app.api.sendChat(app.request)).rejects.toMatchObject({
    diagnostic: { kind: 'app', message: { id: 'appSaveBeforeAi' } },
  });
  expect(await tree(app.workspace.brand.path)).toEqual(before);
  expect(app.agent.run).not.toHaveBeenCalled();
});

it('refreshes once when later preparation fails after baseline synchronization', async () => {
  const history = await app.store.getSession(app.session.id);
  const events = app.events.length;
  app.agent.capabilities.mockRejectedValueOnce(new Error('Provider is unavailable'));
  await expect(app.api.sendChat(app.request)).rejects.toThrow('Provider is unavailable');
  expect(app.agent.run).not.toHaveBeenCalled();
  expect(await app.store.getSession(app.session.id)).toEqual(history);
  expect(app.events.slice(events).filter((event) => event.type === 'workspace-changed')).toEqual([
    { type: 'workspace-changed', scope: app.scope },
  ]);
  for (const project of [app.path, child.path]) {
    expect(await readFile(join(project, 'video_assets', '_shared', 'new.svg'), 'utf8')).toContain(
      'Pending shared copy',
    );
    expect((await app.git.status(project)).dirty).toBe(false);
  }
});
