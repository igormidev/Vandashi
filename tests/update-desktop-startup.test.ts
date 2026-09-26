import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type * as ElectronUpdater from 'electron-updater';
import type { AppAdapter } from 'electron-updater/out/AppAdapter';
import { Updates } from '../src/application/updates';
import { DesktopUpdates } from '../src/desktop/updates';

const mocks = vi.hoisted(() => ({
  packaged: false,
  native: vi.fn<() => ElectronUpdater.AppUpdater>(),
  latest: vi.fn(),
  download: vi.fn(),
  verified: vi.fn(),
  open: vi.fn(),
}));
vi.mock('electron', () => ({
  app: {
    getVersion: () => (mocks.packaged ? '0.1.4' : '0.0'),
    getPath: () => '/temporary/vandashi',
    get isPackaged() {
      return mocks.packaged;
    },
  },
  shell: { openPath: mocks.open },
}));
vi.mock('electron-updater', async (original) => {
  const upstream = await original<typeof ElectronUpdater>();
  mocks.native.mockImplementation(() => {
    // Exercise the actual upstream constructor that rejects Electron's Linux development fallback.
    const adapter = { version: '0.0' } as AppAdapter;
    return new upstream.AppImageUpdater(undefined, adapter);
  });
  return {
    default: {
      get autoUpdater() {
        return mocks.native();
      },
    },
  };
});
vi.mock('../src/infrastructure/updates/github-release', () => ({ latestArtifact: mocks.latest }));
vi.mock('../src/infrastructure/updates/installer-download', () => ({
  InstallerDownload: class {
    download = mocks.download;
    verifiedPath = mocks.verified;
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.packaged = false;
  mocks.open.mockResolvedValue('');
  mocks.verified.mockResolvedValue('/temporary/verified-installer');
  mocks.latest.mockResolvedValue({ version: '0.2.0', notes: ['Update notes.'] });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

it('keeps development startup usable when the upstream native updater rejects its version', async () => {
  vi.stubGlobal('process', { ...process, platform: 'linux', env: {} });
  expect(() => mocks.native()).toThrow('not a valid semver version');
  mocks.native.mockClear();
  const updates = new Updates(new DesktopUpdates(), () => undefined);
  updates.start();
  expect((await updates.check()).phase).toBe('unsupported');
  expect(mocks.native).not.toHaveBeenCalled();
  expect(mocks.latest).not.toHaveBeenCalled();
  updates.stop();
});

it.each(['darwin', 'linux'])(
  '%s installer approval works without initializing a native updater',
  async (platform) => {
    vi.stubGlobal('process', { ...process, platform, env: {} });
    mocks.packaged = true;
    const updates = new Updates(new DesktopUpdates(), () => undefined);
    expect((await updates.check()).phase).toBe('available');
    expect((await updates.download('0.2.0')).phase).toBe('downloaded');
    expect(mocks.open).not.toHaveBeenCalled();
    expect((await updates.apply('0.2.0')).phase).toBe('downloaded');
    expect(mocks.open).toHaveBeenCalledWith('/temporary/verified-installer');
    expect(mocks.native).not.toHaveBeenCalled();
  },
);
