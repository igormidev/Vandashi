import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applicationFixture, type ApplicationFixture } from './application-fixture';
import type { AssetInspectionLease } from '../src/domain/asset-inspection';
let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});
function evidence(): AssetInspectionLease {
  return {
    sourceHash: 'a'.repeat(64),
    kind: 'video',
    images: [{ path: '/tmp/evidence/frame.png', seconds: 45 }],
    transcript: [{ start: 0, end: 4, text: 'A bicycle beside a house', language: 'en' }],
    note: { frames: 1, sampledSeconds: 90, duration: 600, speech: 'recognized' },
    dispose: vi.fn(() => Promise.resolve(undefined)),
  };
}
it('passes actual frame attachments and bounded speech evidence to Luna, and cleans up after completion', async () => {
  const lease = evidence();
  app.media.inspectAsset.mockResolvedValueOnce(lease);
  app.agent.run.mockResolvedValueOnce({
    threadId: 'helper',
    turnId: 'helper',
    status: 'completed',
    error: null,
    output: '{"title":"Bicycle","description":"A blue bicycle","tags":["travel"],"kind":"image"}',
  });
  const draft = await app.api.describeAsset({
    requestId: 'inspection',
    scope: app.scope,
    path: '/tmp/source.mp4',
  });
  expect(draft.kind).toBe('video');
  expect(draft.sourceHash).toBe(lease.sourceHash);
  expect(draft.inspection).toEqual(lease.note);
  const request = app.agent.run.mock.calls[0]?.[0];
  expect(request?.attachments).toEqual(['/tmp/evidence/frame.png']);
  expect(request?.prompt).toContain('A bicycle beside a house');
  expect(request?.prompt).toContain('"seconds":45');
  expect(request?.prompt).toContain('Never infer sound, music genre');
  expect(request?.prompt).toContain('partial samples');
  expect(lease.dispose).toHaveBeenCalledOnce();
});
it('requires manual fallback for no evidence and releases evidence even if the AI fails', async () => {
  const lease = evidence();
  lease.images = [];
  lease.transcript = [];
  lease.kind = 'audio';
  app.media.inspectAsset.mockResolvedValueOnce(lease);
  await expect(
    app.api.describeAsset({ requestId: 'inspection', scope: app.scope, path: '/tmp/silence.wav' }),
  ).rejects.toThrow('No reliable');
  expect(app.agent.run).not.toHaveBeenCalled();
  expect(lease.dispose).toHaveBeenCalledOnce();
  const second = evidence();
  app.media.inspectAsset.mockResolvedValueOnce(second);
  app.agent.run.mockRejectedValueOnce(new Error('Disconnected'));
  await expect(
    app.api.describeAsset({ requestId: 'inspection', scope: app.scope, path: '/tmp/source.mp4' }),
  ).rejects.toThrow('Disconnected');
  expect(second.dispose).toHaveBeenCalledOnce();
});
