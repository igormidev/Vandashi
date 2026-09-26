import { afterEach, expect, it, vi } from 'vitest';
import { Updates, UPDATE_INTERVAL_MS } from '../src/application/updates';
import { AppFault } from '../src/domain/diagnostics';
import { newerVersion, type UpdatePort, type UpdateState } from '../src/domain/updates';
import { parseInvocation } from '../src/desktop/validation';

const release = { version: '0.2.0', notes: ['A small improvement.'] };
function fixture() {
  const port: UpdatePort = {
    currentVersion: '0.1.2',
    supported: true,
    mode: 'installer',
    check: vi.fn(() => Promise.resolve(release)),
    download: vi.fn(() => Promise.resolve()),
    apply: vi.fn(() => Promise.resolve()),
  };
  const events: UpdateState[] = [];
  const service = new Updates(port, (state) => {
    events.push(state);
  });
  return { port, service, events };
}
afterEach(() => {
  vi.useRealTimers();
});
it('checks at startup and every twenty minutes, with an idempotent start and stop', async () => {
  vi.useFakeTimers();
  const { port, service } = fixture();
  service.start();
  service.start();
  await vi.advanceTimersByTimeAsync(0);
  expect(port.check).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS - 1);
  expect(port.check).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(port.check).toHaveBeenCalledTimes(2);
  service.stop();
  await vi.advanceTimersByTimeAsync(UPDATE_INTERVAL_MS);
  expect(port.check).toHaveBeenCalledTimes(2);
  expect(port.download).not.toHaveBeenCalled();
  expect(port.apply).not.toHaveBeenCalled();
});
it('coalesces checks and never downloads or applies automatically', async () => {
  const { port, service, events } = fixture();
  let finish: (() => void) | undefined;
  port.check = vi.fn<UpdatePort['check']>(
    () =>
      new Promise<typeof release>((resolve) => {
        finish = () => {
          resolve(release);
        };
      }),
  );
  const first = service.check();
  expect(service.state().phase).toBe('checking');
  expect(service.check()).toBe(first);
  await Promise.resolve();
  finish?.();
  await first;
  expect(events.map((state) => state.revision)).toEqual([1, 2, 3]);
  expect(service.state().phase).toBe('available');
  expect(port.download).not.toHaveBeenCalled();
  expect(port.apply).not.toHaveBeenCalled();
});
it('requires the reviewed version and keeps a completed download until a separate apply', async () => {
  const { port, service } = fixture();
  await service.check();
  expect(() => service.download('0.3.0')).toThrow();
  expect(() => service.apply(release.version)).toThrow();
  let finish: (() => void) | undefined;
  port.download = vi.fn<UpdatePort['download']>(
    (_version, progress) =>
      new Promise<void>((resolve) => {
        progress(42);
        finish = resolve;
      }),
  );
  const download = service.download(release.version);
  await Promise.resolve();
  expect(service.state()).toMatchObject({ phase: 'downloading', progress: 42 });
  expect(() => service.download(release.version)).toThrow();
  expect(service.check()).toBe(download);
  finish?.();
  await download;
  expect(service.state().phase).toBe('downloaded');
  expect(port.apply).not.toHaveBeenCalled();
  port.check = vi.fn(() => Promise.resolve({ version: '0.3.0', notes: ['Newer version.'] }));
  await service.check();
  expect(port.check).toHaveBeenCalled();
  expect(service.state()).toMatchObject({ phase: 'downloaded', release });
  await service.apply(release.version);
  expect(port.apply).toHaveBeenCalledExactlyOnceWith(release.version);
});
it('retains available or downloaded state on failure and lets the user retry', async () => {
  const { port, service } = fixture();
  await service.check();
  port.check = vi.fn(() => Promise.reject(new AppFault({ id: 'updateCheckFailed' })));
  await service.check();
  expect(service.state()).toMatchObject({ phase: 'available', release, diagnostic: { kind: 'app' } });
  port.download = vi.fn(() => Promise.reject(new AppFault({ id: 'updateDownloadFailed' })));
  await service.download(release.version);
  expect(service.state().phase).toBe('available');
  port.download = vi.fn(() => Promise.resolve());
  await service.download(release.version);
  port.apply = vi.fn(() => Promise.reject(new AppFault({ id: 'updateOpenFailed' })));
  await service.apply(release.version);
  expect(service.state()).toMatchObject({
    phase: 'downloaded',
    diagnostic: { message: { id: 'updateOpenFailed' } },
  });
});
it('does not claim an offline or unsupported build is up to date', async () => {
  const { port, service } = fixture();
  port.check = vi.fn(() => Promise.reject(new AppFault({ id: 'updateCheckFailed' })));
  await service.check();
  expect(service.state()).toMatchObject({ checked: false, phase: 'idle' });
  const dev = new Updates({ ...port, supported: false }, () => undefined);
  dev.start();
  await dev.check();
  expect(dev.state()).toMatchObject({ checked: false, phase: 'unsupported' });
  expect(port.check).toHaveBeenCalledTimes(1);
});
it.each([
  ['0.10.0', '0.9.9', true],
  ['1.0.0', '0.99.99', true],
  ['0.1.2', '0.1.2', false],
  ['0.1.1', '0.1.2', false],
  ['1.0.0-beta', '0.1.2', false],
  ['01.0.0', '0.1.2', false],
  ['9007199254740992.0.0', '0.1.2', false],
])('compares stable versions %s and %s', (next, current, newer) => {
  expect(newerVersion(next, current)).toBe(newer);
});
it('accepts only narrow update IPC requests, never renderer-selected URLs or paths', () => {
  expect(parseInvocation('downloadUpdate', ['1.2.3']).args).toEqual(['1.2.3']);
  for (const value of ['https://example.com/update', '/tmp/installer', '1.2.3;open', '1.2.3-beta'])
    expect(() => parseInvocation('applyUpdate', [value])).toThrow();
  expect(() => parseInvocation('checkForUpdates', ['https://example.com'])).toThrow();
});
