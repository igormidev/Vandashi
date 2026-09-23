import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopApi } from '../src/domain/api';
import type { AppEvent } from '../src/domain/models';

const mocks = vi.hoisted(() => ({
  expose: vi.fn<(key: string, api: DesktopApi) => void>(),
  invoke: vi.fn<(channel: string, ...args: unknown[]) => Promise<unknown>>(),
  send: vi.fn<(channel: string, ...args: unknown[]) => void>(),
  on: vi.fn<(channel: string, listener: (event: unknown, payload: AppEvent) => void) => void>(),
  removeListener: vi.fn<(channel: string, listener: (event: unknown, payload: AppEvent) => void) => void>(),
  getPathForFile: vi.fn<(file: File) => string>(),
}));
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: mocks.expose },
  ipcRenderer: { invoke: mocks.invoke, send: mocks.send, on: mocks.on, removeListener: mocks.removeListener },
  webUtils: { getPathForFile: mocks.getPathForFile },
}));

describe('isolated preload bridge', () => {
  let api: DesktopApi;
  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    await import('../src/desktop/preload');
    const exposed = mocks.expose.mock.calls[0];
    if (!exposed) throw new Error('Preload did not expose its API');
    api = exposed[1];
  });

  it('exposes named use cases without generic invoke, filesystem, or event capabilities', async () => {
    expect(mocks.expose.mock.calls[0]?.[0]).toBe('vandashi');
    expect(Object.hasOwn(api, 'invoke')).toBe(false);
    expect(Object.hasOwn(api, 'send')).toBe(false);
    expect(Object.hasOwn(api, 'readFile')).toBe(false);
    await api.getState();
    expect(mocks.invoke).toHaveBeenCalledWith('vandashi:invoke', 'getState', []);
  });

  it('grants only paths obtained by native webUtils from an actual selected File', () => {
    const file = new File(['data'], 'image.png');
    mocks.getPathForFile.mockReturnValue('');
    expect(api.pathForFile(file)).toBe('');
    expect(mocks.send).not.toHaveBeenCalled();
    mocks.getPathForFile.mockReturnValue('/selected/image.png');
    expect(api.pathForFile(file)).toBe('/selected/image.png');
    expect(mocks.send).toHaveBeenCalledWith('vandashi:grant-drop', '/selected/image.png');
  });

  it('never passes the privileged IPC event to renderer callbacks and removes subscriptions', () => {
    const listener = vi.fn<(event: AppEvent) => void>();
    const unsubscribe = api.onEvent(listener);
    const handler = mocks.on.mock.calls[0]?.[1];
    if (!handler) throw new Error('No event handler registered');
    const payload: AppEvent = { type: 'notice', code: 'test', detail: 'message' };
    handler({ sender: 'privileged IPC sender' }, payload);
    expect(listener).toHaveBeenCalledWith(payload);
    expect(listener.mock.calls[0]).toHaveLength(1);
    unsubscribe();
    expect(mocks.removeListener).toHaveBeenCalledWith('vandashi:event', handler);
  });
});
