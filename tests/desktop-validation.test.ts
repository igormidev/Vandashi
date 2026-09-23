import { mkdtemp, mkdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  externalUrl,
  mediaRequestPath,
  parseInvocation,
  PathPermissions,
  rendererLocation,
  trustedSender,
} from '../src/desktop/validation';
import { containedPath } from '../src/infrastructure/storage/files';
import { settingsSchema } from '../src/infrastructure/storage/schemas';
import { defaultSettings } from '../src/domain/defaults';
import { desktopMessages } from '../src/desktop/messages';

const scope = { brandId: 'brand', videoId: null, clipId: null };

describe('desktop IPC request boundary', () => {
  it('reports the recovered filename and the preserved original location', () => {
    expect(
      desktopMessages.recovery('video_packaging.yml', '/brand/video/.vandashi-recovery/packaging.invalid'),
    ).toContain('video_packaging.yml');
    expect(
      desktopMessages.recovery('video_packaging.yml', '/brand/video/.vandashi-recovery/packaging.invalid'),
    ).toContain('/brand/video/.vandashi-recovery/packaging.invalid');
    expect(desktopMessages.recovery('launch.yml', null)).toContain('missing launch.yml');
  });
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'missing'])(
    'rejects unknown and inherited operation %s',
    (name) => {
      expect(() => parseInvocation(name, [])).toThrow('Unknown operation');
    },
  );
  it('rejects prototype keys, deep/large payloads, unexpected fields, and wrong shapes', () => {
    expect(() => parseInvocation('settings', JSON.parse('[{"__proto__":{"admin":true}}]'))).toThrow(
      'Unsafe request key',
    );
    expect(() => parseInvocation('openWorkspace', [{ ...scope, admin: true }])).toThrow();
    expect(() => parseInvocation('createBrand', [{ parentPath: '/tmp\0/private', name: 'Brand' }])).toThrow();
    expect(() => parseInvocation('getState', [null])).toThrow();
    expect(() => parseInvocation('saveScript', ['x'.repeat(8_000_001)])).toThrow('too large');
    let nested: unknown = null;
    for (let index = 0; index < 30; index += 1) nested = [nested];
    expect(() => parseInvocation('getState', nested)).toThrow('too large');
  });
  it('accepts the actual split preferences consistently at IPC and storage', () => {
    const settings = { ...defaultSettings, splits: { brand: 38, assets: 25, creation: 75 } };
    expect(parseInvocation('settings', [settings]).args[0]).toEqual(settings);
    expect(settingsSchema.parse(settings)).toEqual(settings);
    expect(() => parseInvocation('settings', [{ ...settings, splits: { brand: 0.38 } }])).toThrow();
    expect(() => settingsSchema.parse({ ...settings, splits: { brand: 99 } })).toThrow();
    expect(() => parseInvocation('settings', [{ ...settings, locale: 'arbitrary' }])).toThrow();
  });
  it('requires the exact expected top-level frame and its trusted location', () => {
    const frame = { url: 'file:///app/index.html' };
    const contents = { mainFrame: frame };
    expect(trustedSender({ sender: contents, senderFrame: frame }, contents, frame.url)).toBe(true);
    expect(trustedSender({ sender: {}, senderFrame: frame }, contents, frame.url)).toBe(false);
    expect(trustedSender({ sender: contents, senderFrame: { url: frame.url } }, contents, frame.url)).toBe(
      false,
    );
    expect(trustedSender({ sender: contents, senderFrame: null }, contents, frame.url)).toBe(false);
    expect(trustedSender({ sender: contents, senderFrame: frame }, contents, 'https://attacker.test/')).toBe(
      false,
    );
    expect(rendererLocation(true, 'https://attacker.test/', frame.url)).toBe(frame.url);
    expect(() => rendererLocation(false, 'http://localhost.attacker.test/', frame.url)).toThrow('loopback');
    expect(rendererLocation(false, 'http://127.0.0.1:5173', frame.url)).toBe('http://127.0.0.1:5173/');
  });
  it('restricts shell links and media requests to their intended formats', () => {
    expect(() => externalUrl('file:///private/secret')).toThrow();
    expect(() => externalUrl('javascript:alert(1)')).toThrow();
    expect(() => externalUrl('https://user:password@example.com')).toThrow();
    expect(externalUrl('https://example.com/guide')).toBe('https://example.com/guide');
    const media = (path: string) => `vandashi-media://local/file?path=${encodeURIComponent(path)}`;
    expect(mediaRequestPath(media('/safe/scene.mp4'), 'GET')).toBe('/safe/scene.mp4');
    expect(mediaRequestPath(media('/safe/brand.svg'), 'GET')).toBe('/safe/brand.svg');
    for (const file of ['index.html', 'registry.json', 'script.js', '.git/config'])
      expect(() => mediaRequestPath(media(`/safe/${file}`), 'GET')).toThrow();
    expect(() => mediaRequestPath(media('/safe/scene.mp4'), 'POST')).toThrow();
    expect(() => mediaRequestPath('vandashi-media://attacker/file?path=/safe/image.png', 'GET')).toThrow();
  });
});

describe('native file selection capabilities', () => {
  let directory = '';
  let workspace = '';
  let external = '';
  let permissions: PathPermissions;
  beforeEach(async () => {
    directory = await realpath(await mkdtemp(join(tmpdir(), 'vandashi-desktop-')));
    workspace = join(directory, 'workspace');
    external = join(directory, 'private.png');
    await mkdir(workspace);
    await writeFile(external, 'private');
    permissions = new PathPermissions((value) => containedPath(workspace, value));
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('rejects arbitrary source paths until the native picker or actual drop grants them', async () => {
    await expect(permissions.authorize('describeAsset', [{ scope, path: external }])).rejects.toThrow(
      'outside',
    );
    await expect(permissions.authorize('importThumbnail', [{ scope, sourcePath: external }])).rejects.toThrow(
      'outside',
    );
    await expect(
      permissions.authorize('sendChat', [{ sessionId: 'id', attachments: [external] }]),
    ).rejects.toThrow('outside');
    const pendingGrant = permissions.grantFile(external);
    await expect(
      permissions.authorize('describeAsset', [{ scope, path: external }]),
    ).resolves.toBeUndefined();
    await pendingGrant;
    await expect(
      permissions.authorize('sendChat', [{ sessionId: 'id', attachments: [external] }]),
    ).resolves.toBeUndefined();
  });
  it('allows registered workspace files but rejects escaping symlinks', async () => {
    const asset = join(workspace, 'asset.png');
    await writeFile(asset, 'asset');
    await expect(permissions.file(asset)).resolves.toBe(asset);
    await symlink(external, join(workspace, 'escape.png'));
    await expect(permissions.file(join(workspace, 'escape.png'))).rejects.toThrow('symbolic link');
  });
  it('requires a native directory selection before creating a brand', async () => {
    const input = { parentPath: directory, name: 'Brand' };
    await expect(permissions.authorize('createBrand', [input])).rejects.toThrow('folder picker');
    await permissions.grantDirectory(directory);
    await expect(permissions.authorize('createBrand', [input])).resolves.toBeUndefined();
  });

  it('requires a file grant when a saved brand configuration imports an external image', async () => {
    const input = { scope, brandConfig: { image: external } };
    await expect(permissions.authorize('saveWorkspace', [input])).rejects.toThrow('outside');
    await permissions.grantFile(external);
    await expect(permissions.authorize('saveWorkspace', [input])).resolves.toBeUndefined();
    await expect(
      permissions.authorize('saveWorkspace', [{ scope, brandConfig: { image: 'brand_icon.png' } }]),
    ).resolves.toBeUndefined();
  });
  it('does not reuse a selection after its path is replaced with a redirect', async () => {
    await permissions.grantFile(external);
    const alternate = join(directory, 'other.png');
    await writeFile(alternate, 'other');
    await rm(external);
    await symlink(alternate, external);
    await expect(permissions.file(external)).rejects.toThrow('changed location');
  });
});
