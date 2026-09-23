import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { STUDIO_BRIDGE_FLUSH, STUDIO_BRIDGE_INSTALL } from '../src/infrastructure/media/studio-bridge';

function deferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Not initialized');
  };
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
function fixture() {
  class Editable {
    matches() {
      return true;
    }
    blur = vi.fn();
  }
  const active = new Editable();
  const window = Object.assign(new EventTarget(), {
    fetch: vi.fn<typeof fetch>(() => Promise.resolve(new Response(null))),
    location: { href: 'http://127.0.0.1:1234/', origin: 'http://127.0.0.1:1234' },
  });
  const nativeFetch = window.fetch;
  const context = {
    window,
    document: { activeElement: active },
    HTMLElement: Editable,
    Request,
    URL,
    CustomEvent,
    setTimeout,
    clearTimeout,
  };
  runInNewContext(STUDIO_BRIDGE_INSTALL, context);
  return {
    window,
    active,
    nativeFetch,
    install: () => runInNewContext(STUDIO_BRIDGE_INSTALL, context) as unknown,
    flush: () => runInNewContext(STUDIO_BRIDGE_FLUSH, context) as Promise<void>,
  };
}

describe('Studio flush boundary', () => {
  it('drains an already-running network save and the official debounced-edit flush before resolving', async () => {
    const bridge = fixture();
    const network = deferred<Response>();
    const debounced = deferred<undefined>();
    bridge.nativeFetch.mockReturnValueOnce(network.promise);
    const request = bridge.window.fetch('http://127.0.0.1:1234/api/projects/test/files/index.html', {
      method: 'PUT',
    });
    bridge.window.addEventListener('hf-studio-flush-pending-edits', (event) => {
      const detail = (event as CustomEvent<{ promises: Promise<unknown>[] }>).detail;
      detail.promises.push(debounced.promise);
    });
    let complete = false;
    const flushing = bridge.flush().then(() => {
      complete = true;
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    expect(complete).toBe(false);
    expect(bridge.active.blur).toHaveBeenCalledOnce();
    network.resolve(new Response(null));
    await request;
    await new Promise((resolve) => {
      setTimeout(resolve, 5);
    });
    expect(complete).toBe(false);
    debounced.resolve(undefined);
    await flushing;
    expect(complete).toBe(true);
  });

  it('keeps navigation blocked after a save conflict until that write succeeds', async () => {
    const bridge = fixture();
    const url = 'http://127.0.0.1:1234/api/projects/test/files/index.html';
    bridge.nativeFetch.mockResolvedValueOnce(new Response(null, { status: 409 }));
    await bridge.window.fetch(url, { method: 'PUT' });
    await expect(bridge.flush()).rejects.toThrow('HTTP 409');
    bridge.install(); // Idempotent reinjection must not discard the pending error.
    await expect(bridge.flush()).rejects.toThrow('HTTP 409');
    bridge.nativeFetch.mockResolvedValueOnce(new Response(null));
    await bridge.window.fetch(url, { method: 'PUT' });
    await expect(bridge.flush()).resolves.toBeUndefined();
  });

  it('does not wait for unrelated read streams', async () => {
    const bridge = fixture();
    const network = deferred<Response>();
    bridge.nativeFetch.mockReturnValueOnce(network.promise);
    const read = bridge.window.fetch('http://127.0.0.1:1234/api/projects/test/events');
    await expect(bridge.flush()).resolves.toBeUndefined();
    network.resolve(new Response(null));
    await read;
  });
});
