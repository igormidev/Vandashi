import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { vi } from 'vitest';
import type { AgentPort } from '../src/domain/agent';
import type { MediaPort } from '../src/domain/media';
import type { AppEvent, ChatRequest } from '../src/domain/models';
import { createBackend, type HostMethods } from '../src/application/backend';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import type { TranscriptionPort } from '../src/domain/transcription';

export async function applicationFixture(transcription?: TranscriptionPort) {
  const root = await mkdtemp(join(tmpdir(), 'vandashi-application-'));
  const git = new LocalGit();
  const store = new LocalStorage(join(root, 'settings'), git);
  const brand = await store.createBrand({ parentPath: root, name: 'Application Test' });
  const workspace = await store.createVideo({ brandId: brand.id, name: 'Video', ratio: '16:9' });
  const scope = workspace.scope;
  const path = await store.projectPath(scope);
  let turns = 0;
  const agent = {
    connect: vi.fn<AgentPort['connect']>(() =>
      Promise.resolve({
        connected: true,
        authenticated: true,
        accountType: 'chatgpt',
        usageAllowed: true,
        version: 'test',
      }),
    ),
    models: vi.fn<AgentPort['models']>(() => Promise.resolve([])),
    capabilities: vi.fn<AgentPort['capabilities']>(() =>
      Promise.resolve({ skills: [], plugins: [], browserTools: ['fixture.browser_control'] }),
    ),
    createThread: vi.fn<AgentPort['createThread']>(() => Promise.resolve('thread')),
    readThread: vi.fn<AgentPort['readThread']>((id) => Promise.resolve({ id, messages: [], turnIds: [] })),
    run: vi.fn<AgentPort['run']>((input, event) => {
      if (input.outputSchema)
        return Promise.resolve({
          threadId: 'helper',
          turnId: 'helper',
          status: 'completed',
          error: null,
          output: '{"title":"Save edit","body":"Preserve the video change."}',
        });
      turns += 1;
      const turnId = `turn-${String(turns)}`;
      event({ type: 'thread', threadId: 'thread' });
      event({ type: 'turn', turnId });
      return Promise.resolve({ threadId: 'thread', turnId, status: 'completed', error: null, output: '' });
    }),
    forkBefore: vi.fn<AgentPort['forkBefore']>((_thread, turn) =>
      Promise.resolve({ id: `fork-${turn}`, messages: [], turnIds: [] }),
    ),
    stop: vi.fn<AgentPort['stop']>(() => Promise.resolve(undefined)),
    dispose: vi.fn<AgentPort['dispose']>(),
  } satisfies AgentPort;
  const media = {
    normalizeProject: vi.fn<MediaPort['normalizeProject']>(() => Promise.resolve(undefined)),
    seedProject: vi.fn<MediaPort['seedProject']>(() => Promise.resolve(undefined)),
    startStudio: vi.fn<MediaPort['startStudio']>(() =>
      Promise.resolve({
        url: 'http://127.0.0.1:3000',
        previewUrl: 'http://127.0.0.1:3000/preview/index.html',
        projectPath: path,
        port: 3000,
      }),
    ),
    stopStudio: vi.fn<MediaPort['stopStudio']>(() => Promise.resolve(undefined)),
    renderVideo: vi.fn<MediaPort['renderVideo']>(() => Promise.resolve(join(path, 'output.mp4'))),
    cancelRender: vi.fn<MediaPort['cancelRender']>(() => Promise.resolve(undefined)),
    checks: vi.fn<MediaPort['checks']>(() => Promise.resolve([])),
    probeMedia: vi.fn<MediaPort['probeMedia']>(() =>
      Promise.resolve({ duration: 60, width: 1920, height: 1080, hasAudio: true, format: 'mp4' }),
    ),
    createClip: vi.fn<MediaPort['createClip']>(() => Promise.resolve(undefined)),
    inspectAsset: vi.fn<MediaPort['inspectAsset']>((source) =>
      Promise.resolve({
        sourceHash: 'a'.repeat(64),
        kind: 'image',
        images: [{ path: source, seconds: 0 }],
        transcript: [],
        note: { frames: 1, sampledSeconds: 0, duration: 0, speech: 'none' },
        dispose: () => Promise.resolve(undefined),
      }),
    ),
    audioWaveform: vi.fn<MediaPort['audioWaveform']>(() => Promise.resolve(Array<number>(100).fill(0.5))),
    dispose: vi.fn<MediaPort['dispose']>(() => Promise.resolve(undefined)),
  } satisfies MediaPort;
  const host = {
    chooseDirectory: () => Promise.resolve(null),
    chooseFiles: () => Promise.resolve([]),
    openExternal: () => Promise.resolve(undefined),
    revealPath: () => Promise.resolve(undefined),
    copyImage: () => Promise.resolve(undefined),
    mediaUrl: (value: string) => Promise.resolve(value),
    prepareStudio: vi.fn<(url: string) => Promise<void>>(() => Promise.resolve(undefined)),
    flushStudio: vi.fn<(url: string) => Promise<void>>(() => Promise.resolve(undefined)),
  } satisfies HostMethods;
  const events: AppEvent[] = [];
  const api = createBackend(
    store,
    git,
    agent,
    media,
    host,
    (event) => {
      events.push(event);
    },
    undefined,
    transcription,
  );
  await api.openWorkspace(scope);
  const session = await api.openChat({ scope, topic: 'creation', title: 'Creation' });
  const request: ChatRequest = {
    sessionId: session.id,
    text: 'Make a scene.',
    mode: 'edit',
    selection: (await store.getState()).settings.chat,
    attachments: [],
  };
  return {
    root,
    git,
    store,
    workspace,
    scope,
    path,
    agent,
    media,
    host,
    events,
    api,
    session,
    request,
    cleanup: () => rm(root, { recursive: true, force: true }),
    idle: () =>
      vi.waitFor(
        () => {
          const activity = events.filter((event) => event.type === 'activity').at(-1);
          if (activity?.type !== 'activity' || activity.activity.phase !== 'done')
            throw new Error('Operation still active');
        },
        { timeout: 10_000, interval: 25 },
      ),
  };
}
export type ApplicationFixture = Awaited<ReturnType<typeof applicationFixture>>;
