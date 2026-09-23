import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMediaHandler } from '../src/desktop/media-handler';
import { PathPermissions } from '../src/desktop/path-permissions';

describe('authorized local media byte ranges', () => {
  let directory: string;
  let path: string;
  let url: string;
  let permissions: PathPermissions;
  const bytes = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const fetchFile = vi.fn(async (url: string, options: RequestInit) => {
    const data = new Uint8Array(await readFile(fileURLToPath(url)));
    const range = new Headers(options.headers).get('Range');
    const match = range ? /^bytes=(\d+)-(\d+)$/.exec(range) : null;
    // Match Electron's file fetch: correct sliced body, status 200, no range metadata.
    return new Response(
      options.method === 'HEAD' ? null : match ? data.slice(Number(match[1]), Number(match[2]) + 1) : data,
      {
        headers: { 'Content-Type': 'video/mp4' },
      },
    );
  });
  const request = (range?: string, method = 'GET', headers: Record<string, string> = {}) =>
    new Request(url, {
      method,
      headers: { ...(range ? { Range: range } : {}), ...headers },
    });

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vandashi-media-handler-'));
    path = join(directory, 'selected video.mp4');
    url = `vandashi-media://local/file?path=${encodeURIComponent(path)}`;
    await writeFile(path, bytes);
    permissions = new PathPermissions(() => Promise.reject(new Error('Not granted')));
    await permissions.grantFile(path);
    fetchFile.mockClear();
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it.each([
    ['bytes=2-5', 2, 5],
    ['bytes=6-', 6, 9],
    ['bytes=-3', 7, 9],
    ['bytes=6-100', 6, 9],
    ['bytes=-100', 0, 9],
  ])('serves exact inclusive bytes and seek metadata for %s', async (range, start, end) => {
    const response = await createMediaHandler(permissions, fetchFile)(request(range));
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Length')).toBe(String(end - start + 1));
    expect(response.headers.get('Content-Range')).toBe(`bytes ${String(start)}-${String(end)}/10`);
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('Content-Type')).toBe('video/mp4');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes.slice(start, end + 1));
  });

  it.each(['bytes=10-', 'bytes=8-3', 'bytes=-0', 'bytes=-', 'bytes=abc', 'bytes=99999999999999999999-'])(
    'rejects an unsatisfiable or invalid range %s without opening a stream',
    async (range) => {
      const response = await createMediaHandler(permissions, fetchFile)(request(range));
      expect(response.status).toBe(416);
      expect(response.headers.get('Content-Range')).toBe('bytes */10');
      expect((await response.arrayBuffer()).byteLength).toBe(0);
      expect(fetchFile).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, 'items=1-2', 'bytes=0-1,5-6'])(
    'serves complete bytes when Range is absent or ignored: %s',
    async (range) => {
      const response = await createMediaHandler(permissions, fetchFile)(request(range));
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Length')).toBe('10');
      expect(response.headers.get('Content-Range')).toBeNull();
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    },
  );

  it('preserves security policy and ignores a conditional range without a matching validator', async () => {
    const response = await createMediaHandler(
      permissions,
      fetchFile,
    )(request('bytes=2-3', 'GET', { 'If-Range': '"old-file"' }));
    expect(response.status).toBe(200);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(response.headers.get('Content-Security-Policy')).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    );
  });

  it('answers HEAD without a body and returns a valid empty representation', async () => {
    const handler = createMediaHandler(permissions, fetchFile);
    const head = await handler(request('bytes=2-3', 'HEAD'));
    expect(head.status).toBe(200);
    expect(head.headers.get('Content-Length')).toBe('10');
    expect(head.body).toBeNull();
    await writeFile(path, '');
    const empty = await handler(request());
    expect(empty.status).toBe(200);
    expect(empty.headers.get('Content-Length')).toBe('0');
    expect((await empty.arrayBuffer()).byteLength).toBe(0);
    expect((await handler(request('bytes=0-'))).status).toBe(416);
  });

  it('rechecks grants and refuses a replaced symlink before every seek request', async () => {
    const handler = createMediaHandler(permissions, fetchFile);
    const unselected = join(directory, 'unselected.mp4');
    await writeFile(unselected, 'private data');
    const denied = await handler(
      new Request(`vandashi-media://local/file?path=${encodeURIComponent(unselected)}`),
    );
    expect(denied.status).toBe(403);
    await rm(path);
    await symlink(unselected, path);
    expect((await handler(request('bytes=2-3'))).status).toBe(403);
    expect(fetchFile).not.toHaveBeenCalled();
  });

  it('rejects unsupported methods, file types, and forged endpoints before reading bytes', async () => {
    const handler = createMediaHandler(permissions, fetchFile);
    const config = join(directory, 'secrets.json');
    await writeFile(config, '{}');
    await permissions.grantFile(config);
    for (const invalid of [
      request(undefined, 'POST'),
      new Request(`vandashi-media://local/file?path=${encodeURIComponent(config)}`),
      new Request(url.replace('://local/', '://elsewhere/')),
    ])
      expect((await handler(invalid)).status).toBe(403);
    expect(fetchFile).not.toHaveBeenCalled();
  });
});
