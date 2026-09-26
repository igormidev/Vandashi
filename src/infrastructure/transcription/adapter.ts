import { lstat, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { AppFault } from '../../domain/diagnostics';
import { parseAssetAnalysis, transcriptionModels } from '../../domain/transcription';
import type {
  AssetAnalysis,
  AudioCategory,
  TranscriptionModel,
  TranscriptionPort,
  TranscriptionProgressListener,
} from '../../domain/transcription';
import { resolveMediaBinary } from '../media/binaries';
import { digest } from './download';
import { withRuntimeLock } from './lock';
import { runTranscriptionProcess } from './process';
import { ensureRuntime, privateEnvironment } from './setup';

export interface ManagedTranscriptionOptions {
  cacheDirectory: string;
  workerPath?: string;
  ffmpegPath?: string;
  ffprobePath?: string;
  /** A private Python executable override for controlled integrations. */
  processExecutable?: string;
  guidePath?: string;
  /** AI sandbox calls may consume existing models but cannot install or repair the host cache. */
  readOnly?: boolean;
}

const eventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }),
  z.object({ type: z.literal('result'), value: z.unknown() }),
  z.object({
    type: z.literal('progress'),
    phase: z.enum(['model-download', 'classifying', 'transcribing', 'aligning']),
    fraction: z.number().min(0).max(1).optional(),
  }),
]);
const probeSchema = z.object({ streams: z.array(z.object({ codec_type: z.string() })) });

export class ManagedTranscriptionAdapter implements TranscriptionPort {
  readonly guidePath?: string;
  private readonly worker: string;
  private readonly active = new Set<{ controller: AbortController; done: Promise<void> }>();
  private readonly prepared = new Set<TranscriptionModel>();
  private disposed = false;

  constructor(private readonly options: ManagedTranscriptionOptions) {
    this.worker = options.workerPath ?? fileURLToPath(new URL('./resources/worker.py', import.meta.url));
    if (options.guidePath) this.guidePath = options.guidePath;
  }

  async prepare(
    model: TranscriptionModel,
    progress: TranscriptionProgressListener,
    signal?: AbortSignal,
  ): Promise<void> {
    return this.owned(signal, async (owned) => {
      progress({ phase: 'checking' });
      await this.withCache(owned, async () => {
        if (this.prepared.has(model)) return;
        if (!transcriptionModels.includes(model)) throw new AppFault({ id: 'appTranscriptionSetupFailed' });
        try {
          const python =
            this.options.processExecutable ??
            (await ensureRuntime(
              this.options.cacheDirectory,
              this.worker,
              progress,
              owned,
              this.options.readOnly,
            ));
          await this.request(python, { op: 'prepare', model }, progress, owned);
          this.prepared.add(model);
        } catch (error) {
          owned.throwIfAborted();
          throw new AppFault(
            { id: 'appTranscriptionSetupFailed' },
            error instanceof Error ? error.message : String(error),
          );
        }
      });
    });
  }

  async analyze(
    input: { path: string; kind: 'audio' | 'video'; model: TranscriptionModel; category?: AudioCategory },
    progress: TranscriptionProgressListener,
    signal?: AbortSignal,
  ): Promise<AssetAnalysis> {
    return this.owned(signal, async (owned) => {
      const report: TranscriptionProgressListener = (value) => {
        progress({ ...value, file: basename(input.path) });
      };
      report({ phase: 'checking' });
      const original = await lstat(input.path);
      if (!original.isFile() || original.isSymbolicLink())
        throw new AppFault({ id: 'appTranscriptionFailed' });
      const sourceHash = await digest(input.path, owned);
      const env = privateEnvironment(this.options.cacheDirectory);
      const probe = probeSchema.parse(
        JSON.parse(
          await runTranscriptionProcess(
            this.options.ffprobePath ?? resolveMediaBinary('ffprobe', env),
            ['-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'json', '--', input.path],
            env,
            owned,
          ),
        ) as unknown,
      );
      let result: AssetAnalysis;
      if (input.kind === 'video' && !probe.streams.some((stream) => stream.codec_type === 'audio')) {
        result = {
          schemaVersion: 1,
          sourceHash,
          category: 'dialog',
          categorySource: 'video',
          transcription: { status: 'not-required', reason: 'no-audio' },
        };
      } else if (input.kind === 'audio' && input.category && input.category !== 'dialog') {
        result = {
          schemaVersion: 1,
          sourceHash,
          category: input.category,
          categorySource: 'user',
          transcription: { status: 'not-required', reason: input.category },
        };
      } else {
        result = await this.withCache(owned, async () => {
          const python =
            this.options.processExecutable ??
            (await ensureRuntime(
              this.options.cacheDirectory,
              this.worker,
              report,
              owned,
              this.options.readOnly,
            ));
          const directory = await mkdtemp(join(tmpdir(), 'vandashi-transcription-'));
          try {
            const pcmPath = join(directory, 'audio.pcm');
            await runTranscriptionProcess(
              this.options.ffmpegPath ?? resolveMediaBinary('ffmpeg', env),
              [
                '-nostdin',
                '-v',
                'error',
                '-i',
                input.path,
                '-map',
                '0:a:0',
                '-vn',
                '-ac',
                '1',
                '-ar',
                '16000',
                '-f',
                'f32le',
                pcmPath,
              ],
              env,
              owned,
            );
            const value = await this.request(
              python,
              {
                op: 'analyze',
                model: input.model,
                pcmPath,
                kind: input.kind,
                ...(input.category ? { category: input.category } : {}),
                sourceHash,
              },
              report,
              owned,
            );
            const parsed = parseAssetAnalysis(value);
            if (!parsed || parsed.sourceHash !== sourceHash)
              throw new AppFault({ id: 'appTranscriptionFailed' });
            return parsed;
          } finally {
            await rm(directory, { recursive: true, force: true });
          }
        });
      }
      const current = await lstat(input.path);
      if (
        !current.isFile() ||
        current.isSymbolicLink() ||
        original.dev !== current.dev ||
        original.ino !== current.ino ||
        original.size !== current.size ||
        original.mtimeMs !== current.mtimeMs ||
        original.ctimeMs !== current.ctimeMs ||
        (await digest(input.path, owned)) !== sourceHash
      ) {
        throw new AppFault({ id: 'appTranscriptionChanged' });
      }
      return result;
    });
  }

  private async request(
    python: string,
    payload: Record<string, unknown>,
    progress: TranscriptionProgressListener,
    signal: AbortSignal,
  ): Promise<unknown> {
    const temporary = await mkdtemp(join(tmpdir(), 'vandashi-transcription-request-'));
    try {
      const request = join(temporary, 'request.json');
      await writeFile(
        request,
        JSON.stringify({
          ...payload,
          cache: join(this.options.cacheDirectory, 'models'),
          readOnly: this.options.readOnly ?? false,
        }),
        { mode: 0o600 },
      );
      const state = { finished: false };
      let result: unknown;
      await runTranscriptionProcess(
        python,
        ['-s', '-E', this.worker, request],
        privateEnvironment(this.options.cacheDirectory),
        signal,
        (line) => {
          const event = eventSchema.parse(JSON.parse(line) as unknown);
          if (event.type === 'progress')
            progress({
              phase: event.phase,
              ...(event.fraction === undefined ? {} : { fraction: event.fraction }),
            });
          else {
            if (state.finished || event.type !== (payload['op'] === 'prepare' ? 'ready' : 'result'))
              throw new AppFault({ id: 'appTranscriptionFailed' });
            state.finished = true;
            if (event.type === 'result') result = event.value;
          }
        },
      );
      if (!state.finished) throw new AppFault({ id: 'appTranscriptionFailed' });
      return result;
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  }

  private async owned<T>(
    signal: AbortSignal | undefined,
    work: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (this.disposed) throw new AppFault({ id: 'appTranscriptionCancelled' });
    const controller = new AbortController();
    const combined = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(21_600_000),
      ...(signal ? [signal] : []),
    ]);
    let finish = (): void => undefined;
    const operation = {
      controller,
      done: new Promise<void>((resolve) => {
        finish = resolve;
      }),
    };
    this.active.add(operation);
    try {
      return await work(combined);
    } catch (error) {
      if (combined.aborted) throw new AppFault({ id: 'appTranscriptionCancelled' });
      if (error instanceof AppFault) throw error;
      throw new AppFault(
        { id: 'appTranscriptionFailed' },
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this.active.delete(operation);
      finish();
    }
  }

  private async withCache<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
    return this.options.readOnly ? work() : withRuntimeLock(this.options.cacheDirectory, signal, work);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const active = [...this.active];
    for (const operation of active) operation.controller.abort();
    await Promise.all(active.map((operation) => operation.done));
  }
}
