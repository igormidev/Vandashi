import { describe, expect, it } from 'vitest';
import { EventReducer, itemMessage } from '../src/infrastructure/codex/events';
import { readHistory } from '../src/infrastructure/codex/history';
import type { RpcClient } from '../src/infrastructure/codex/transport';

const item = {
  id: 'image-1',
  type: 'imageGeneration',
  status: 'completed',
  revisedPrompt: 'A title card',
  result: 'BASE64_PIXELS_MUST_NOT_BE_PERSISTED',
  failure: null,
  savedPath: '/project/poster.png',
};

describe('actual imageGeneration protocol items', () => {
  it('replaces in-progress activity with a completed authorized-file reference without persisting pixels', () => {
    const reducer = new EventReducer();
    const started = reducer.reduce({
      method: 'item/started',
      params: { turnId: 'turn', item: { ...item, status: 'in_progress' } },
    });
    expect(started).toMatchObject({
      type: 'message',
      message: { id: 'image-1', role: 'tool' },
    });
    if (started?.type !== 'message') throw new Error('Missing progress item');
    expect(started.message.text).toContain('in_progress');
    expect(started.message.generatedImages).toBeUndefined();
    const complete = reducer.reduce({ method: 'item/completed', params: { turnId: 'turn', item } });
    expect(complete).toMatchObject({
      type: 'message',
      delta: false,
      message: { id: 'image-1', role: 'tool', generatedImages: ['/project/poster.png'] },
    });
    expect(JSON.stringify(complete)).not.toContain(item.result);
  });

  it('surfaces generation quota failure and never treats an in-progress or failed path as a finished image', () => {
    const failed = itemMessage(
      {
        ...item,
        status: 'failed',
        failure: { type: 'usageLimitExceeded', limitId: 'image-generation', resetsAt: 1_800_000_000 },
      },
      'turn',
    );
    expect(failed?.role).toBe('error');
    expect(failed?.text).toContain('usageLimitExceeded');
    expect(failed?.text).toContain('image-generation');
    expect(failed?.text).toContain('1800000000');
    expect(failed?.generatedImages).toBeUndefined();
    expect(itemMessage({ ...item, savedPath: undefined }, 'turn')?.generatedImages).toBeUndefined();
    expect(JSON.stringify(failed)).not.toContain(item.result);
  });

  it('restores the same completed image metadata from paginated persisted history', async () => {
    const client: RpcClient = {
      request: (method) =>
        Promise.resolve(
          method === 'thread/read'
            ? { thread: { id: 'thread' } }
            : { data: [{ id: 'turn', items: [item] }], nextCursor: null },
        ),
      subscribe: () => () => undefined,
      onFailure: () => () => undefined,
      close: () => Promise.resolve(),
    };
    const history = await readHistory(client, 'thread');
    expect(history.messages[0]?.generatedImages).toEqual(['/project/poster.png']);
    expect(JSON.stringify(history)).not.toContain(item.result);
  });
});
