import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applicationFixture, type ApplicationFixture } from './application-fixture';
import type { Scope } from '../src/domain/models';
import { AgentError } from '../src/domain/agent';

let app: ApplicationFixture;
let shared: string;
let scopes: Scope[];
let projects: string[];
const filename = 'brand-mark.svg';
async function sharedMark(version: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><title>${version}</title><rect width="10" height="10"/></svg>`;
  await writeFile(join(shared, filename), svg);
  await writeFile(
    join(shared, `${filename}.vandashi.json`),
    JSON.stringify({
      title: version,
      description: `Shared ${version}`,
      tags: ['brand'],
      hash: createHash('sha256').update(svg).digest('hex'),
    }),
  );
}
async function settleShared() {
  await app.git.commit(shared, 'Save shared mark', 'Save authoritative library bytes.');
  for (const scope of scopes) {
    await app.store.openWorkspace(scope);
    await app.git.commit(
      await app.store.projectPath(scope),
      'Sync shared mark',
      'Prepare a consistent copy.',
    );
  }
}
async function expectSynced(version: string) {
  for (const scope of scopes) {
    const workspace = await app.api.openWorkspace(scope);
    expect(workspace.dirty).toBe(false);
    expect(workspace.assets.find((asset) => asset.shared)?.title).toBe(version);
    const root = await app.store.projectPath(scope);
    expect(await readFile(join(root, 'video_assets', '_shared', filename), 'utf8')).toContain(version);
  }
}
beforeEach(async () => {
  app = await applicationFixture();
  shared = await app.store.assetDirectory({ ...app.scope, videoId: null });
  scopes = [app.scope];
  for (const name of ['First excerpt', 'Sibling excerpt']) {
    const clip = await app.store.createClip({ scope: app.scope, name, ratio: '9:16', start: 0, end: 20 });
    scopes.push({ ...app.scope, clipId: clip.id });
  }
  projects = await Promise.all(scopes.map((scope) => app.store.projectPath(scope)));
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

it('includes shared copies in the saved receipt before refresh and keeps next send and Undo usable', async () => {
  app.agent.run.mockImplementationOnce(async (_, emit) => {
    emit({ type: 'thread', threadId: 'shared-thread' });
    emit({ type: 'turn', turnId: 'shared-turn' });
    await sharedMark('New shared mark');
    return { threadId: 'shared-thread', turnId: 'shared-turn', status: 'completed', error: null, output: '' };
  });
  await app.api.sendChat(app.request);
  await app.idle();
  const session = await app.store.getSession(app.session.id);
  const receipt = session.messages.find((message) => message.appMessage?.id === 'turnSaved');
  const expected = [shared, ...projects.map((path) => join(path, 'video_assets', '_shared'))].flatMap(
    (path) => [join(path, filename), join(path, `${filename}.vandashi.json`)],
  );
  expect(receipt?.files.map((file) => file.path)).toEqual(expect.arrayContaining(expected));
  for (const scope of scopes) expect((await app.api.openWorkspace(scope)).dirty).toBe(false);
  await app.api.sendChat({ ...app.request, mode: 'read', text: 'Explain the shared mark.' });
  await app.idle();
  await app.api.undoChat(app.session.id);
  await app.api.undoChat(app.session.id);
  for (const scope of scopes) {
    const workspace = await app.api.openWorkspace(scope);
    expect(workspace.dirty).toBe(false);
    expect(workspace.assets).toHaveLength(0);
  }
  await expect(readFile(join(shared, filename))).rejects.toMatchObject({ code: 'ENOENT' });
});

it.each(['completed', 'interrupted', 'uncertain-start'] as const)(
  'synchronizes authoritative updates from a clip and preserves %s work before releasing the lease',
  async (outcome) => {
    await sharedMark('Original');
    await settleShared();
    const scope = scopes[1];
    if (!scope) throw new Error('Missing clip');
    const session = await app.api.openChat({ scope, topic: 'clip', title: 'First excerpt' });
    app.agent.run.mockImplementationOnce(async (_, emit) => {
      if (outcome !== 'uncertain-start') {
        emit({ type: 'thread', threadId: 'updated-shared' });
        emit({ type: 'turn', turnId: 'updated-shared-turn' });
      }
      await sharedMark('Updated');
      // Exercise agent-created commits too; finalization must still copy their content.
      await app.git.commit(shared, 'Update shared mark', 'Preserve the updated library artwork.');
      if (outcome === 'uncertain-start')
        throw new AgentError('uncertain-start', 'Start acknowledgement lost.');
      return {
        threadId: 'updated-shared',
        turnId: 'updated-shared-turn',
        status: outcome,
        error: null,
        output: '',
      };
    });
    const request = { ...app.request, sessionId: session.id };
    if (outcome === 'uncertain-start')
      await expect(app.api.sendChat(request)).rejects.toThrow('acknowledgement');
    else await app.api.sendChat(request);
    await app.idle();
    await expectSynced('Updated');
    const saved = await app.store.getSession(session.id);
    expect(saved.messages.some((message) => message.appMessage?.id === 'turnSaved')).toBe(
      outcome === 'completed',
    );
    if (outcome !== 'uncertain-start') {
      for (const project of projects)
        expect(saved.checkpoints?.at(-1)?.postHeads?.[project]).toBe(await app.git.head(project));
      await app.api.undoChat(session.id);
      await expectSynced('Original');
    }
    await app.api.sendChat({ ...request, mode: 'read', text: 'Explain the shared asset.' });
    await app.idle();
  },
);

it('settles stale sibling copies before capturing the turn baseline without absorbing manual drafts', async () => {
  await sharedMark('Before');
  await settleShared();
  await sharedMark('Baseline');
  await app.git.commit(
    shared,
    'Revise library',
    'Leave sibling snapshots behind for the next validated operation.',
  );
  const run = app.agent.run.getMockImplementation();
  if (!run) throw new Error('Missing fixture implementation');
  let mainStarted = false;
  app.agent.run.mockImplementation(async (input, emit) => {
    if (input.outputSchema) {
      expect(mainStarted).toBe(true);
      return run(input, emit);
    }
    mainStarted = true;
    for (const project of projects) {
      expect((await app.git.status(project)).dirty).toBe(false);
      expect(await readFile(join(project, 'video_assets', '_shared', filename), 'utf8')).toContain(
        'Baseline',
      );
    }
    emit({ type: 'thread', threadId: 'after-baseline' });
    emit({ type: 'turn', turnId: 'after-baseline-turn' });
    await sharedMark('Turn change');
    return {
      threadId: 'after-baseline',
      turnId: 'after-baseline-turn',
      status: 'completed',
      error: null,
      output: '',
    };
  });
  await app.api.sendChat(app.request);
  await app.idle();
  await expectSynced('Turn change');
  await app.api.undoChat(app.session.id);
  await expectSynced('Baseline');
  const sibling = projects[2];
  if (!sibling) throw new Error('Missing sibling');
  await writeFile(join(sibling, 'script.md'), 'Uncommitted manual work');
  const sync = vi.spyOn(app.store, 'syncSharedAssets');
  await expect(app.api.sendChat(app.request)).rejects.toThrow('Save pending file changes');
  expect(sync).not.toHaveBeenCalled();
  expect(await readFile(join(sibling, 'script.md'), 'utf8')).toBe('Uncommitted manual work');
});

it('commits preserved partial work but withholds verified receipts and Undo when a shared copy conflicts', async () => {
  await sharedMark('Original');
  await settleShared();
  const sibling = projects[2];
  if (!sibling) throw new Error('Missing sibling');
  const copy = join(sibling, 'video_assets', '_shared', filename);
  app.agent.run.mockImplementationOnce(async (_, emit) => {
    emit({ type: 'thread', threadId: 'conflict' });
    emit({ type: 'turn', turnId: 'conflict-turn' });
    await sharedMark('Updated');
    await writeFile(copy, 'Conflicting copy bytes to preserve');
    return { threadId: 'conflict', turnId: 'conflict-turn', status: 'completed', error: null, output: '' };
  });
  await app.api.sendChat(app.request);
  await app.idle();
  for (const project of [shared, ...projects]) expect((await app.git.status(project)).dirty).toBe(false);
  expect(await readFile(copy, 'utf8')).toBe('Conflicting copy bytes to preserve');
  const saved = await app.store.getSession(app.session.id);
  expect(saved.checkpoints?.at(-1)?.postHeads).toBeUndefined();
  expect(saved.messages.some((message) => message.appMessage?.id === 'turnSaved')).toBe(false);
  expect(app.events.find((event) => event.type === 'notice' && event.code === 'save-failed')).toMatchObject({
    diagnostic: { kind: 'app', message: { id: 'storageSharedCopyConflict' } },
  });
  await expect(app.api.undoChat(app.session.id)).rejects.toThrow('no verified file checkpoint');
});

it('rejects a conflicting baseline before any model call or conversation mutation', async () => {
  await sharedMark('Original');
  await settleShared();
  await sharedMark('New baseline');
  await app.git.commit(shared, 'Revise shared mark', 'Save the updated library.');
  const sibling = projects[2];
  if (!sibling) throw new Error('Missing sibling');
  const copy = join(sibling, 'video_assets', '_shared', filename);
  await writeFile(copy, 'A separately committed customized copy');
  await app.git.commit(sibling, 'Customize snapshot', 'Preserve external committed work.');
  const history = await app.store.getSession(app.session.id);
  const events = app.events.length;
  await expect(app.api.sendChat(app.request)).rejects.toMatchObject({
    diagnostic: { kind: 'app', message: { id: 'storageSharedCopyConflict' } },
  });
  expect(app.agent.run).not.toHaveBeenCalled();
  expect(await app.store.getSession(app.session.id)).toEqual(history);
  expect(app.events.slice(events).filter((event) => event.type === 'workspace-changed')).toEqual([
    { type: 'workspace-changed', scope: app.scope },
  ]);
  expect(await readFile(copy, 'utf8')).toBe('A separately committed customized copy');
  for (const project of projects) expect((await app.git.status(project)).dirty).toBe(false);
});

it('retains the original operation lease through final copy synchronization', async () => {
  let active = false;
  let release: () => void = () => undefined;
  let enter: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const sync = app.store.syncSharedAssets.bind(app.store);
  vi.spyOn(app.store, 'syncSharedAssets').mockImplementation(async (scope) => {
    if (active) {
      enter();
      await held;
    }
    await sync(scope);
  });
  app.agent.run.mockImplementationOnce(async (_, emit) => {
    emit({ type: 'thread', threadId: 'held-sync' });
    emit({ type: 'turn', turnId: 'held-sync-turn' });
    await sharedMark('Held');
    active = true;
    return { threadId: 'held-sync', turnId: 'held-sync-turn', status: 'completed', error: null, output: '' };
  });
  await app.api.sendChat(app.request);
  await entered;
  try {
    await expect(app.api.sendChat(app.request)).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'appOperationBusy' } },
    });
    expect(
      app.events.some((event) => event.type === 'chat' && event.message.appMessage?.id === 'turnSaved'),
    ).toBe(false);
  } finally {
    release();
  }
  await app.idle();
  await expectSynced('Held');
});
