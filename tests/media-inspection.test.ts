import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { AssetInspector } from '../src/infrastructure/media/asset-inspection';
import { sampleFrames, speechWindows } from '../src/infrastructure/media/inspection-samples';
import { probeMedia } from '../src/infrastructure/media/diagnostics';
import { inspectionProcess } from '../src/infrastructure/media/inspection-process';
import {
  audibleSamples,
  plausibleTranscript,
  speechScores,
} from '../src/infrastructure/media/speech-quality';
import { resolveMediaRuntime, runProcess } from '../src/infrastructure/media/runtime';
import { resolveMediaBinary } from '../src/infrastructure/media/binaries';

it('samples at most 90 seconds without overlapping short recordings', () => {
  expect(speechWindows(12)).toEqual([{ start: 0, duration: 12 }]);
  expect(speechWindows(65)).toEqual([
    { start: 0, duration: 30 },
    { start: 30, duration: 30 },
    { start: 60, duration: 5 },
  ]);
  expect(speechWindows(600)).toEqual([
    { start: 0, duration: 30 },
    { start: 285, duration: 30 },
    { start: 570, duration: 30 },
  ]);
});

it('rejects silence, invalid samples, repetition and implausibly fast hallucinations', () => {
  expect(audibleSamples(new Float32Array(16_000))).toBe(false);
  expect(audibleSamples(Float32Array.from({ length: 16_000 }, () => NaN))).toBe(false);
  expect(audibleSamples(Float32Array.from({ length: 16_000 }, (_, index) => Math.sin(index) * 0.2))).toBe(
    true,
  );
  expect(plausibleTranscript('e o que é '.repeat(30), 10)).toBe(false);
  expect(plausibleTranscript('M'.repeat(100), 10)).toBe(false);
  expect(plausibleTranscript('...', 10)).toBe(false);
  expect(plausibleTranscript('The blue bicycle stands beside a yellow house.', 6)).toBe(true);
  expect(plausibleTranscript('A bicicleta azul está ao lado de uma casa amarela.', 6)).toBe(true);
  const logits = new Float32Array(51_865).fill(-100);
  logits[50_362] = 10;
  logits[1] = 0;
  logits[2] = 1;
  expect(speechScores(logits, { '<|en|>': 1, '<|pt|>': 2 })).toMatchObject({ language: 'pt' });
  expect(speechScores(logits, { '<|en|>': 1, '<|pt|>': 2 }).noSpeech).toBeGreaterThan(0.99);
});

it('waits for an aborted child to exit and enforces the output bound', async () => {
  const controller = new AbortController();
  const operation = inspectionProcess(
    process.execPath,
    ['-e', 'setInterval(()=>{},1000)'],
    process.env,
    controller.signal,
  );
  controller.abort(new Error('Fixture cancelled'));
  await expect(operation).rejects.toThrow('Fixture cancelled');
  await expect(
    inspectionProcess(
      process.execPath,
      ['-e', 'process.stdout.write("a".repeat(1024))'],
      process.env,
      new AbortController().signal,
      5000,
      10,
    ),
  ).rejects.toThrow('output limit');
});

it.skipIf(process.env['VANDASHI_MEDIA_SMOKE'] !== '1')(
  'extracts real frames and silence without changing source bytes, and disposes its lease',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'vandashi-inspection-test-'));
    const runtime = resolveMediaRuntime();
    const inspector = new AssetInspector(runtime, {});
    const path = join(root, 'source.mp4');
    try {
      await runProcess(
        resolveMediaBinary('ffmpeg', runtime.environment),
        [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=320x180:rate=10:duration=2',
          '-f',
          'lavfi',
          '-i',
          'anullsrc=r=16000:cl=mono',
          '-t',
          '2',
          '-c:v',
          'libx264',
          '-c:a',
          'aac',
          path,
        ],
        runtime.environment,
      );
      const before = await readFile(path);
      const lease = await inspector.inspect(path);
      expect(lease.sourceHash).toBe(createHash('sha256').update(before).digest('hex'));
      expect(lease.kind).toBe('video');
      expect(lease.images).toHaveLength(6);
      expect(lease.images.map((frame) => frame.seconds)).toEqual(
        [...lease.images.map((frame) => frame.seconds)].sort((a, b) => a - b),
      );
      for (const frame of lease.images) expect((await stat(frame.path)).size).toBeGreaterThan(500);
      expect(lease.transcript).toEqual([]);
      expect(lease.note).toMatchObject({ frames: 6, sampledSeconds: 2, speech: 'none' });
      expect(await readFile(path)).toEqual(before);
      const imagePath = lease.images[0]?.path;
      if (!imagePath) throw new Error('Missing sampled frame');
      await lease.dispose();
      await expect(stat(imagePath)).rejects.toThrow();
      const replacement = Buffer.from(before);
      replacement[replacement.length - 1] = (replacement[replacement.length - 1] ?? 0) ^ 1;
      await expect(
        inspector.inspect(path, (progress) => {
          if (progress.phase === 'frames' && progress.progress === 1) writeFileSync(path, replacement);
        }),
      ).rejects.toThrow('changed while it was being inspected');
      expect(await readFile(path)).toEqual(replacement);
      await inspector.dispose();
      await expect(inspector.inspect(path)).rejects.toThrow('closed');
    } finally {
      await inspector.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
  30_000,
);

it.skipIf(process.env['VANDASHI_MEDIA_SMOKE'] !== '1')(
  'keeps existing sampled frames when an audio tail extends beyond the last video frame',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vandashi-video-tail-'));
    const source = join(directory, 'audio-tail.mp4');
    const runtime = resolveMediaRuntime();
    try {
      await runProcess(
        resolveMediaBinary('ffmpeg', runtime.environment),
        [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=160x90:rate=10:duration=2',
          '-f',
          'lavfi',
          '-i',
          'anullsrc=r=16000:cl=mono',
          '-t',
          '8',
          '-c:v',
          'libx264',
          '-c:a',
          'aac',
          source,
        ],
        runtime.environment,
      );
      const original = await readFile(source);
      const probe = await probeMedia(runtime, source);
      expect(probe.duration).toBeCloseTo(8, 1);
      const frames = await sampleFrames(runtime, source, probe, directory, new AbortController().signal);
      expect(frames.length).toBeGreaterThan(0);
      expect(frames.length).toBeLessThan(6);
      for (const frame of frames) {
        expect(frame.seconds).toBeLessThan(2);
        expect((await stat(frame.path)).size).toBeGreaterThan(0);
      }
      expect(await readFile(source)).toEqual(original);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  30_000,
);
