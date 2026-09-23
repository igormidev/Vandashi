import { access, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { inspectionProcess } from '../src/infrastructure/media/inspection-process';

const executable = process.env['VANDASHI_PACKAGED_APP'];
const modelPath = process.env['VANDASHI_SPEECH_MODEL_PATH'];
const fixturePath = process.env['VANDASHI_SPEECH_FIXTURES'];
const segmentSchema = z.array(
  z.object({ start: z.number(), end: z.number(), text: z.string(), language: z.string() }),
);

it.skipIf(!executable || !modelPath || !fixturePath)(
  'runs the packaged CPU worker and native ONNX resources under Electron with a minimal desktop PATH',
  async () => {
    if (!executable || !modelPath || !fixturePath)
      throw new Error('Packaged speech fixture variables are required.');
    const root = await mkdtemp(join(tmpdir(), 'vandashi-packaged-speech-'));
    const resources =
      process.platform === 'darwin'
        ? join(dirname(executable), '..', 'Resources')
        : join(dirname(executable), 'resources');
    const application = join(resources, 'app');
    const worker = join(application, 'out', 'main', 'speech-worker.js');
    const environment = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ...(process.platform === 'win32' ? {} : { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }),
    };
    try {
      await access(worker);
      await access(
        join(
          application,
          'node_modules',
          'onnxruntime-node',
          'bin',
          'napi-v6',
          process.platform,
          process.arch,
          'onnxruntime_binding.node',
        ),
      );
      const samples = [];
      for (const [index, name] of ['english', 'portuguese'].entries()) {
        const path = join(fixturePath, `${name}.pcm`);
        samples.push({ path, start: index * 30, duration: (await stat(path)).size / 4 / 16_000 });
      }
      const request = join(root, 'request.json');
      await writeFile(request, JSON.stringify({ modelPath, samples }));
      const englishBefore = await readFile(samples[0]?.path ?? '');
      const output = await inspectionProcess(
        executable,
        [worker, request],
        environment,
        new AbortController().signal,
        120_000,
      );
      const result = segmentSchema.parse(JSON.parse(output.toString()) as unknown);
      const english = result.filter((entry) => entry.language === 'en');
      const portuguese = result.filter((entry) => entry.language === 'pt');
      expect(english.map((entry) => entry.text).join(' ')).toMatch(/blue bicycle.*yellow house/i);
      expect(portuguese.map((entry) => entry.text).join(' ')).toMatch(/bicicleta azul.*casa amarela/i);
      expect(english.every((entry) => entry.start >= 0 && entry.end <= 30)).toBe(true);
      expect(portuguese.every((entry) => entry.start >= 30 && entry.end <= 60)).toBe(true);
      expect(await readFile(samples[0]?.path ?? '')).toEqual(englishBefore);
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
  150_000,
);
