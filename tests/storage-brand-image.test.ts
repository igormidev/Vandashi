import { createHash } from 'node:crypto';
import type * as FileSystem from 'node:fs/promises';
import { mkdtemp, mkdir, open, readFile, realpath, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { brandImageRevision } from '../src/infrastructure/storage/brand-image';

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FileSystem>();
  return { ...actual, open: vi.fn(actual.open) };
});

let root = '';
let identity = '';
beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'vandashi-brand-image-')));
  identity = join(root, 'brand_identity');
  await mkdir(identity);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe('verified brand image fingerprint', () => {
  it('hashes all actual bytes rather than image name or file metadata', async () => {
    const bytes = Buffer.alloc(150_000, 42);
    await writeFile(join(identity, 'brand_icon.png'), bytes);
    expect(await brandImageRevision(identity, 'brand_icon.png')).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    bytes[100_000] = 43;
    await writeFile(join(identity, 'brand_icon.png'), bytes);
    expect(await brandImageRevision(identity, 'brand_icon.png')).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
  });

  it('represents absent images without claiming any verified bytes', async () => {
    expect(await brandImageRevision(identity, '')).toBeNull();
    expect(await brandImageRevision(identity, 'missing.png')).toBeNull();
  });

  it('rejects bytes changed between inspection and opening, and closes its owned handle', async () => {
    const path = join(identity, 'brand_icon.png');
    await writeFile(path, 'old image bytes');
    const handle = await open(path, 'r');
    vi.mocked(open).mockImplementationOnce(async () => {
      await writeFile(path, 'new external image bytes');
      return handle;
    });
    await expect(brandImageRevision(identity, 'brand_icon.png')).rejects.toMatchObject({
      diagnostic: { message: { id: 'storageWorkspaceConflict' } },
    });
    expect(await readFile(path, 'utf8')).toBe('new external image bytes');
    await expect(handle.stat()).rejects.toMatchObject({ code: 'EBADF' });
  });

  it('rejects a directory and an image exceeding the bounded read size', async () => {
    await mkdir(join(identity, 'directory.png'));
    await expect(brandImageRevision(identity, 'directory.png')).rejects.toThrow();
    const large = join(identity, 'large.png');
    await writeFile(large, '');
    await truncate(large, 50 * 1024 * 1024 + 1);
    await expect(brandImageRevision(identity, 'large.png')).rejects.toMatchObject({
      diagnostic: { message: { id: 'storageBrandImageSize' } },
    });
  });

  it('rejects outside paths before reading any bytes', async () => {
    const outside = join(root, 'outside.png');
    await writeFile(outside, 'private bytes');
    for (const selected of ['../outside.png', outside])
      await expect(brandImageRevision(identity, selected)).rejects.toMatchObject({
        diagnostic: { message: { id: 'storagePathOutside' } },
      });
  });

  it.skipIf(process.platform === 'win32')('rejects internal and escaping image symlinks', async () => {
    await writeFile(join(root, 'outside.png'), 'outside');
    await writeFile(join(identity, 'inside.png'), 'inside');
    await symlink(join(root, 'outside.png'), join(identity, 'escape.png'));
    await symlink(join(identity, 'inside.png'), join(identity, 'link.png'));
    await expect(brandImageRevision(identity, 'escape.png')).rejects.toMatchObject({
      diagnostic: { message: { id: 'storageSymlinkOutside' } },
    });
    await expect(brandImageRevision(identity, 'link.png')).rejects.toMatchObject({
      diagnostic: { message: { id: 'storageBrandImageSize' } },
    });
  });
});
