import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { parseMediaProbe, probeMedia } from '../src/infrastructure/media/diagnostics';
import { resolveMediaBinary } from '../src/infrastructure/media/binaries';
import { resolveMediaRuntime, runProcess } from '../src/infrastructure/media/runtime';

function probe(stream: Record<string, unknown>) {
  return parseMediaProbe(
    JSON.stringify({
      streams: [{ codec_type: 'video', width: 1920, height: 1080, ...stream }],
      format: { duration: '1', format_name: 'mov' },
    }),
  );
}

it.each([-270, -90, 90, 270, 450])('uses displayed portrait dimensions for rotation %s', (rotation) => {
  expect(probe({ side_data_list: [{ rotation }] })).toMatchObject({ width: 1080, height: 1920 });
});

it('uses display-matrix rotation ahead of the legacy rotate tag, including zero', () => {
  expect(probe({ tags: { rotate: '90' }, side_data_list: [{ rotation: 0 }] })).toMatchObject({
    width: 1920,
    height: 1080,
  });
  expect(probe({ tags: { rotate: '-90' } })).toMatchObject({ width: 1080, height: 1920 });
  expect(probe({ tags: { rotate: '180' } })).toMatchObject({ width: 1920, height: 1080 });
});

it('applies non-square pixels before rotation when classifying anamorphic footage', () => {
  const stream = { width: 720, height: 576, sample_aspect_ratio: '64:45' };
  expect(probe(stream)).toMatchObject({ width: 1024, height: 576 });
  expect(probe({ ...stream, side_data_list: [{ rotation: 90 }] })).toMatchObject({
    width: 576,
    height: 1024,
  });
});

it.each(['N/A', '0:1', '1:0', '-1:1'])('treats unspecified or invalid SAR %s as square pixels', (sar) => {
  expect(probe({ sample_aspect_ratio: sar })).toMatchObject({ width: 1920, height: 1080 });
});

it('keeps audio-only dimensions absent and rejects unusable rotation metadata', () => {
  expect(probe({ codec_type: 'audio' })).toMatchObject({ width: null, height: null, hasAudio: true });
  expect(() => probe({ tags: { rotate: 'not an angle' } })).toThrow('invalid display dimensions');
});

it.skipIf(process.env['VANDASHI_MEDIA_SMOKE'] !== '1')(
  'probes a real rotated anamorphic MOV through the production FFprobe command',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vandashi-display-probe-'));
    const runtime = resolveMediaRuntime();
    const original = join(directory, 'anamorphic.mp4');
    const rotated = join(directory, 'phone portrait.mov');
    const ffmpeg = resolveMediaBinary('ffmpeg', runtime.environment);
    try {
      await runProcess(
        ffmpeg,
        [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'color=blue:size=720x576:rate=1:duration=0.1',
          '-vf',
          'setsar=64/45',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          original,
        ],
        runtime.environment,
      );
      await runProcess(
        ffmpeg,
        ['-v', 'error', '-display_rotation', '90', '-i', original, '-c', 'copy', rotated],
        runtime.environment,
      );
      expect(await probeMedia(runtime, original)).toMatchObject({ width: 1024, height: 576 });
      expect(await probeMedia(runtime, rotated)).toMatchObject({ width: 576, height: 1024 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
  30_000,
);
