import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('electron', () => ({ webFrameMain: { fromId: vi.fn() } }));
import { AppFault, diagnosticFromError } from '../src/domain/diagnostics';
import { PathPermissions } from '../src/desktop/path-permissions';
import { DesktopStudioHost } from '../src/desktop/studio-host';
import { externalUrl, mediaRequestPath, parseInvocation, rendererLocation } from '../src/desktop/validation';

describe('desktop diagnostic producers', () => {
  let directory = '';
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vandashi-desktop-diagnostics-'));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('uses descriptors for unknown operations, unsafe keys, and malformed arguments', () => {
    const caught = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        return diagnosticFromError(error);
      }
      return null;
    };
    expect(caught(() => parseInvocation('constructor', []))).toEqual({
      kind: 'app',
      message: { id: 'unknownOperation' },
    });
    expect(caught(() => parseInvocation('settings', JSON.parse('[{"__proto__":{}}]')))).toEqual({
      kind: 'app',
      message: { id: 'desktopRequestKeyUnsafe' },
    });
    expect(caught(() => parseInvocation('getState', [null]))).toMatchObject({
      kind: 'app',
      message: { id: 'desktopArgumentsInvalid' },
      externalDetail: expect.any(String) as unknown,
    });
  });

  it('adds the proper guidance to malformed URLs and keeps parser details separate', () => {
    for (const [run, id] of [
      [() => externalUrl('not a url'), 'desktopExternalUrlInvalid'],
      [() => rendererLocation(false, 'not a url', 'file:///app/index.html'), 'desktopRendererNotLoopback'],
      [() => mediaRequestPath('not a url', 'GET'), 'desktopMediaRequestUnsupported'],
    ] as const) {
      try {
        run();
        throw new Error('Expected invalid URL');
      } catch (error) {
        expect(diagnosticFromError(error)).toMatchObject({
          kind: 'app',
          message: { id },
          externalDetail: expect.any(String) as unknown,
        });
      }
    }
  });

  it('distinguishes picker permission guidance from unknown OS filesystem failures', async () => {
    const permissions = new PathPermissions((value) => Promise.resolve(value));
    const file = join(directory, 'asset.png');
    await writeFile(file, 'fixture');
    await expect(permissions.grantDirectory(file)).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'desktopChooseDirectory' } },
    });
    const folder = join(directory, 'folder');
    await mkdir(folder);
    await expect(permissions.grantFile(folder)).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'desktopChooseFile' } },
    });
    await expect(
      permissions.authorize('createBrand', [{ parentPath: directory, name: 'Brand' }]),
    ).rejects.toMatchObject({ diagnostic: { kind: 'app', message: { id: 'desktopBrandPickerRequired' } } });
    const failure: unknown = await permissions
      .grantFile(join(directory, 'missing.png'))
      .catch((error: unknown) => error);
    expect(failure).not.toBeInstanceOf(AppFault);
    expect(diagnosticFromError(failure)).toMatchObject({
      kind: 'external',
      text: expect.stringContaining('ENOENT') as unknown,
    });
  });

  it('uses known active-frame diagnostics while preserving arbitrary vendor frame failures', async () => {
    const studio = 'http://127.0.0.1:45678/#project/video';
    const execute = vi.fn(() => Promise.resolve());
    const mainFrame = { frames: [] as unknown[] };
    const frame = { url: studio, parent: mainFrame, executeJavaScript: execute };
    const host = new DesktopStudioHost(
      { on: vi.fn(), mainFrame } as unknown as ConstructorParameters<typeof DesktopStudioHost>[0],
      'install',
      'flush',
    );
    await expect(host.prepareStudio('not a url')).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'desktopStudioLocationInvalid' } },
    });
    await host.prepareStudio(studio);
    await expect(host.flushStudio(studio + '-other')).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'desktopStudioChanged' } },
    });
    await expect(host.flushStudio(studio)).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'desktopStudioUnavailable' } },
    });
    mainFrame.frames.push(frame);
    const vendor = new Error('Unknown Studio failure: original detail Ω');
    execute.mockRejectedValueOnce(vendor);
    const result: unknown = await host.flushStudio(studio).catch((error: unknown) => error);
    expect(result).toBe(vendor);
    expect(diagnosticFromError(result)).toEqual({ kind: 'external', text: vendor.message });
  });
  it('validates explicit Studio bridge envelopes and translates only app-owned descriptors', async () => {
    const studio = 'http://127.0.0.1:45678/#project/video';
    const execute = vi.fn<(script: string) => Promise<unknown>>(() => Promise.resolve(undefined));
    const mainFrame = { frames: [] as unknown[] };
    const frame = { url: studio, parent: mainFrame, executeJavaScript: execute };
    const host = new DesktopStudioHost(
      { on: vi.fn(), mainFrame } as unknown as ConstructorParameters<typeof DesktopStudioHost>[0],
      'install',
      'flush',
    );
    await host.prepareStudio(studio);
    mainFrame.frames.push(frame);
    execute.mockImplementation((script) =>
      Promise.resolve(
        script === 'flush'
          ? {
              ok: false,
              diagnostic: { kind: 'app', message: { id: 'mediaBridgeSaveHttp', params: { status: 409 } } },
            }
          : undefined,
      ),
    );
    await expect(host.flushStudio(studio)).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'mediaBridgeSaveHttp', params: { status: 409 } } },
    });
    execute.mockImplementation((script) => Promise.resolve(script === 'flush' ? { ok: true } : undefined));
    await expect(host.flushStudio(studio)).resolves.toBeUndefined();
    execute.mockImplementation(() =>
      Promise.resolve({ ok: false, diagnostic: { kind: 'app', message: { id: 'invented-message' } } }),
    );
    await expect(host.flushStudio(studio)).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'invalidDiagnostic' } },
    });
  });
});
