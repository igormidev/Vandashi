import { join } from 'node:path';
import { stat, writeFile } from 'node:fs/promises';
import { AppFault } from '../../domain/diagnostics';
import type { InspectedFrame } from '../../domain/asset-inspection';
import type { MediaProbe } from '../../domain/media';
import { resolveMediaBinary } from './binaries';
import { inspectionProcess } from './inspection-process';
import { audibleSamples } from './speech-quality';
import type { MediaRuntime } from './runtime';

export interface SpeechSample {
  path: string;
  start: number;
  duration: number;
}
export function speechWindows(duration: number): { start: number; duration: number }[] {
  if (duration <= 30) return [{ start: 0, duration }];
  if (duration <= 90)
    return Array.from({ length: Math.ceil(duration / 30) }, (_, index) => ({
      start: index * 30,
      duration: Math.min(30, duration - index * 30),
    }));
  return [0, (duration - 30) / 2, duration - 30].map((start) => ({ start, duration: 30 }));
}
const ffmpegInput = ['-hide_banner', '-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe'];

export async function sampleFrames(
  runtime: MediaRuntime,
  path: string,
  probe: MediaProbe,
  directory: string,
  signal: AbortSignal,
): Promise<InspectedFrame[]> {
  const count = probe.duration > 0 ? 6 : 1;
  const width = probe.width ?? 960;
  const height = probe.height ?? 960;
  const scale = Math.min(1, 960 / Math.max(width, height));
  const dimensions = `${String(Math.max(1, Math.round(width * scale)))}:${String(Math.max(1, Math.round(height * scale)))}`;
  const frames: InspectedFrame[] = [];
  let failure: unknown;
  for (let index = 0; index < count; index++) {
    const seconds = probe.duration * ((index + 0.5) / count);
    const target = join(directory, `frame-${String(index)}.png`);
    try {
      await inspectionProcess(
        resolveMediaBinary('ffmpeg', runtime.environment),
        [
          ...ffmpegInput,
          '-ss',
          String(seconds),
          '-i',
          path,
          '-map',
          '0:v:0',
          '-frames:v',
          '1',
          '-vf',
          `scale=${dimensions},setsar=1`,
          target,
        ],
        runtime.environment,
        signal,
      );
      // A successful seek beyond the last video frame can exit 0 without writing a PNG.
      const output = await stat(target);
      if (output.isFile() && output.size > 0) frames.push({ path: target, seconds });
    } catch (error) {
      signal.throwIfAborted();
      failure = error;
    }
  }
  if (!frames.length && failure)
    throw failure instanceof Error ? failure : new AppFault({ id: 'mediaInspectionFailed' });
  return frames;
}

export async function sampleSpeech(
  runtime: MediaRuntime,
  path: string,
  duration: number,
  directory: string,
  signal: AbortSignal,
): Promise<SpeechSample[]> {
  const samples: SpeechSample[] = [];
  for (const window of speechWindows(duration)) {
    const bytes = await inspectionProcess(
      resolveMediaBinary('ffmpeg', runtime.environment),
      [
        ...ffmpegInput,
        '-ss',
        String(window.start),
        '-i',
        path,
        '-t',
        String(window.duration),
        '-map',
        '0:a:0',
        '-vn',
        '-ac',
        '1',
        '-ar',
        '16000',
        '-f',
        'f32le',
        'pipe:1',
      ],
      runtime.environment,
      signal,
      60_000,
      30 * 16_000 * 4,
    );
    const usable = bytes.length - (bytes.length % 4);
    const audio = new Float32Array(bytes.buffer, bytes.byteOffset, usable / 4);
    if (!audibleSamples(audio)) continue;
    const target = join(directory, `speech-${String(window.start)}.pcm`);
    await writeFile(target, bytes.subarray(0, usable), { mode: 0o600 });
    samples.push({
      path: target,
      start: window.start,
      duration: Math.min(window.duration, usable / 4 / 16_000),
    });
  }
  return samples;
}
