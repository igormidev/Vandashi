import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ChatQueue } from '../src/application/chat-queue';
import { OperationGate } from '../src/application/operation-gate';
import type { AppEvent, ChatRequest } from '../src/domain/models';
import type { StoragePort } from '../src/domain/storage';
import { interactionValidators } from '../src/desktop/interaction-validation';

function fixture() {
  const gate = new OperationGate();
  const emitted: AppEvent[] = [];
  const send = vi.fn<(request: ChatRequest) => Promise<void>>(() => Promise.resolve());
  const store = { getSession: (id: string) => Promise.resolve({ id, topic: 'brand', messages: [] }) };
  const queue = new ChatQueue(store as unknown as StoragePort, gate, send, (event) => {
    emitted.push(event);
  });
  const request = (text: string, sessionId = 'one'): ChatRequest => ({
    sessionId,
    clientMessageId: crypto.randomUUID(),
    text,
    mode: 'read',
    collaboration: 'plan',
    selection: { model: 'exact-native-model', reasoning: 'high', fast: true },
    attachments: [`/selected/${text}.png`],
  });
  return { queue, gate, send, emitted, request };
}
it('reorders exact owned request snapshots without releasing the active lease or dispatching another turn', async () => {
  const f = fixture();
  const release = f.gate.acquire('one');
  const requests = [f.request('First'), f.request('Second'), f.request('Third')];
  for (const request of requests) await f.queue.enqueue(request);
  const snapshot = f.queue.list('one');
  const ids = snapshot.map((entry) => entry.id);
  requests[0]?.attachments.push('/later/unreviewed');
  const first = snapshot[0];
  if (!first) throw new Error('Missing first intent');
  first.request.text = 'Mutated renderer clone';
  await f.queue.reorder({
    sessionId: 'one',
    reviewedIds: ids,
    ids: [ids[2] ?? '', ids[0] ?? '', ids[1] ?? ''],
  });
  const reordered = f.queue.list('one');
  expect(reordered.map((entry) => entry.request.text)).toEqual(['Third', 'First', 'Second']);
  expect(reordered[1]?.request).toMatchObject({
    text: 'First',
    mode: 'read',
    collaboration: 'plan',
    selection: { model: 'exact-native-model', reasoning: 'high', fast: true },
    attachments: ['/selected/First.png'],
  });
  expect(reordered.every((entry) => !entry.failed)).toBe(true);
  expect(f.gate.owns('one')).toBe(true);
  expect(f.send).not.toHaveBeenCalled();
  expect(f.emitted.at(-1)).toMatchObject({ type: 'chat-queue', sessionId: 'one', entries: reordered });
  release();
});
it('rejects stale, incomplete, duplicate and foreign permutations while preserving other sessions global slots', async () => {
  const f = fixture();
  const releaseOne = f.gate.acquire('one');
  await f.queue.enqueue(f.request('First'));
  releaseOne();
  const releaseOther = f.gate.acquire('other');
  await f.queue.enqueue(f.request('Foreign', 'other'));
  releaseOther();
  const releaseAgain = f.gate.acquire('one');
  await f.queue.enqueue(f.request('Second'));
  releaseAgain();
  const initial = f.queue.list('one').map((entry) => entry.id);
  const foreign = f.queue.list('other')[0];
  if (!foreign) throw new Error('Missing foreign intent');
  for (const ids of [
    [initial[0] ?? ''],
    [initial[0] ?? '', initial[0] ?? ''],
    [initial[0] ?? '', foreign.id],
    [...initial, crypto.randomUUID()],
  ])
    await expect(f.queue.reorder({ sessionId: 'one', reviewedIds: initial, ids })).rejects.toThrow();
  await expect(f.queue.reorder({ sessionId: 'other', reviewedIds: initial, ids: initial })).rejects.toThrow();
  await f.queue.reorder({ sessionId: 'one', reviewedIds: initial, ids: initial.toReversed() });
  await expect(f.queue.reorder({ sessionId: 'one', reviewedIds: initial, ids: initial })).rejects.toThrow();
  expect(f.queue.list('other')).toEqual([foreign]);
  const actual: string[] = [];
  f.send.mockImplementation((request) => {
    actual.push(request.text);
    return Promise.resolve();
  });
  f.queue.settle();
  await vi.waitFor(() => {
    expect(f.queue.hasPending).toBe(false);
  });
  expect(actual).toEqual(['Second', 'Foreign', 'First']);
});
it('rejects every reorder once dispatch starts and retains the global lease through acknowledgement', async () => {
  const f = fixture();
  const release = f.gate.acquire('one');
  await f.queue.enqueue(f.request('First'));
  await f.queue.enqueue(f.request('Second'));
  release();
  let finish: (() => void) | undefined;
  const acknowledgement = new Promise<void>((resolve) => {
    finish = resolve;
  });
  f.send.mockImplementation((request) => f.gate.run(request.sessionId, () => acknowledgement));
  const reviewedIds = f.queue.list('one').map((entry) => entry.id);
  f.queue.settle();
  expect(f.gate.owns('one')).toBe(true);
  await expect(
    f.queue.reorder({ sessionId: 'one', reviewedIds, ids: reviewedIds.toReversed() }),
  ).rejects.toThrow();
  await expect(f.queue.reorder({ sessionId: 'foreign', reviewedIds: [], ids: [] })).rejects.toThrow();
  expect(f.queue.list('one').map((entry) => entry.id)).toEqual(reviewedIds);
  finish?.();
  await vi.waitFor(() => {
    expect(f.queue.hasPending).toBe(false);
  });
  expect(f.gate.busy).toBe(false);
});
it('never dispatches a reordered fresh intent past held failure entries until those entries are explicitly removed', async () => {
  const f = fixture();
  const release = f.gate.acquire('one');
  await f.queue.enqueue(f.request('Held first'));
  await f.queue.enqueue(f.request('Held second'));
  f.queue.pause();
  await f.queue.enqueue(f.request('Fresh later'));
  const initial = f.queue.list('one');
  const reviewedIds = initial.map((entry) => entry.id);
  await f.queue.reorder({ sessionId: 'one', reviewedIds, ids: reviewedIds.toReversed() });
  release();
  f.queue.settle();
  expect(f.send).not.toHaveBeenCalled();
  expect(f.queue.list('one').map((entry) => entry.failed)).toEqual([false, true, true]);
  const held = initial.filter((entry) => entry.failed);
  const firstHeld = held[0];
  const lastHeld = held[1];
  if (!firstHeld || !lastHeld) throw new Error('Missing held requests');
  await f.queue.remove({ sessionId: 'one', id: firstHeld.id, resume: true });
  expect(f.send).not.toHaveBeenCalled();
  await f.queue.remove({ sessionId: 'one', id: lastHeld.id, resume: true });
  await vi.waitFor(() => {
    expect(f.queue.hasPending).toBe(false);
  });
  expect(f.send).toHaveBeenCalledOnce();
  expect(f.send.mock.calls[0]?.[0].text).toBe('Fresh later');
});
it('never dispatches during draft restoration and defers explicit removal resumption to the active operation lease', async () => {
  const f = fixture();
  const release = f.gate.acquire('one');
  await f.queue.enqueue(f.request('Held for editing'));
  f.queue.pause();
  await f.queue.enqueue(f.request('Fresh kept'));
  await f.queue.enqueue(f.request('Fresh removed'));
  const held = f.queue.list('one')[0];
  const removed = f.queue.list('one')[2];
  if (!held || !removed) throw new Error('Missing requests');
  release();
  await f.queue.remove({ sessionId: 'one', id: held.id });
  expect(f.send).not.toHaveBeenCalled();
  const releaseNext = f.gate.acquire('one');
  await f.queue.remove({ sessionId: 'one', id: removed.id, resume: true });
  expect(f.gate.owns('one')).toBe(true);
  expect(f.send).not.toHaveBeenCalled();
  releaseNext();
  f.queue.settle();
  await vi.waitFor(() => {
    expect(f.queue.hasPending).toBe(false);
  });
  expect(f.send).toHaveBeenCalledOnce();
  expect(f.send.mock.calls[0]?.[0].text).toBe('Fresh kept');
});
it('validates the narrow native reorder envelope and rejects oversized, non-UUID or extra writable fields', () => {
  const validators = interactionValidators(
    z.object({}),
    z.object({}),
    z.string().min(1),
    z.string(),
    z.string(),
  );
  const id = crypto.randomUUID();
  const input = { sessionId: 'one', reviewedIds: [id], ids: [id] };
  expect(validators.reorderQueuedChat.safeParse([input]).success).toBe(true);
  expect(validators.reorderQueuedChat.safeParse([{ ...input, ids: ['foreign-path'] }]).success).toBe(false);
  expect(
    validators.reorderQueuedChat.safeParse([{ ...input, ids: Array<string>(21).fill(id) }]).success,
  ).toBe(false);
  expect(
    validators.reorderQueuedChat.safeParse([{ ...input, request: { text: 'Overwrite snapshot' } }]).success,
  ).toBe(false);
  const removal = { sessionId: 'one', id };
  expect(validators.removeQueuedChat.safeParse([removal]).success).toBe(true);
  expect(validators.removeQueuedChat.safeParse([{ ...removal, resume: true }]).success).toBe(true);
  expect(validators.removeQueuedChat.safeParse([{ ...removal, resume: false }]).success).toBe(true);
  expect(validators.removeQueuedChat.safeParse([{ ...removal, resume: 'true' }]).success).toBe(false);
});
