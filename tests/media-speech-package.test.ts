import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { inspectionProcess } from '../src/infrastructure/media/inspection-process';
import { ensureSpeechModel } from '../src/infrastructure/media/model-cache';
import { packagedEnvironment } from './package-environment';
import manifest from './fixtures/speech/manifest.json';

const executable = process.env['VANDASHI_PACKAGED_APP'];
const required = process.env['VANDASHI_REQUIRE_PACKAGED_SMOKE'] === '1';
const fixturePath = resolve('tests/fixtures/speech');
const segmentSchema = z.array(
  z.object({ start: z.number(), end: z.number(), text: z.string(), language: z.string() }),
);

it.skipIf(!executable && !required)(
  'runs the packaged CPU worker and native ONNX resources under Electron with a minimal desktop PATH',
  async () => {
    if (!executable) throw new Error('VANDASHI_PACKAGED_APP is required for packaged verification.');
    const root = await mkdtemp(join(tmpdir(), 'vandashi-packaged-speech-'));
    const resources =
      process.platform === 'darwin'
        ? join(dirname(executable), '..', 'Resources')
        : join(dirname(executable), 'resources');
    const application = join(resources, 'app');
    const worker = join(application, 'out', 'main', 'speech-worker.js');
    const environment: Record<string, string> = { ...packagedEnvironment(), ELECTRON_RUN_AS_NODE: '1' };
    try {
      await access(worker);
      const native = join(
        application,
        'node_modules/onnxruntime-node/bin/napi-v6',
        process.platform,
        process.arch,
      );
      await access(join(native, 'onnxruntime_binding.node'));
      await access(
        join(
          native,
          process.platform === 'win32'
            ? 'onnxruntime.dll'
            : process.platform === 'darwin'
              ? 'libonnxruntime.1.dylib'
              : 'libonnxruntime.so.1',
        ),
      );
      // A cache hit is still verified through the same production manifest/checksum path.
      const modelPath = await ensureSpeechModel(
        process.env['VANDASHI_SPEECH_MODEL_CACHE'] ?? resolve('release/smoke-cache/models'),
        AbortSignal.timeout(240_000),
        () => undefined,
      );
      const samples: { path: string; start: number; duration: number }[] = [];
      for (const [index, fixture] of manifest.fixtures.entries()) {
        const original = join(fixturePath, fixture.file);
        const bytes = await readFile(original);
        expect(bytes.length).toBe(fixture.bytes);
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(fixture.sha256);
        const path = join(root, `${fixture.language}.pcm`);
        const ffmpeg = environment['HYPERFRAMES_FFMPEG_PATH'];
        if (!ffmpeg) throw new Error('FFmpeg is required to decode the speech fixtures.');
        await inspectionProcess(
          ffmpeg,
          ['-v', 'error', '-i', original, '-ar', '16000', '-ac', '1', '-f', 'f32le', path],
          environment,
          new AbortController().signal,
        );
        const duration = (await stat(path)).size / 4 / 16_000;
        expect(duration).toBeGreaterThan(1);
        expect(duration).toBeLessThanOrEqual(30);
        samples.push({ path, start: index * 30, duration });
      }
      const request = join(root, 'request.json');
      await writeFile(request, JSON.stringify({ modelPath, samples }));
      const output = await inspectionProcess(
        executable,
        [worker, request],
        environment,
        new AbortController().signal,
        120_000,
      );
      const result = segmentSchema.parse(JSON.parse(output.toString()) as unknown);
      for (const [index, fixture] of manifest.fixtures.entries()) {
        const spoken = result.filter((entry) => entry.language === fixture.language);
        expect(spoken.length).toBeGreaterThan(0);
        const text = spoken
          .map((entry) => entry.text)
          .join(' ')
          .toLowerCase();
        for (const subject of fixture.expected) expect(text).toContain(subject);
        expect(
          spoken.every(
            (entry) => entry.start >= index * 30 && entry.end <= index * 30 + (samples[index]?.duration ?? 0),
          ),
        ).toBe(true);
        expect(
          createHash('sha256')
            .update(await readFile(join(fixturePath, fixture.file)))
            .digest('hex'),
        ).toBe(fixture.sha256);
      }
      await expect(
        inspectionProcess(executable, [worker, request], environment, new AbortController().signal, 20),
      ).rejects.toThrow('timed out');
      const abort = new AbortController();
      const running = inspectionProcess(executable, [worker, request], environment, abort.signal);
      abort.abort(new Error('Cancel packaged speech inspection'));
      await expect(running).rejects.toThrow('Cancel packaged speech inspection');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
  420_000,
);
