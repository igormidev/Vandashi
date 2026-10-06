import { access, mkdir, mkdtemp, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { macBrowserIcon } from '../src/infrastructure/mac-browser-icon';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
  'base64',
);
let root = '';
let bundle = '';
let resources = '';
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'vandashi-browser-icon-test-'));
  bundle = join(root, 'Browser.app');
  resources = join(bundle, 'Contents/Resources');
  await mkdir(resources, { recursive: true });
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

it('converts the extensionless declared icon from owned bytes and disposes its temporary files', async () => {
  const source = Buffer.from('installed application icon bytes');
  await writeFile(join(resources, 'AppIcon.icns'), source);
  let converted = '';
  const result = await macBrowserIcon(bundle, 'AppIcon', async (input, output) => {
    converted = dirname(input);
    expect(await readFile(input)).toEqual(source);
    await writeFile(output, png);
  });
  expect(result).toBe(`data:image/png;base64,${png.toString('base64')}`);
  expect(await readFile(join(resources, 'AppIcon.icns'))).toEqual(source);
  await expect(access(converted)).rejects.toMatchObject({ code: 'ENOENT' });
});

it('rejects malformed declarations and oversized resources before invoking the converter', async () => {
  const convert = vi.fn();
  for (const name of [null, '', '../secret.icns', '/private/secret.icns'])
    expect(await macBrowserIcon(bundle, name, convert)).toBeNull();
  await writeFile(join(resources, 'Large.icns'), '');
  await truncate(join(resources, 'Large.icns'), 8_000_001);
  expect(await macBrowserIcon(bundle, 'Large.icns', convert)).toBeNull();
  expect(convert).not.toHaveBeenCalled();
});

it.skipIf(process.platform === 'win32')(
  'rejects icon and resource-directory symlinks outside the bundle',
  async () => {
    await writeFile(join(root, 'private.png'), png);
    await symlink(join(root, 'private.png'), join(resources, 'Escape.icns'));
    const convert = vi.fn();
    expect(await macBrowserIcon(bundle, 'Escape.icns', convert)).toBeNull();
    await rm(resources, { recursive: true });
    await symlink(root, resources);
    expect(await macBrowserIcon(bundle, 'private.png', convert)).toBeNull();
    expect(convert).not.toHaveBeenCalled();
  },
);

it('keeps conversion failure recoverable and rejects invalid or oversized PNG results', async () => {
  await writeFile(join(resources, 'app.icns'), png);
  let temporary = '';
  expect(
    await macBrowserIcon(bundle, 'app.icns', (input) => {
      temporary = dirname(input);
      return Promise.reject(new Error('Controlled converter failure'));
    }),
  ).toBeNull();
  await expect(access(temporary)).rejects.toMatchObject({ code: 'ENOENT' });
  for (const invalid of [Buffer.alloc(24), Buffer.alloc(64_001)]) {
    expect(
      await macBrowserIcon(bundle, 'app.icns', async (_input, output) => {
        await writeFile(output, invalid);
      }),
    ).toBeNull();
  }
  expect(
    await macBrowserIcon(bundle, 'app.icns', async (_input, output) => {
      await writeFile(output, png);
    }),
  ).toBe(`data:image/png;base64,${png.toString('base64')}`);
});
