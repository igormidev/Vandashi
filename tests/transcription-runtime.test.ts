import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadFile, verifiedFile } from '../src/infrastructure/transcription/download';
import { withRuntimeLock } from '../src/infrastructure/transcription/lock';
import { runTranscriptionProcess } from '../src/infrastructure/transcription/process';
import { wheelExecutable } from '../src/infrastructure/transcription/zip';
import { ensureRuntime } from '../src/infrastructure/transcription/setup';

const directories: string[] = [];
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'vandashi-transcription-test-'));
  directories.push(path);
  return path;
}
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe('managed transcription boundaries', () => {
  it('rejects a same-sized corrupted download and retains the prior file without partials', async () => {
    const root = await directory();
    const path = join(root, 'model.bin');
    const wanted = Buffer.from('real-model');
    const manifest = {
      url: 'https://example.invalid/model',
      size: wanted.length,
      sha256: createHash('sha256').update(wanted).digest('hex'),
    };
    await writeFile(path, 'old');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(Buffer.alloc(wanted.length))));
    await expect(
      downloadFile(path, manifest, new AbortController().signal, () => undefined),
    ).rejects.toThrow();
    expect(await readFile(path, 'utf8')).toBe('old');
    expect(await readdir(root)).toEqual(['model.bin']);
    await writeFile(path, wanted);
    expect(await verifiedFile(path, manifest, new AbortController().signal)).toBe(true);
  });

  it('serializes competing app/CLI work and does not release the first owner when a waiter cancels', async () => {
    const root = await directory();
    const started = deferred();
    const finish = deferred();
    const first = withRuntimeLock(root, new AbortController().signal, async () => {
      started.resolve();
      await finish.promise;
    });
    await started.promise;
    const controller = new AbortController();
    const second = withRuntimeLock(root, controller.signal, () => Promise.resolve('second'));
    const rejected = expect(second).rejects.toThrow();
    controller.abort();
    await rejected;
    expect(await readdir(root)).toEqual(['runtime.lock']);
    finish.resolve();
    await first;
    expect(await readdir(root)).toEqual([]);
  });

  it('waits for a cancelled worker to close before returning its owned operation', async () => {
    const root = await directory();
    const script = join(root, 'worker.cjs');
    await writeFile(script, 'process.stdout.write("ready\\n"); setInterval(() => {}, 1000);');
    const controller = new AbortController();
    const started = deferred();
    const worker = runTranscriptionProcess(process.execPath, [script], process.env, controller.signal, () => {
      started.resolve();
    });
    const rejected = expect(worker).rejects.toThrow();
    await started.promise;
    controller.abort();
    await rejected;
  });

  it('does not extract an arbitrary or truncated wheel entry', () => {
    expect(() => wheelExecutable(Buffer.alloc(60), 'uv.data/scripts/uv')).toThrow();
    const archive = Buffer.alloc(100);
    archive.writeUInt32LE(0x02014b50, 0);
    archive.writeUInt16LE(2, 28);
    archive.write('uv', 46);
    archive.writeUInt32LE(1000, 42);
    expect(() => wheelExecutable(archive, 'uv')).toThrow();
  });

  it('preserves transcript Unicode when a multibyte character crosses stdout chunks', async () => {
    const root = await directory();
    const script = join(root, 'unicode.cjs');
    await writeFile(
      script,
      'const bytes=Buffer.from(\'{"text":"é"}\\n\');process.stdout.write(bytes.subarray(0,9));setTimeout(()=>process.stdout.write(bytes.subarray(9)),25);',
    );
    const lines: string[] = [];
    await runTranscriptionProcess(
      process.execPath,
      [script],
      process.env,
      new AbortController().signal,
      (line) => {
        lines.push(line);
      },
    );
    expect(lines).toEqual(['{"text":"é"}']);
  });

  it('leaves an unknown abandoned lock intact and fails within a bounded wait', async () => {
    const root = await directory();
    await writeFile(join(root, 'runtime.lock'), '');
    await expect(
      withRuntimeLock(root, new AbortController().signal, () => Promise.resolve(), 1),
    ).rejects.toThrow();
    expect(await readFile(join(root, 'runtime.lock'), 'utf8')).toBe('');
  });

  it('read-only setup fails without writing a cache or downloading dependencies', async () => {
    const root = await directory();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(
      ensureRuntime(
        join(root, 'missing'),
        join(process.cwd(), 'src/infrastructure/transcription/resources/worker.py'),
        () => undefined,
        new AbortController().signal,
        true,
      ),
    ).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});
