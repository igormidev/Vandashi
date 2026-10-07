import { afterEach, expect, it, vi } from 'vitest';
import { ChatQueue } from '../src/application/chat-queue';
import { OperationGate } from '../src/application/operation-gate';
import type { ChatRequest } from '../src/domain/models';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let fixture: ApplicationFixture | undefined;
afterEach(async () => {
  await fixture?.cleanup();
  fixture = undefined;
});

it('removes an editable request atomically and rejects stale edits before and after the next dispatch', async () => {
  const f = await applicationFixture();
  fixture = f;
  const gate = new OperationGate();
  const releaseFirst = gate.acquire(f.session.id);
  let acknowledge: (() => void) | undefined;
  let releaseNext: (() => void) | undefined;
  const sent: ChatRequest[] = [];
  const queue = new ChatQueue(
    f.store,
    gate,
    (request) => {
      sent.push(request);
      releaseNext = gate.acquire(request.sessionId);
      return new Promise<void>((resolve) => {
        acknowledge = resolve;
      });
    },
    (event) => {
      f.events.push(event);
    },
  );
  const first = { ...f.request, clientMessageId: crypto.randomUUID(), text: 'Edit before dispatch' };
  const second = { ...f.request, clientMessageId: crypto.randomUUID(), text: 'Next exact request' };
  await queue.enqueue(first);
  await queue.enqueue(second);
  await queue.remove({ sessionId: f.session.id, id: first.clientMessageId });
  expect(queue.list(f.session.id).map((entry) => entry.request.text)).toEqual(['Next exact request']);
  releaseFirst();
  queue.settle();
  expect(sent).toEqual([second]);
  await expect(queue.remove({ sessionId: f.session.id, id: second.clientMessageId })).rejects.toThrow();
  acknowledge?.();
  await vi.waitFor(() => {
    expect(queue.list(f.session.id)).toEqual([]);
  });
  await expect(queue.remove({ sessionId: f.session.id, id: second.clientMessageId })).rejects.toThrow();
  await expect(queue.remove({ sessionId: f.session.id, id: first.clientMessageId })).rejects.toThrow();
  expect(sent).toHaveLength(1);
  releaseNext?.();
});

it('never treats a missing or foreign-session queue entry as an editable owned draft', async () => {
  const f = await applicationFixture();
  fixture = f;
  const gate = new OperationGate();
  const release = gate.acquire(f.session.id);
  const queue = new ChatQueue(
    f.store,
    gate,
    () => Promise.resolve(),
    () => undefined,
  );
  const request = { ...f.request, clientMessageId: crypto.randomUUID(), text: 'Session-bound draft' };
  await queue.enqueue(request);
  await expect(queue.remove({ sessionId: 'other-session', id: request.clientMessageId })).rejects.toThrow();
  expect(queue.list(f.session.id)).toHaveLength(1);
  const clone = queue.list(f.session.id)[0];
  if (!clone) throw new Error('Missing owned queue entry');
  clone.request.text = 'Renderer changed snapshot';
  expect(queue.list(f.session.id)[0]?.request.text).toBe('Session-bound draft');
  await queue.remove({ sessionId: f.session.id, id: request.clientMessageId });
  expect(queue.list(f.session.id)).toEqual([]);
  release();
});
