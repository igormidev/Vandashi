import { spawn, type ChildProcess } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { resolveMediaBinary } from './binaries';
import { probeMedia } from './diagnostics';
import { terminateProcess, type MediaRuntime } from './runtime';

const sampleRate = 8_000;
const bucketCount = 100;

/** Streaming samples keep long recordings out of both renderer memory and host buffers. */
export class AudioWaveforms {
  private readonly cache = new Map<string, { stamp: string; result: Promise<number[]> }>();
  private tail: Promise<void> = Promise.resolve();
  private active: ChildProcess | null = null;
  private disposed = false;
  constructor(private readonly runtime: MediaRuntime) {}

  private assertAvailable(): void {
    if (this.disposed) throw new Error('The media service is closed.');
  }

  async get(path: string): Promise<number[]> {
    this.assertAvailable();
    const info = await stat(path);
    if (!info.isFile()) throw new Error('Choose an audio file.');
    const stamp = `${String(info.size)}:${String(info.mtimeMs)}:${String(info.ctimeMs)}`;
    const cached = this.cache.get(path);
    if (cached?.stamp === stamp) return cached.result;
    const result = this.tail.then(async () => {
      this.assertAvailable();
      const probe = await probeMedia(this.runtime, path);
      this.assertAvailable();
      if (!probe.hasAudio || !Number.isFinite(probe.duration) || probe.duration <= 0)
        throw new Error('This file has no decodable audio.');
      return this.decode(path, probe.duration);
    });
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.cache.set(path, { stamp, result });
    if (this.cache.size > 64) this.cache.delete(this.cache.keys().next().value ?? '');
    void result.catch(() => {
      if (this.cache.get(path)?.result === result) this.cache.delete(path);
    });
    return result;
  }

  private decode(path: string, duration: number): Promise<number[]> {
    const child = spawn(
      resolveMediaBinary('ffmpeg', this.runtime.environment),
      [
        '-hide_banner',
        '-v',
        'error',
        '-nostdin',
        '-protocol_whitelist',
        'file,pipe',
        '-i',
        path,
        '-map',
        '0:a:0',
        '-vn',
        '-ac',
        '1',
        '-ar',
        String(sampleRate),
        '-f',
        'f32le',
        'pipe:1',
      ],
      { env: this.runtime.environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
    );
    this.active = child;
    return new Promise((resolve, reject) => {
      const peaks = Array<number>(bucketCount).fill(0);
      let remainder = Buffer.alloc(0);
      let samples = 0;
      let errorText = '';
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        void terminateProcess(child);
        reject(error);
      };
      const timer = setTimeout(() => {
        fail(new Error('Audio waveform generation timed out.'));
      }, 120_000);
      child.stdout.on('data', (chunk: Buffer) => {
        const bytes = remainder.length ? Buffer.concat([remainder, chunk]) : chunk;
        const end = bytes.length - (bytes.length % 4);
        for (let offset = 0; offset < end; offset += 4) {
          const value = Math.abs(bytes.readFloatLE(offset));
          const bucket = Math.min(
            bucketCount - 1,
            Math.floor((samples * bucketCount) / (duration * sampleRate)),
          );
          if (Number.isFinite(value)) peaks[bucket] = Math.max(peaks[bucket] ?? 0, value);
          samples++;
        }
        remainder = Buffer.from(bytes.subarray(end));
      });
      child.stderr.on('data', (chunk: Buffer) => {
        errorText = (errorText + chunk.toString()).slice(-2_000);
      });
      child.once('error', fail);
      child.once('close', (code) => {
        clearTimeout(timer);
        if (this.active === child) this.active = null;
        if (settled) return;
        settled = true;
        if (code !== 0 || samples === 0) {
          reject(new Error(errorText || 'The audio waveform could not be generated.'));
          return;
        }
        const maximum = Math.max(...peaks, 0.01);
        resolve(peaks.map((peak) => Math.max(0.02, peak / maximum)));
      });
    });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.cache.clear();
    if (this.active) await terminateProcess(this.active);
    await this.tail;
  }
}
