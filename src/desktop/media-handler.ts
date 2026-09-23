import { stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { mediaRequestPath } from './validation';
import type { PathPermissions } from './path-permissions';

interface ByteRange {
  start: number;
  end: number;
}

function byteRange(value: string | null, size: number): ByteRange | null | 'invalid' {
  // Multipart and unknown range units may be ignored; return the complete representation instead.
  if (!value || !value.startsWith('bytes=') || value.includes(',')) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) return 'invalid';
  const first = Number(match[1]);
  const last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return 'invalid';
  const start = match[1] ? first : Math.max(0, size - last);
  const end = match[1] && match[2] ? Math.min(last, size - 1) : size - 1;
  return start >= size || end < start ? 'invalid' : { start, end };
}

type FileFetch = (url: string, options: RequestInit) => Promise<Response>;

/** Authorize every request before fetching bytes, including a player's subsequent seek requests. */
export function createMediaHandler(permissions: Pick<PathPermissions, 'file'>, fetchFile: FileFetch) {
  return async (request: Request): Promise<Response> => {
    try {
      const requested = mediaRequestPath(request.url, request.method);
      const allowed = await permissions.file(requested);
      const { size } = await stat(allowed);
      // A conditional range without our own validator must fall back to the whole current file.
      const range = byteRange(
        request.method === 'HEAD' || request.headers.has('If-Range') ? null : request.headers.get('Range'),
        size,
      );
      const headers = new Headers({
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      });
      if (range === 'invalid') {
        headers.set('Content-Range', `bytes */${String(size)}`);
        return new Response(null, { status: 416, headers });
      }
      const fileHeaders = new Headers();
      if (range) fileHeaders.set('Range', `bytes=${String(range.start)}-${String(range.end)}`);
      const response = await fetchFile(pathToFileURL(allowed).href, {
        method: request.method,
        headers: fileHeaders,
        signal: request.signal,
      });
      if (!response.ok) return new Response(null, { status: response.status, headers });
      // Electron's file fetch honors Range in its body, but reports 200 and omits HTTP range metadata.
      // Reconstruct those headers so Chromium can seek rather than treating every response as a live stream.
      headers.set('Content-Length', String(range ? range.end - range.start + 1 : size));
      headers.set('Content-Type', response.headers.get('Content-Type') ?? 'application/octet-stream');
      if (range)
        headers.set('Content-Range', `bytes ${String(range.start)}-${String(range.end)}/${String(size)}`);
      if (request.method === 'HEAD') await response.body?.cancel();
      return new Response(request.method === 'HEAD' ? null : response.body, {
        status: range ? 206 : 200,
        headers,
      });
    } catch {
      return new Response(null, { status: 403 });
    }
  };
}
