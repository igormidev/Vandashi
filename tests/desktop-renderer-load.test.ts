import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { loadInitialRenderer } from '../src/desktop/renderer-load';

const renderer = 'file:///Applications/Vandashi.app/Contents/Resources/renderer/index.html';
const abort = () => Object.assign(new Error('ERR_ABORTED'), { code: 'ERR_ABORTED', errno: -3 });

class Renderer extends EventEmitter {
  currentUrl = renderer;
  destroyed = false;
  resolve: () => void = () => undefined;
  reject: (error: Error) => void = () => undefined;
  loadURL(url: string): Promise<void> {
    this.emit('did-start-navigation', {}, url, false, true);
    return new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
  getURL() {
    return this.currentUrl;
  }
  isDestroyed() {
    return this.destroyed;
  }
  reload(url = renderer) {
    this.currentUrl = url;
    this.emit('did-start-navigation', {}, url, false, true);
  }
  complete() {
    this.emit('did-finish-load');
    this.emit('did-stop-loading');
  }
}

describe('initial renderer navigation ownership', () => {
  it('finishes ordinary startup and removes all temporary lifecycle listeners', async () => {
    const contents = new Renderer();
    const loading = loadInitialRenderer(contents, renderer);
    contents.complete();
    contents.resolve();
    await loading;
    expect(contents.eventNames()).toEqual([]);
  });

  it('keeps startup pending through Reload and adopts its successful exact-URL load', async () => {
    const contents = new Renderer();
    let settled = false;
    const loading = loadInitialRenderer(contents, renderer).then(() => {
      settled = true;
    });
    contents.reload();
    contents.reject(abort());
    contents.emit('did-fail-load', {}, -3, 'ERR_ABORTED', renderer, true);
    await Promise.resolve();
    expect(settled).toBe(false);
    contents.complete();
    await loading;
    expect(settled).toBe(true);
    expect(contents.eventNames()).toEqual([]);
  });

  it('retains completion that arrives before the superseded load rejection is observed', async () => {
    const contents = new Renderer();
    const loading = loadInitialRenderer(contents, renderer);
    contents.reload();
    contents.reload();
    contents.complete();
    contents.reject(abort());
    await loading;
    expect(contents.eventNames()).toEqual([]);
  });

  it.each(['none', 'subframe', 'same-document'] as const)(
    'rejects an aborted initial load with only %s navigation evidence',
    async (navigation) => {
      const contents = new Renderer();
      const loading = loadInitialRenderer(contents, renderer);
      if (navigation !== 'none')
        contents.emit(
          'did-start-navigation',
          {},
          renderer,
          navigation === 'same-document',
          navigation !== 'subframe',
        );
      const error = abort();
      contents.reject(error);
      await expect(loading).rejects.toBe(error);
      expect(contents.eventNames()).toEqual([]);
    },
  );

  it('does not suppress a genuine initial failure even when a replacement was observed', async () => {
    const contents = new Renderer();
    const loading = loadInitialRenderer(contents, renderer);
    contents.reload();
    contents.complete();
    const error = Object.assign(new Error('ERR_FILE_NOT_FOUND'), { code: 'ERR_FILE_NOT_FOUND', errno: -6 });
    contents.reject(error);
    await expect(loading).rejects.toBe(error);
    expect(contents.eventNames()).toEqual([]);
  });

  it('rejects replacement navigation to another URL even when that page loads', async () => {
    const contents = new Renderer();
    const loading = loadInitialRenderer(contents, renderer);
    contents.reload('https://example.com/');
    contents.complete();
    const error = abort();
    contents.reject(error);
    await expect(loading).rejects.toBe(error);
    expect(contents.eventNames()).toEqual([]);
  });

  it('reports a genuine replacement failure instead of the superseded request cancellation', async () => {
    const contents = new Renderer();
    const loading = loadInitialRenderer(contents, renderer);
    contents.reload();
    contents.reject(abort());
    contents.emit('did-fail-load', {}, -6, 'ERR_FILE_NOT_FOUND', renderer, true);
    await expect(loading).rejects.toMatchObject({
      code: 'ERR_FILE_NOT_FOUND',
      errno: -6,
      url: renderer,
    });
    expect(contents.eventNames()).toEqual([]);
  });

  it.each(['stop', 'destroy'] as const)(
    'rejects if replacement loading ends by %s without success',
    async (end) => {
      const contents = new Renderer();
      const loading = loadInitialRenderer(contents, renderer);
      contents.reload();
      const error = abort();
      contents.reject(error);
      if (end === 'stop') contents.emit('did-stop-loading');
      else {
        contents.destroyed = true;
        contents.emit('destroyed');
      }
      await expect(loading).rejects.toBe(error);
      expect(contents.eventNames()).toEqual([]);
    },
  );

  it('ignores a child-frame load failure while the exact renderer replacement completes', async () => {
    const contents = new Renderer();
    const loading = loadInitialRenderer(contents, renderer);
    contents.reload();
    contents.reject(abort());
    contents.emit('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED', 'https://example.com/', false);
    contents.complete();
    await loading;
    expect(contents.eventNames()).toEqual([]);
  });
});
