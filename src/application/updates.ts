import { AppFault, diagnosticFromError } from '../domain/diagnostics';
import type { UpdatePort, UpdateService, UpdateState } from '../domain/updates';
import { newerVersion } from '../domain/updates';

export const UPDATE_INTERVAL_MS = 20 * 60 * 1000;

/** Checking is read-only. Download and apply each require a separate explicit user action. */
export class Updates implements UpdateService {
  private value: UpdateState;
  private pending: Promise<UpdateState> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly port: UpdatePort,
    private readonly emit: (state: UpdateState) => void,
  ) {
    this.value = {
      revision: 0,
      currentVersion: port.currentVersion,
      mode: port.mode,
      phase: port.supported ? 'idle' : 'unsupported',
      release: null,
      progress: null,
      checked: false,
      diagnostic: null,
    };
  }
  state(): UpdateState {
    return structuredClone(this.value);
  }
  private publish(change: Partial<UpdateState>): void {
    this.value = { ...this.value, ...change, revision: this.value.revision + 1 };
    try {
      this.emit(this.state());
    } catch {
      /* Closing the renderer does not invalidate completed work. */
    }
  }
  start(): void {
    if (this.timer || !this.port.supported) return;
    void this.check();
    this.timer = setInterval(() => {
      void this.check();
    }, UPDATE_INTERVAL_MS);
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
  check(): Promise<UpdateState> {
    if (this.pending) return this.pending;
    if (['applying', 'unsupported'].includes(this.value.phase)) return Promise.resolve(this.state());
    const previous = this.value;
    return this.perform(
      previous.phase === 'downloaded' ? 'downloaded' : 'checking',
      previous.phase === 'downloaded' ? 'downloaded' : previous.release ? 'available' : 'idle',
      async () => {
        const release = await this.port.check();
        if (previous.phase === 'downloaded') {
          this.publish({ checked: true });
          return 'downloaded';
        }
        this.publish({
          release: release && newerVersion(release.version, this.port.currentVersion) ? release : null,
          checked: true,
        });
        return this.value.release ? 'available' : 'idle';
      },
    );
  }
  download(version: string): Promise<UpdateState> {
    this.expect(version, 'available');
    return this.perform('downloading', 'available', async () => {
      await this.port.download(version, (percent) => {
        if (Number.isFinite(percent)) this.publish({ progress: Math.max(0, Math.min(100, percent)) });
      });
      return 'downloaded';
    });
  }
  apply(version: string): Promise<UpdateState> {
    this.expect(version, 'downloaded');
    return this.perform('applying', 'downloaded', async () => {
      await this.port.apply(version);
      // An installer may be opened repeatedly; opening it does not imply installation succeeded.
      return this.port.mode === 'restart' ? 'applying' : 'downloaded';
    });
  }
  private expect(version: string, phase: UpdateState['phase']): void {
    if (this.pending || this.value.phase !== phase || this.value.release?.version !== version)
      throw new AppFault({ id: 'updateChanged' });
  }
  private perform(
    phase: UpdateState['phase'],
    fallback: UpdateState['phase'],
    action: () => Promise<UpdateState['phase']>,
  ): Promise<UpdateState> {
    this.publish({ phase, diagnostic: null, progress: null });
    const work = Promise.resolve()
      .then(action)
      .then(
        (next) => {
          this.publish({ phase: next, progress: null });
        },
        (error: unknown) => {
          const diagnostic = diagnosticFromError(error);
          const lostDownload =
            phase === 'applying' && diagnostic.kind === 'app' && diagnostic.message.id === 'updateInvalid';
          this.publish({ phase: lostDownload ? 'available' : fallback, progress: null, diagnostic });
        },
      )
      .then(() => this.state())
      .finally(() => {
        if (this.pending === work) this.pending = null;
      });
    this.pending = work;
    return work;
  }
}
