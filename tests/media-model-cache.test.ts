import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ensureSpeechModel, type SpeechModel } from '../src/infrastructure/media/model-cache';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.map((path) => rm(path, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'vandashi-model-cache-'));
  directories.push(root);
  const bytes = Buffer.from('Verified fixture model');
  const manifest: SpeechModel = {
    id: 'owner/model',
    revision: 'abc123',
    files: [
      { path: 'config.json', size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') },
    ],
  };
  return { root, bytes, manifest, target: join(root, 'whisper-base-q8', 'abc123', 'config.json') };
}
it('pins requests, verifies exact bytes, reuses a valid cache and repairs corrupt files atomically', async () => {
  const data = await fixture();
  const download = vi.fn<typeof fetch>(() => Promise.resolve(new Response(data.bytes)));
  const progress = vi.fn<(fraction: number) => void>();
  const signal = new AbortController().signal;
  const path = await ensureSpeechModel(data.root, signal, progress, data.manifest, download);
  expect(download.mock.calls[0]?.[0]).toBe('https://huggingface.co/owner/model/resolve/abc123/config.json');
  expect(await readFile(data.target)).toEqual(data.bytes);
  await ensureSpeechModel(data.root, signal, progress, data.manifest, download);
  expect(download).toHaveBeenCalledTimes(1);
  await writeFile(data.target, Buffer.alloc(data.bytes.length));
  await ensureSpeechModel(data.root, signal, progress, data.manifest, download);
  expect(download).toHaveBeenCalledTimes(2);
  expect(await readdir(path)).toEqual(['config.json']);
  expect(progress.mock.calls.every(([value]) => value >= 0 && value <= 1)).toBe(true);
});
it('never publishes wrong checksums, oversized downloads or cancellation partials', async () => {
  const data = await fixture();
  const progress = (): void => undefined;
  const controller = new AbortController();
  for (const bytes of [Buffer.alloc(data.bytes.length), Buffer.alloc(data.bytes.length + 1)]) {
    await expect(
      ensureSpeechModel(data.root, controller.signal, progress, data.manifest, () =>
        Promise.resolve(new Response(bytes)),
      ),
    ).rejects.toThrow();
    expect(await readdir(join(data.root, 'whisper-base-q8', 'abc123'))).toEqual([]);
  }
  const download: typeof fetch = () =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          start(stream) {
            stream.enqueue(data.bytes.subarray(0, 1));
            controller.abort(new Error('Cancelled download'));
            stream.close();
          },
        }),
      ),
    );
  await expect(
    ensureSpeechModel(data.root, controller.signal, progress, data.manifest, download),
  ).rejects.toThrow('Cancelled download');
  expect(await readdir(join(data.root, 'whisper-base-q8', 'abc123'))).toEqual([]);
});
