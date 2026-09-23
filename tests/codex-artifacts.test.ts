import { mkdir, mkdtemp, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CodexAgent } from '../src/infrastructure/codex/client';
import type { RpcClient, RpcNotification } from '../src/infrastructure/codex/transport';
import { PathPermissions } from '../src/desktop/path-permissions';

class ArtifactClient implements RpcClient {
  readonly listeners = new Set<(event: RpcNotification) => void>();
  responseThread = 'thread-one';
  constructor(readonly items: Record<string, unknown>[]) {}
  request(method: string): Promise<unknown> {
    if (method === 'thread/read') return Promise.resolve({ thread: { id: this.responseThread } });
    if (method === 'thread/turns/list')
      return Promise.resolve({ data: [{ id: 'turn-one', items: this.items }], nextCursor: null });
    if (method === 'model/list')
      return Promise.resolve({
        data: [
          {
            id: 'test',
            model: 'test',
            displayName: 'Test',
            description: '',
            supportedReasoningEfforts: [{ reasoningEffort: 'medium' }],
            defaultReasoningEffort: 'medium',
            isDefault: true,
          },
        ],
        nextCursor: null,
      });
    if (method === 'thread/resume') return Promise.resolve({ thread: { id: 'thread-one' } });
    if (method === 'turn/start') {
      queueMicrotask(() => {
        for (const item of this.items)
          this.emit('item/completed', { threadId: 'thread-one', turnId: 'turn-one', item });
        this.emit('turn/completed', {
          threadId: 'thread-one',
          turn: { id: 'turn-one', status: 'completed', items: [] },
        });
      });
      return Promise.resolve({ turn: { id: 'turn-one' } });
    }
    return Promise.resolve({});
  }
  private emit(method: string, params: unknown): void {
    for (const listener of this.listeners) listener({ method, params });
  }
  subscribe(listener: (event: RpcNotification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onFailure(): () => void {
    return () => undefined;
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

describe('provider image capabilities', () => {
  let root = '';
  let home = '';
  let image = '';
  const completed = (path: string, extra: Record<string, unknown> = {}) => ({
    id: 'image-one',
    type: 'imageGeneration',
    status: 'completed',
    failure: null,
    savedPath: path,
    ...extra,
  });
  const createAgent = (items: Record<string, unknown>[], configuredHome: string | undefined = home) => {
    const client = new ArtifactClient(items);
    return {
      client,
      agent: new CodexAgent({
        transportFactory: () =>
          Promise.resolve({
            client,
            version: 'test',
            ...(configuredHome ? { codexHome: configuredHome } : {}),
          }),
      }),
    };
  };
  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'vandashi-artifact-')));
    home = join(root, 'configured-codex');
    image = join(home, 'generated_images', 'thread-one', 'image-one.png');
    await mkdir(dirname(image), { recursive: true });
    await writeFile(image, 'provider image');
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('restores an exact grant only after reading the matching provider history', async () => {
    const { agent } = createAgent([completed(image)]);
    const permissions = new PathPermissions(
      () => Promise.reject(new Error('outside workspace')),
      (path) => agent.generatedImage(path),
    );
    await expect(permissions.file(image)).rejects.toThrow('outside workspace');
    await agent.readThread('thread-one');
    await expect(permissions.file(image)).resolves.toBe(image);
    await expect(permissions.file(join(dirname(image), 'other.png'))).rejects.toThrow('outside workspace');
    // App restart starts with no trusted grants, even when the same file still exists.
    const reopened = createAgent([completed(image)]).agent;
    await expect(reopened.generatedImage(image)).resolves.toBeNull();
    await reopened.readThread('thread-one');
    await expect(reopened.generatedImage(image)).resolves.toBe(image);
  });

  it('registers completed live tool results before the renderer receives them', async () => {
    const { agent } = createAgent([completed(image)]);
    const seen: Promise<string | null>[] = [];
    await agent.run(
      {
        threadId: 'thread-one',
        cwd: root,
        writableRoots: [root],
        mode: 'edit',
        selection: { model: 'test', reasoning: 'medium', fast: false },
        prompt: 'Generate',
        attachments: [],
      },
      (event) => {
        if (event.type === 'message' && event.message.generatedImages) seen.push(agent.generatedImage(image));
      },
    );
    expect(await Promise.all(seen)).toEqual([image]);
  });

  it('rejects sibling threads, mismatched item names, failures, unfinished images, and arbitrary Markdown', async () => {
    const { agent } = createAgent([
      completed(image, { id: 'different-item' }),
      completed(image, { status: 'in_progress' }),
      completed(image, { status: 'failed' }),
      completed(image, { failure: { type: 'usageLimitExceeded' } }),
      completed(join(home, 'generated_images', 'other-thread', 'image-one.png')),
      completed(join(home, 'auth.json')),
      { id: 'image-one', type: 'agentMessage', text: `![image](${image})`, generatedImages: [image] },
      { id: 'image-one', type: 'commandExecution', aggregatedOutput: image, generatedImages: [image] },
    ]);
    await agent.readThread('thread-one');
    for (const path of [
      image,
      join(home, 'generated_images', 'other-thread', 'image-one.png'),
      join(home, 'auth.json'),
    ])
      await expect(agent.generatedImage(path)).resolves.toBeNull();
  });

  it('does not trust a returned history for a different thread or an absent configured Codex home', async () => {
    const mismatch = createAgent([completed(image)]);
    mismatch.client.responseThread = 'other-thread';
    await expect(mismatch.agent.readThread('thread-one')).rejects.toThrow('different conversation');
    await expect(mismatch.agent.generatedImage(image)).resolves.toBeNull();
    const noHome = createAgent([completed(image)], '');
    await noHome.agent.readThread('thread-one');
    await expect(noHome.agent.generatedImage(image)).resolves.toBeNull();
  });

  it.each(['file', 'thread', 'images', 'home'])(
    'rejects a %s symlink, including replacements after a grant',
    async (part) => {
      const { agent } = createAgent([completed(image)]);
      await agent.readThread('thread-one');
      await expect(agent.generatedImage(image)).resolves.toBe(image);
      const target =
        part === 'file'
          ? image
          : part === 'thread'
            ? dirname(image)
            : part === 'images'
              ? join(home, 'generated_images')
              : home;
      await rename(target, `${target}-moved`);
      await symlink(`${target}-moved`, target, part === 'file' ? 'file' : 'junction');
      await expect(agent.generatedImage(image)).resolves.toBeNull();
    },
  );

  it('rejects non-regular files and permits a missing exact artifact only when it reappears', async () => {
    const { agent } = createAgent([completed(image)]);
    await agent.readThread('thread-one');
    await rm(image);
    await expect(agent.generatedImage(image)).resolves.toBeNull();
    await mkdir(image);
    await expect(agent.generatedImage(image)).resolves.toBeNull();
    await rm(image, { recursive: true });
    await writeFile(image, 'restored image');
    await expect(agent.generatedImage(image)).resolves.toBe(image);
  });
});
