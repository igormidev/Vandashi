import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { beginUpdateInstall } from '../src/desktop/update-install';
import { Updates } from '../src/application/updates';
import { AppFault } from '../src/domain/diagnostics';
import { validateNativeUpdate } from '../src/infrastructure/updates/native-metadata';
import type { ReleaseArtifact } from '../src/infrastructure/updates/github-release';

afterEach(() => {
  vi.useRealTimers();
});
it('observes emitted installer errors without attempting app shutdown', async () => {
  const app = new EventEmitter();
  const updater = Object.assign(new EventEmitter(), {
    quitAndInstall: vi.fn(() => {
      updater.emit('error', new Error('Read-only app directory'));
    }),
  });
  await expect(beginUpdateInstall(app, updater)).rejects.toThrow('Read-only app directory');
  expect(app.listenerCount('will-quit')).toBe(0);
  expect(updater.listenerCount('error')).toBe(0);
});
it('does not count a canceled before-quit attempt as installation success', async () => {
  vi.useFakeTimers();
  const app = new EventEmitter();
  const updater = Object.assign(new EventEmitter(), {
    quitAndInstall: () => {
      app.emit('before-quit');
    },
  });
  const pending = expect(beginUpdateInstall(app, updater)).rejects.toThrow('did not start');
  await vi.advanceTimersByTimeAsync(30_000);
  await pending;
  expect(app.listenerCount('will-quit')).toBe(0);
});
it('completes only when window close has advanced to will-quit', async () => {
  const app = new EventEmitter();
  const updater = Object.assign(new EventEmitter(), {
    quitAndInstall: () => {
      app.emit('will-quit');
    },
  });
  await beginUpdateInstall(app, updater);
  expect(updater.listenerCount('error')).toBe(0);
});
it('offers a new download after a cached installer is lost or changed', async () => {
  const release = { version: '0.2.0', notes: ['Changes.'] };
  const download = vi.fn(() => Promise.resolve());
  const service = new Updates(
    {
      currentVersion: '0.1.2',
      supported: true,
      mode: 'installer',
      check: () => Promise.resolve(release),
      download,
      apply: () => Promise.reject(new AppFault({ id: 'updateInvalid' })),
    },
    () => undefined,
  );
  await service.check();
  await service.download(release.version);
  await service.apply(release.version);
  expect(service.state().phase).toBe('available');
  await service.download(release.version);
  expect(service.state().phase).toBe('downloaded');
  expect(download).toHaveBeenCalledTimes(2);
});
it('binds native YAML to reviewed filenames, version, size and checksums, and rejects package URLs', () => {
  const asset = { name: 'Vandashi-0.2.0-win-x64.exe', size: 120, sha512: 'verified-digest' };
  const release: ReleaseArtifact = {
    version: '0.2.0',
    notes: ['Changes.'],
    asset,
    artifacts: { 'win32-x64-exe': asset },
    url: '',
    feed: '',
  };
  const file = { url: asset.name, size: asset.size, sha512: asset.sha512 };
  const info = { version: release.version, files: [file] };
  expect(() => {
    validateNativeUpdate(info, release);
  }).not.toThrow();
  for (const changed of [
    { ...file, url: 'https://external.test/installer.exe' },
    { ...file, size: 121 },
    { ...file, sha512: 'other' },
  ])
    expect(() => {
      validateNativeUpdate({ ...info, files: [changed] }, release);
    }).toThrow();
  expect(() => {
    validateNativeUpdate({ ...info, version: '0.3.0' }, release);
  }).toThrow();
  expect(() => {
    validateNativeUpdate(
      { ...info, packages: { x64: { path: 'https://external.test/package.7z' } } },
      release,
    );
  }).toThrow();
});
