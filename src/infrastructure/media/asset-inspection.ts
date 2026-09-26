import { AppFault, DiagnosticError, envelopeDiagnostic } from '../../domain/diagnostics';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { AssetInspectionLease, AssetInspectionProgress } from '../../domain/asset-inspection';
import { probeMedia } from './diagnostics';
import { sampleFrames, sampleSpeech } from './inspection-samples';
import { inspectionProcess } from './inspection-process';
import { ensureSpeechModel } from './model-cache';
import type { MediaAdapterOptions, MediaRuntime } from './runtime';

const transcriptSchema = z
  .array(
    z.object({
      start: z.number().nonnegative(),
      end: z.number().nonnegative(),
      text: z.string().max(8000),
      language: z.string().max(16),
    }),
  )
  .max(512);
const audioExtensions = new Set([
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.aac',
  '.flac',
  '.opus',
  '.aiff',
  '.aif',
  '.wma',
]);
const imageExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.avif',
  '.bmp',
  '.tif',
  '.tiff',
  '.svg',
]);

async function sourceHash(path: string, signal: AbortSignal): Promise<string> {
  const hash = createHash('sha256');
  for await (const data of createReadStream(path, { signal })) hash.update(data as Buffer);
  signal.throwIfAborted();
  return hash.digest('hex');
}

export class AssetInspector {
  private readonly active = new Set<{ controller: AbortController; done: Promise<void> }>();
  private readonly leases = new Set<() => Promise<void>>();
  private disposed = false;
  constructor(
    private readonly runtime: MediaRuntime,
    private readonly options: MediaAdapterOptions,
  ) {}

  async inspect(
    path: string,
    progress: (value: AssetInspectionProgress) => void = () => undefined,
    signal?: AbortSignal,
    options?: { speech?: boolean },
  ): Promise<AssetInspectionLease> {
    if (this.disposed) throw new AppFault({ id: 'mediaInspectionClosed' });
    const controller = new AbortController();
    const combined = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(360_000),
      ...(signal ? [signal] : []),
    ]);
    let finish = (): void => undefined;
    const active = {
      controller,
      done: new Promise<void>((resolve) => {
        finish = resolve;
      }),
    };
    this.active.add(active);
    let directory: string | null = null;
    try {
      combined.throwIfAborted();
      const original = await stat(path);
      if (!original.isFile()) throw new AppFault({ id: 'mediaChooseFile' });
      const inspectedHash = await sourceHash(path, combined);
      directory = await mkdtemp(join(tmpdir(), 'vandashi-inspection-'));
      const temporary = directory;
      const dispose = async (): Promise<void> => {
        await rm(temporary, { recursive: true, force: true });
        this.leases.delete(dispose);
      };
      const probe = await probeMedia(this.runtime, path, combined);
      const image = imageExtensions.has(extname(path).toLowerCase());
      const audio = audioExtensions.has(extname(path).toLowerCase());
      const kind = audio
        ? 'audio'
        : image
          ? 'image'
          : probe.width && probe.height
            ? 'video'
            : probe.hasAudio
              ? 'audio'
              : 'other';
      const lease: AssetInspectionLease = {
        sourceHash: inspectedHash,
        kind,
        images: [],
        transcript: [],
        note: { frames: 0, sampledSeconds: 0, duration: probe.duration, speech: 'none' },
        dispose,
      };
      if (kind !== 'audio' && probe.width && probe.height) {
        progress({ phase: 'frames', progress: 0 });
        lease.images = await sampleFrames(this.runtime, path, probe, temporary, combined);
        lease.note.frames = lease.images.length;
        progress({ phase: 'frames', progress: 1 });
      }
      if (options?.speech !== false && probe.hasAudio && probe.duration > 0) {
        progress({ phase: 'speech', progress: 0 });
        try {
          const samples = await sampleSpeech(this.runtime, path, probe.duration, temporary, combined);
          lease.note.sampledSeconds = Math.min(probe.duration, 90);
          if (samples.length) {
            if (!this.options.cacheDirectory) throw new AppFault({ id: 'mediaSpeechCacheMissing' });
            const modelPath = await ensureSpeechModel(this.options.cacheDirectory, combined, (fraction) => {
              progress({ phase: 'model-download', progress: fraction });
            });
            progress({ phase: 'speech', progress: 0.1 });
            const request = join(temporary, 'request.json');
            await writeFile(request, JSON.stringify({ modelPath, samples }), { mode: 0o600 });
            const output = await inspectionProcess(
              this.runtime.nodePath,
              [
                this.options.speechWorkerPath ??
                  fileURLToPath(new URL('./speech-worker.js', import.meta.url)),
                request,
              ],
              this.runtime.environment,
              combined,
              120_000,
            );
            const parsed: unknown = JSON.parse(output.toString());
            const failure = envelopeDiagnostic(parsed);
            if (failure) throw new DiagnosticError(failure);
            lease.transcript = transcriptSchema.parse(parsed);
            lease.note.speech = lease.transcript.length ? 'recognized' : 'none';
          }
          progress({ phase: 'speech', progress: 1 });
        } catch (error) {
          combined.throwIfAborted();
          lease.note.speech = 'unavailable';
          // Video frames remain useful when speech dependencies/downloads fail.
          if (!lease.images.length) throw error;
        }
      }
      combined.throwIfAborted();
      const finalHash = await sourceHash(path, combined);
      const current = await stat(path);
      if (
        finalHash !== inspectedHash ||
        current.dev !== original.dev ||
        current.ino !== original.ino ||
        current.size !== original.size ||
        current.mtimeMs !== original.mtimeMs ||
        current.ctimeMs !== original.ctimeMs
      )
        throw new AppFault({ id: 'mediaChangedDuringInspection' });
      this.leases.add(dispose);
      return lease;
    } catch (error) {
      if (directory) await rm(directory, { recursive: true, force: true });
      throw error;
    } finally {
      this.active.delete(active);
      finish();
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const active = [...this.active];
    for (const operation of active)
      operation.controller.abort(new AppFault({ id: 'mediaInspectionCancelled' }));
    await Promise.all(active.map((operation) => operation.done));
    await Promise.all([...this.leases].map((dispose) => dispose()));
  }
}
