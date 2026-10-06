import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readFilePreview } from '../src/infrastructure/file-preview';
let root = '';
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});
describe('bounded document previews', () => {
  it('returns HTML as inert text and rejects malformed PDF containers', async () => {
    root = await mkdtemp(join(tmpdir(), 'vandashi-file-preview-'));
    const html = join(root, 'example.html');
    await writeFile(html, '<script>danger()</script>');
    expect(await readFilePreview(html, '')).toEqual({ kind: 'text', text: '<script>danger()</script>' });
    const pdf = join(root, 'fake.pdf');
    await writeFile(pdf, 'not a PDF');
    await expect(readFilePreview(pdf, '')).rejects.toThrow();
  });
  it('refuses source symlinks and oversized text instead of exposing unrestricted file reads', async () => {
    root = await mkdtemp(join(tmpdir(), 'vandashi-file-preview-'));
    const source = join(root, 'source.txt');
    await writeFile(source, 'private');
    const link = join(root, 'link.txt');
    await symlink(source, link);
    await expect(readFilePreview(link, '')).rejects.toThrow();
    await writeFile(source, 'x'.repeat(2_000_001));
    await expect(readFilePreview(source, '')).rejects.toThrow();
  });
});
