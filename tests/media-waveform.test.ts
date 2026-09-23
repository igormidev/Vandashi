import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import { applicationFixture } from './application-fixture';
import { AudioWaveforms } from '../src/infrastructure/media/waveform';
import { resolveMediaBinary } from '../src/infrastructure/media/binaries';
import { resolveMediaRuntime, runProcess } from '../src/infrastructure/media/runtime';

it('only generates waveforms for an indexed audio asset in the selected workspace', async () => {
  const app = await applicationFixture();
  try {
    await expect(app.api.assetWaveform({ scope: app.scope, assetId: '../private.wav' })).rejects.toThrow(
      'audio asset',
    );
    expect(app.media.audioWaveform).not.toHaveBeenCalled();
    const source = join(app.path, 'sample.wav');
    await writeFile(source, 'Fixture audio for the mocked media port');
    const asset = await app.store.importAsset({
      scope: app.scope,
      draft: { sourcePath: source, title: 'Sample', description: '', tags: [], kind: 'audio' },
    });
    const expected = Array<number>(100).fill(0.4);
    vi.mocked(app.media.audioWaveform).mockResolvedValueOnce(expected);
    expect(await app.api.assetWaveform({ scope: app.scope, assetId: asset.id })).toEqual(expected);
    expect(app.media.audioWaveform).toHaveBeenCalledWith(asset.path);
  } finally {
    await app.idle();
    await app.cleanup();
  }
});

it.skipIf(process.env['VANDASHI_MEDIA_SMOKE'] !== '1')(
  'streams a real 100 MB recording into a small waveform and invalidates its stat cache',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vandashi-waveform-'));
    const runtime = resolveMediaRuntime();
    const waveforms = new AudioWaveforms(runtime);
    const path = join(directory, 'long recording.wav');
    try {
      await runProcess(
        resolveMediaBinary('ffmpeg', runtime.environment),
        [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=440:sample_rate=48000:duration=600',
          '-af',
          "volume='if(lt(t,300),0.2,1)':eval=frame",
          '-ac',
          '2',
          '-c:a',
          'pcm_s16le',
          '-y',
          path,
        ],
        runtime.environment,
        30_000,
      );
      expect((await stat(path)).size).toBeGreaterThan(100 * 1024 * 1024);
      const peaks = await waveforms.get(path);
      expect(peaks).toHaveLength(100);
      expect(peaks.every((value) => Number.isFinite(value) && value >= 0.02 && value <= 1)).toBe(true);
      expect(peaks[10]).toBeLessThan((peaks[90] ?? 0) / 2);
      expect(await waveforms.get(path)).toEqual(peaks);
      await runProcess(
        resolveMediaBinary('ffmpeg', runtime.environment),
        [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'anullsrc=r=48000:cl=stereo',
          '-t',
          '0.1',
          '-c:a',
          'pcm_s16le',
          '-y',
          path,
        ],
        runtime.environment,
      );
      expect((await waveforms.get(path)).every((peak) => peak === 0.02)).toBe(true);
    } finally {
      await waveforms.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  },
  60_000,
);
