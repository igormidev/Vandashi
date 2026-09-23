import { describe, expect, it, vi } from 'vitest';
import { OwnedRequest } from '../src/renderer/shared/owned-request';

describe('owned effect requests', () => {
  it('reattaches before and after completion without repeating gated work or its refresh', async () => {
    const owned = new OwnedRequest<number>();
    const api = {};
    let complete: (value: number) => void = () => undefined;
    const refresh = vi.fn();
    const start = vi.fn(() =>
      new Promise<number>((resolve) => {
        complete = resolve;
      }).then((value) => {
        refresh();
        return value;
      }),
    );
    const original = owned.get(api, 'scope:attempt0', start);
    expect(owned.get(api, 'scope:attempt0', start)).toBe(original);
    await Promise.resolve();
    expect(start).toHaveBeenCalledOnce();
    complete(42);
    expect(await owned.get(api, 'scope:attempt0', start)).toBe(42);
    expect(start).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });
  it('retains failures until an explicit new attempt and turns synchronous throws into rejections', async () => {
    const owned = new OwnedRequest<number>();
    const api = {};
    const start = vi.fn<() => Promise<number>>(() => {
      throw new Error('Unavailable');
    });
    const result = owned.get(api, 'attempt0', start);
    await expect(result).rejects.toThrow('Unavailable');
    expect(owned.get(api, 'attempt0', start)).toBe(result);
    expect(start).toHaveBeenCalledOnce();
    await expect(owned.get(api, 'attempt1', () => Promise.resolve(7))).resolves.toBe(7);
  });
  it('does not share a request across API instances, scopes, revisions, or retry attempts', async () => {
    const owned = new OwnedRequest<number>();
    const first = {};
    const second = {};
    const start = vi.fn(() => Promise.resolve(1));
    for (const [owner, key] of [
      [first, 'brand/video/clip/rev1/0'],
      [second, 'brand/video/clip/rev1/0'],
      [second, 'brand/video/other/rev1/0'],
      [second, 'brand/video/other/rev2/0'],
      [second, 'brand/video/other/rev2/1'],
    ] as const)
      await owned.get(owner, key, start);
    expect(start).toHaveBeenCalledTimes(5);
  });
  it('keeps the current request when an abandoned older scope finishes later', async () => {
    const owned = new OwnedRequest<number>();
    const api = {};
    let finish = (): void => undefined;
    const old = owned.get(
      api,
      'old',
      () =>
        new Promise<number>((resolve) => {
          finish = () => {
            resolve(1);
          };
        }),
    );
    await Promise.resolve();
    const current = owned.get(api, 'new', () => Promise.resolve(2));
    await current;
    finish();
    await old;
    expect(owned.get(api, 'new', () => Promise.resolve(3))).toBe(current);
    expect(await current).toBe(2);
  });
});
