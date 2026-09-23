import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AgentRunResult } from '../src/domain/agent';
import type { AssetInspectionLease } from '../src/domain/asset-inspection';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

it('cancels only the matching media inspection and retains the lease until worker cleanup', async () => {
  let signal: AbortSignal | undefined;
  let finish: (() => void) | undefined;
  app.media.inspectAsset.mockImplementationOnce((_path, _progress, current) => {
    signal = current;
    return new Promise((_resolve, reject) => {
      finish = () => {
        reject(new Error('Worker stopped'));
      };
    });
  });
  const pending = app.api.describeAsset({ scope: app.scope, path: '/tmp/speech.wav', requestId: 'audio' });
  const rejected = expect(pending).rejects.toMatchObject({
    diagnostic: { kind: 'app', message: { id: 'mediaInspectionCancelled' } },
  });
  await vi.waitFor(() => {
    expect(signal).toBeDefined();
  });
  await app.api.cancelAssetInspection('stale-request');
  expect(signal?.aborted).toBe(false);
  let settled = false;
  const cancellation = app.api.cancelAssetInspection('audio').then(() => {
    settled = true;
  });
  expect(signal?.aborted).toBe(true);
  await expect(app.api.suggestCommit({ scope: app.scope, summary: 'Unrelated' })).rejects.toMatchObject({
    diagnostic: { message: { id: 'appOperationBusy' } },
  });
  expect(settled).toBe(false);
  expect(app.agent.stop).not.toHaveBeenCalled();
  finish?.();
  await Promise.all([rejected, cancellation]);
  await app.idle();
  expect(app.agent.run).not.toHaveBeenCalled();
  expect((await app.store.openWorkspace(app.scope)).assets).toHaveLength(0);
});

it('interrupts its description helper, discards a racing completion, and waits for evidence disposal', async () => {
  let complete: ((result: AgentRunResult) => void) | undefined;
  let releaseEvidence: (() => void) | undefined;
  const dispose = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        releaseEvidence = resolve;
      }),
  );
  const lease: AssetInspectionLease = {
    sourceHash: 'a'.repeat(64),
    kind: 'image',
    images: [{ path: '/tmp/image.png', seconds: 0 }],
    transcript: [],
    note: { frames: 1, sampledSeconds: 0, duration: 0, speech: 'none' },
    dispose,
  };
  app.media.inspectAsset.mockResolvedValueOnce(lease);
  app.agent.run.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        complete = resolve;
      }),
  );
  const pending = app.api.describeAsset({ scope: app.scope, path: '/tmp/image.png', requestId: 'image' });
  const rejected = expect(pending).rejects.toMatchObject({
    diagnostic: { message: { id: 'mediaInspectionCancelled' } },
  });
  await vi.waitFor(() => {
    expect(app.agent.run).toHaveBeenCalledOnce();
  });
  const cancellation = app.api.cancelAssetInspection('image');
  expect(app.agent.stop).toHaveBeenCalledOnce();
  complete?.({
    threadId: 'helper',
    turnId: 'turn',
    status: 'completed',
    error: null,
    output: '{"title":"Too late","description":"Discard this result","tags":[],"kind":"image"}',
  });
  await vi.waitFor(() => {
    expect(dispose).toHaveBeenCalledOnce();
  });
  await expect(app.api.suggestCommit({ scope: app.scope, summary: 'Unrelated' })).rejects.toMatchObject({
    diagnostic: { message: { id: 'appOperationBusy' } },
  });
  releaseEvidence?.();
  await Promise.all([rejected, cancellation]);
  await app.api.cancelAssetInspection('image');
  expect(app.agent.stop).toHaveBeenCalledOnce();
  await app.idle();
});
