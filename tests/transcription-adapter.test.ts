import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { ManagedTranscriptionAdapter } from '../src/infrastructure/transcription/adapter';
import { runTranscriptionProcess } from '../src/infrastructure/transcription/process';
import type { AssetAnalysis } from '../src/domain/transcription';

vi.mock('../src/infrastructure/transcription/process', () => ({ runTranscriptionProcess: vi.fn() }));
const directories: string[] = [];
afterEach(async () => {
  vi.resetAllMocks();
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function fixture(changeSource = false) {
  const root = await mkdtemp(join(tmpdir(), 'vandashi-transcription-adapter-'));
  directories.push(root);
  const path = join(root, 'audio.wav');
  await writeFile(path, 'original audio');
  const hash = createHash('sha256').update('original audio').digest('hex');
  const value: AssetAnalysis = {
    schemaVersion: 1,
    sourceHash: hash,
    category: 'dialog',
    categorySource: 'user',
    transcription: {
      status: 'complete',
      engine: 'whisperx',
      model: 'tiny',
      language: 'en',
      duration: 1,
      alignment: 'word',
      segments: [{ start: 0, end: 1, text: 'Hello' }],
      words: [{ start: 0, end: 1, text: 'Hello' }],
    },
  };
  vi.mocked(runTranscriptionProcess).mockImplementation(
    async (command, args, _environment, _signal, onLine) => {
      if (command === 'ffprobe-test') return JSON.stringify({ streams: [{ codec_type: 'audio' }] });
      if (command === 'ffmpeg-test') {
        await writeFile(args.at(-1) ?? '', 'pcm');
        return '';
      }
      const request: unknown = JSON.parse(await readFile(args.at(-1) ?? '', 'utf8'));
      expect(request).toMatchObject({ readOnly: true });
      if (changeSource) await writeFile(path, 'external changed audio');
      onLine?.(JSON.stringify({ type: 'result', value }));
      return '';
    },
  );
  const adapter = new ManagedTranscriptionAdapter({
    cacheDirectory: join(root, 'missing-cache'),
    processExecutable: 'python-test',
    ffmpegPath: 'ffmpeg-test',
    ffprobePath: 'ffprobe-test',
    readOnly: true,
  });
  return { adapter, root, path, value };
}

it('offline analysis reads prepared worker output without creating a host-cache lock', async () => {
  const test = await fixture();
  expect(
    await test.adapter.analyze(
      { path: test.path, kind: 'audio', category: 'dialog', model: 'tiny' },
      () => undefined,
    ),
  ).toEqual(test.value);
  expect(await readdir(test.root)).toEqual(['audio.wav']);
  await test.adapter.dispose();
});

it('rejects evidence if the media changes while the worker is running and preserves the external bytes', async () => {
  const test = await fixture(true);
  await expect(
    test.adapter.analyze(
      { path: test.path, kind: 'audio', category: 'dialog', model: 'tiny' },
      () => undefined,
    ),
  ).rejects.toMatchObject({ diagnostic: { message: { id: 'appTranscriptionChanged' } } });
  expect(await readFile(test.path, 'utf8')).toBe('external changed audio');
  await test.adapter.dispose();
});
