import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentError } from '../src/domain/agent';
import { applicationFixture, type ApplicationFixture } from './application-fixture';
import { completeAnalysis, transcriptionFixture } from './transcription-fixture';

const apps: ApplicationFixture[] = [];
async function setup() {
  const transcription = transcriptionFixture();
  const app = await applicationFixture(transcription);
  apps.push(app);
  return { ...app, transcription };
}
afterEach(async () => {
  await Promise.all(
    apps.splice(0).map(async (app) => {
      await app.idle();
      await app.cleanup();
    }),
  );
});

it('collects every local audio decision before mutation and rejects a stale reviewed file', async () => {
  const app = await setup();
  const directory = await app.store.assetDirectory(app.scope);
  await writeFile(join(directory, 'narration.ogg'), 'First source');
  await writeFile(join(directory, 'effect.wav'), 'Second source');
  const pending = await app.api.prepareTranscriptions({ scope: app.scope });
  expect(pending.status).toBe('needs-classification');
  if (pending.status !== 'needs-classification') throw new Error('Expected decisions');
  expect(pending.assets).toHaveLength(2);
  expect(app.transcription.analyze).not.toHaveBeenCalled();
  expect(app.transcription.prepare).not.toHaveBeenCalled();
  const choices = pending.assets.map((asset) => ({
    assetId: asset.id,
    revision: asset.revision,
    category: 'dialog' as const,
  }));
  await writeFile(join(directory, 'narration.ogg'), 'Changed after review');
  await expect(
    app.api.prepareTranscriptions({ scope: app.scope, categories: choices }),
  ).rejects.toMatchObject({
    diagnostic: { message: { id: 'appTranscriptionChoiceStale' } },
  });
  expect(app.transcription.analyze).not.toHaveBeenCalled();
  const refreshed = await app.api.prepareTranscriptions({ scope: app.scope });
  if (refreshed.status !== 'needs-classification') throw new Error('Expected decisions');
  await app.api.prepareTranscriptions({
    scope: app.scope,
    categories: refreshed.assets.map((asset) => ({
      assetId: asset.id,
      revision: asset.revision,
      category: 'music',
    })),
  });
  expect(app.transcription.analyze).toHaveBeenCalledTimes(2);
  expect(
    (await app.store.transcriptionAssets({ kind: 'scope', scope: app.scope })).every(
      (asset) => asset.analysis?.transcription.status === 'not-required',
    ),
  ).toBe(true);
  expect((await app.git.status(app.path)).dirty).toBe(false);
});

it('classifies shared sources automatically, saves them, and skips verified evidence on the next launch', async () => {
  const app = await setup();
  const shared = await app.store.assetDirectory({ ...app.scope, videoId: null });
  await writeFile(join(shared, 'speech.ogg'), 'Shared source');
  await expect(app.api.prepareTranscriptions({ scope: null })).resolves.toEqual({ status: 'ready' });
  expect(app.transcription.analyze.mock.calls[0]?.[0].category).toBeUndefined();
  expect((await app.git.status(shared)).dirty).toBe(false);
  await app.api.prepareTranscriptions({ scope: null });
  expect(app.transcription.analyze).toHaveBeenCalledOnce();
});

it('prepares a newly created clip source before the first AI checkpoint without an extra model turn', async () => {
  const app = await setup();
  const child = await app.store.createClip({
    scope: app.scope,
    name: 'Fresh clip',
    ratio: '9:16',
    start: 0,
    end: 2,
  });
  const source = join(child.path, 'video_assets', 'source.mp4');
  await writeFile(source, 'Generated excerpt');
  await app.git.commit(child.path, 'Prepare excerpt', 'Media generated during clip creation.');
  let preparedHead = '';
  app.agent.run.mockImplementationOnce(async (input, emit) => {
    expect(input.outputSchema).toBeUndefined();
    expect(input.prompt).toContain('/app/system/ASSET_TRANSCRIPTION.md');
    expect(await readFile(`${source}.vandashi.json`, 'utf8')).toContain('whisperx');
    expect((await app.git.status(child.path)).dirty).toBe(false);
    preparedHead = await app.git.head(child.path);
    emit({ type: 'thread', threadId: 'prepared' });
    emit({ type: 'turn', turnId: 'prepared-turn' });
    return { threadId: 'prepared', turnId: 'prepared-turn', status: 'completed', output: '', error: null };
  });
  await app.api.sendChat(app.request);
  await app.idle();
  expect(app.agent.run).toHaveBeenCalledOnce();
  expect((await app.store.getSession(app.session.id)).checkpoints?.at(-1)?.heads[child.path]).toBe(
    preparedHead,
  );
  expect(app.transcription.analyze).toHaveBeenCalledOnce();
});

it.each(['completed', 'interrupted', 'uncertain-start'] as const)(
  'repairs agent-committed child audio after %s and includes it in the same recovery boundary',
  async (outcome) => {
    const app = await setup();
    const child = await app.store.createClip({
      scope: app.scope,
      name: 'Child',
      ratio: '9:16',
      start: 0,
      end: 2,
    });
    const source = join(child.path, 'video_assets', 'voice.ogg');
    app.agent.run.mockImplementationOnce(async (_input, emit) => {
      if (outcome !== 'uncertain-start') {
        emit({ type: 'thread', threadId: 'transcription' });
        emit({ type: 'turn', turnId: 'transcription-turn' });
      }
      await writeFile(source, 'Child speech');
      await app.git.commit(child.path, 'Add speech', 'Agent committed media without preparation.');
      if (outcome === 'uncertain-start') throw new AgentError('uncertain-start', 'Process already stopped');
      return {
        threadId: 'transcription',
        turnId: 'transcription-turn',
        status: outcome,
        output: '',
        error: null,
      };
    });
    if (outcome === 'uncertain-start')
      await expect(app.api.sendChat(app.request)).rejects.toThrow('Process already stopped');
    else await app.api.sendChat(app.request);
    await app.idle();
    const metadata = JSON.parse(await readFile(`${source}.vandashi.json`, 'utf8')) as {
      analysis: { transcription: { status: string } };
    };
    expect(metadata.analysis.transcription.status).toBe('complete');
    expect((await app.git.status(child.path)).dirty).toBe(false);
    const saved = await app.store.getSession(app.session.id);
    expect(saved.messages.some((message) => message.appMessage?.id === 'turnSaved')).toBe(
      outcome === 'completed',
    );
    if (outcome !== 'uncertain-start')
      expect(saved.checkpoints?.at(-1)?.postHeads?.[child.path]).toBe(await app.git.head(child.path));
  },
);

it('retains the lease through transcription and saves AI edits without a verified receipt on failure', async () => {
  const app = await setup();
  let fail: (() => void) | undefined;
  app.transcription.analyze.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = () => {
          reject(new Error('Transcription unavailable'));
        };
      }),
  );
  const source = join(await app.store.assetDirectory(app.scope), 'speech.ogg');
  app.agent.run.mockImplementationOnce(async (_input, emit) => {
    emit({ type: 'thread', threadId: 'held' });
    emit({ type: 'turn', turnId: 'held-turn' });
    await writeFile(source, 'Preserve this speech');
    return { threadId: 'held', turnId: 'held-turn', status: 'completed', output: '', error: null };
  });
  await app.api.sendChat(app.request);
  await vi.waitFor(() => {
    expect(fail).toBeDefined();
  });
  try {
    await expect(app.api.sendChat(app.request)).rejects.toMatchObject({
      diagnostic: { message: { id: 'appOperationBusy' } },
    });
    expect(
      app.events.some((event) => event.type === 'chat' && event.message.appMessage?.id === 'turnSaved'),
    ).toBe(false);
  } finally {
    fail?.();
  }
  await app.idle();
  expect(await readFile(source, 'utf8')).toBe('Preserve this speech');
  expect((await app.git.status(app.path)).dirty).toBe(false);
  const saved = await app.store.getSession(app.session.id);
  expect(saved.checkpoints?.at(-1)?.postHeads).toBeUndefined();
  expect(saved.messages.some((message) => message.appMessage?.id === 'turnSaved')).toBe(false);
});

it('does not accept forged renderer analysis or a disguised audio kind on manual import', async () => {
  const app = await setup();
  const sourcePath = join(app.root, 'selected.ogg');
  await writeFile(sourcePath, 'Actual media');
  const draft = {
    sourcePath,
    title: 'Voice',
    description: 'Speech',
    tags: [],
    kind: 'image' as const,
    analysis: completeAnalysis(),
  };
  await expect(app.api.importAsset({ scope: app.scope, draft })).rejects.toMatchObject({
    diagnostic: { message: { id: 'appTranscriptionClassificationRequired' } },
  });
  const saved = await app.api.importAsset({ scope: app.scope, draft: { ...draft, audioCategory: 'dialog' } });
  expect(app.transcription.analyze).toHaveBeenCalledOnce();
  expect(saved.kind).toBe('audio');
  expect(saved.analysis?.sourceHash).not.toBe(draft.analysis.sourceHash);
});
