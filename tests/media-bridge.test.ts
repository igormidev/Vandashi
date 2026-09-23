import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import {
  STUDIO_BRIDGE_FLUSH,
  STUDIO_BRIDGE_INSTALL,
  type StudioFlushResult,
} from '../src/infrastructure/media/studio-bridge';

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
    flush: () => runInNewContext(STUDIO_BRIDGE_FLUSH, context) as Promise<StudioFlushResult>,
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
    await expect(bridge.flush()).resolves.toEqual({
      ok: false,
      diagnostic: { kind: 'app', message: { id: 'mediaBridgeSaveHttp', params: { status: 409 } } },
    });
    bridge.install(); // Idempotent reinjection must not discard the pending error.
    await expect(bridge.flush()).resolves.toEqual({
      ok: false,
      diagnostic: { kind: 'app', message: { id: 'mediaBridgeSaveHttp', params: { status: 409 } } },
    });
    bridge.nativeFetch.mockResolvedValueOnce(new Response(null));
    await bridge.window.fetch(url, { method: 'PUT' });
    await expect(bridge.flush()).resolves.toEqual({ ok: true });
  });

  it('preserves vendor flush failures as external text instead of matching English messages', async () => {
    const bridge = fixture();
    bridge.window.addEventListener('hf-studio-flush-pending-edits', (event) => {
      const detail = (event as CustomEvent<{ promises: Promise<unknown>[] }>).detail;
      detail.promises.push(Promise.reject(new Error('Studio is still saving. Provider-specific Ω')));
    });
    await expect(bridge.flush()).resolves.toEqual({
      ok: false,
      diagnostic: { kind: 'external', text: 'Studio is still saving. Provider-specific Ω' },
    });
  });

  it('does not wait for unrelated read streams', async () => {
    const bridge = fixture();
    const network = deferred<Response>();
    bridge.nativeFetch.mockReturnValueOnce(network.promise);
    const read = bridge.window.fetch('http://127.0.0.1:1234/api/projects/test/events');
    await expect(bridge.flush()).resolves.toEqual({ ok: true });
    network.resolve(new Response(null));
    await read;
  });

  it.each([
    ['POST', 'render'],
    ['PUT', 'selection'],
    ['POST', 'file-mutations/probe-element/index.html'],
  ])('does not retain an unrelated %s %s failure as an editor save error', async (method, route) => {
    const bridge = fixture();
    const network = deferred<Response>();
    bridge.nativeFetch.mockReturnValueOnce(network.promise);
    const request = bridge.window.fetch(`http://127.0.0.1:1234/api/projects/test/${route}`, { method });
    await expect(bridge.flush()).resolves.toEqual({ ok: true });
    network.resolve(new Response(null, { status: 500 }));
    await request;
    await expect(bridge.flush()).resolves.toEqual({ ok: true });
  });

  it.each([
    ['POST', 'files/scene.html'],
    ['PATCH', 'files/scene.html'],
    ['DELETE', 'files/scene.html'],
    ['POST', 'file-mutations/patch-element/scene.html'],
    ['POST', 'file-mutations/split-batch'],
    ['POST', 'gsap-mutations/scene.html'],
    ['POST', 'gsap-mutations-batch/scene.html'],
    ['POST', 'gsap-mutation-rollback/scene.html'],
    ['POST', 'upload'],
    ['POST', 'duplicate-file'],
    ['POST', 'registry/install'],
  ])('retains an actual source mutation failure from %s %s', async (method, route) => {
    const bridge = fixture();
    const url = `http://127.0.0.1:1234/api/projects/test/${route}`;
    bridge.nativeFetch.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await bridge.window.fetch(url, { method });
    await expect(bridge.flush()).resolves.toMatchObject({ ok: false });
    bridge.nativeFetch.mockResolvedValueOnce(new Response(null));
    await bridge.window.fetch(url, { method });
    await expect(bridge.flush()).resolves.toEqual({ ok: true });
  });

  it.each(['init', 'request'] as const)(
    'accepts the vendor already-written 409 for a %s body without consuming either original stream',
    async (kind) => {
      const bridge = fixture();
      const url = 'http://127.0.0.1:1234/api/projects/test/files/index.html';
      const content = '<h1>Exact already-written content Ω</h1>';
      const conflict = { currentVersion: 'sha256:current', currentContent: content };
      const network = deferred<Response>();
      bridge.nativeFetch.mockImplementationOnce(async (input, init) => {
        const body = input instanceof Request ? await input.text() : init?.body;
        expect(body).toBe(content);
        return network.promise;
      });
      const input = { method: 'PUT', body: content };
      const request =
        kind === 'request' ? bridge.window.fetch(new Request(url, input)) : bridge.window.fetch(url, input);
      let completed = false;
      const flush = bridge.flush().then((result) => {
        completed = true;
        return result;
      });
      await new Promise((resolve) => {
        setTimeout(resolve, 5);
      });
      expect(completed).toBe(false);
      network.resolve(Response.json(conflict, { status: 409 }));
      expect(await (await request).json()).toEqual(conflict);
      await expect(flush).resolves.toEqual({ ok: true });
    },
  );

  it.each([
    { currentVersion: 'new', currentContent: 'Different external content' },
    { currentContent: 'Attempted content' },
    { currentVersion: '', currentContent: 'Attempted content' },
    { currentVersion: 'new', currentContent: null },
  ])('keeps a genuine or unverifiable 409 blocked: %j', async (conflict) => {
    const bridge = fixture();
    bridge.nativeFetch.mockResolvedValueOnce(Response.json(conflict, { status: 409 }));
    await bridge.window.fetch('http://127.0.0.1:1234/api/projects/test/files/index.html', {
      method: 'PUT',
      body: 'Attempted content',
    });
    await expect(bridge.flush()).resolves.toEqual({
      ok: false,
      diagnostic: { kind: 'app', message: { id: 'mediaBridgeSaveHttp', params: { status: 409 } } },
    });
  });

  it('clears a previous file conflict only when the retried content is confirmed already written', async () => {
    const bridge = fixture();
    const url = 'http://127.0.0.1:1234/api/projects/test/files/index.html';
    bridge.nativeFetch.mockResolvedValueOnce(Response.json({ currentContent: 'External' }, { status: 409 }));
    await bridge.window.fetch(url, { method: 'PUT', body: 'Retry content' });
    await expect(bridge.flush()).resolves.toMatchObject({ ok: false });
    bridge.nativeFetch.mockResolvedValueOnce(
      Response.json({ currentVersion: 'new', currentContent: 'Retry content' }, { status: 409 }),
    );
    await bridge.window.fetch(url, { method: 'PUT', body: 'Retry content' });
    await expect(bridge.flush()).resolves.toEqual({ ok: true });
  });
});
