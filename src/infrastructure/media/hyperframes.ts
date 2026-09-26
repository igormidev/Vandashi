import { AppFault } from '../../domain/diagnostics';
import type { AssetInspectionLease, AssetInspectionProgress } from '../../domain/asset-inspection';
import { AssetInspector } from './asset-inspection';
import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { ClipMediaInput, MediaPort, MediaProbe, RenderProgress } from '../../domain/media';
import type { AspectRatio, DependencyCheck, StudioInfo } from '../../domain/models';
import { createClipProject, seedProject } from './compositions';
import { checkMediaDependencies, probeMedia } from './diagnostics';
import { mediaResponse, observeRender, startRender } from './render';
import {
  resolveMediaRuntime,
  runProcess,
  terminateProcess,
  type MediaAdapterOptions,
  type MediaRuntime,
} from './runtime';
import { startStudioProcess, type StudioProcess } from './studio-process';
import { ensureProjectIgnore } from './project-ignore';
import { AudioWaveforms } from './waveform';

interface ActiveRender {
  projectPath: string;
  controller: AbortController;
  studio: StudioProcess | null;
  jobId: string | null;
}

/** Owns one loopback Studio process. The Electron renderer receives URLs only. */
export class HyperframesMediaAdapter implements MediaPort {
  private readonly runtime: MediaRuntime;
  private readonly waveforms: AudioWaveforms;
  private readonly inspector: AssetInspector;
  private studio: StudioProcess | null = null;
  private transitions: Promise<void> = Promise.resolve();
  private rendering: ActiveRender | null = null;
  private disposed = false;

  constructor(options: MediaAdapterOptions = {}) {
    this.runtime = resolveMediaRuntime(options);
    this.waveforms = new AudioWaveforms(this.runtime);
    this.inspector = new AssetInspector(this.runtime, options);
  }

  async normalizeProject(projectPath: string): Promise<void> {
    try {
      await access(join(projectPath, 'index.html'));
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
      throw error;
    }
    await ensureProjectIgnore(projectPath);
    await runProcess(
      this.runtime.nodePath,
      [this.runtime.cliPath, 'timeline', 'ids', '--dir', resolve(projectPath), '--json'],
      this.runtime.environment,
      30_000,
    );
  }

  async seedProject(projectPath: string, ratio: AspectRatio, title: string): Promise<void> {
    await seedProject(projectPath, ratio, title);
    await this.normalizeProject(projectPath);
  }

  async createClip(input: ClipMediaInput): Promise<void> {
    await createClipProject(input, (path) => this.probeMedia(path));
    await this.normalizeProject(input.projectPath);
  }

  async probeMedia(path: string): Promise<MediaProbe> {
    return probeMedia(this.runtime, path);
  }
  audioWaveform(path: string): Promise<number[]> {
    return this.waveforms.get(path);
  }

  inspectAsset(
    path: string,
    onProgress?: (progress: AssetInspectionProgress) => void,
    signal?: AbortSignal,
    options?: { speech?: boolean },
  ): Promise<AssetInspectionLease> {
    return this.inspector.inspect(path, onProgress, signal, options);
  }

  async checks(onCheck?: (check: DependencyCheck) => void): Promise<DependencyCheck[]> {
    return checkMediaDependencies(this.runtime, onCheck);
  }

  async startStudio(projectPath: string): Promise<StudioInfo> {
    const target = resolve(projectPath);
    return this.transition(async () => {
      if (this.disposed) throw new AppFault({ id: 'mediaStudioClosed' });
      if (this.rendering !== null && this.rendering.projectPath !== target)
        throw new AppFault({ id: 'mediaRenderBeforeProject' });
      if (
        this.studio?.info.projectPath === target &&
        this.studio.child.exitCode === null &&
        this.studio.child.signalCode === null
      )
        return this.studio.info;
      await this.closeStudio();
      await access(join(target, 'index.html'));
      this.studio = await startStudioProcess(this.runtime, target);
      return this.studio.info;
    });
  }

  async stopStudio(): Promise<void> {
    if (this.rendering !== null) throw new AppFault({ id: 'mediaRenderBeforeClose' });
    await this.transition(() => this.closeStudio());
  }

  async renderVideo(projectPath: string, onProgress?: RenderProgress): Promise<string> {
    if (this.rendering !== null) throw new AppFault({ id: 'mediaRenderActive' });
    const active: ActiveRender = {
      projectPath: resolve(projectPath),
      controller: new AbortController(),
      studio: null,
      jobId: null,
    };
    this.rendering = active;
    try {
      onProgress?.(0, 'Preparing video renderer', { id: 'mediaRendererPreparing' });
      await this.startStudio(projectPath);
      active.controller.signal.throwIfAborted();
      const studio = this.studio;
      if (studio === null) throw new AppFault({ id: 'mediaStudioStartFailed' });
      active.studio = studio;
      active.jobId = await startRender(studio);
      if (active.controller.signal.aborted) await this.cancelJob(active);
      active.controller.signal.throwIfAborted();
      const signal = AbortSignal.any([active.controller.signal, AbortSignal.timeout(4 * 60 * 60 * 1_000)]);
      return await observeRender(studio, active.jobId, signal, onProgress);
    } catch (error) {
      await this.cancelJob(active).catch(() => undefined);
      throw error;
    } finally {
      if (this.rendering === active) this.rendering = null;
    }
  }

  async cancelRender(): Promise<void> {
    const active = this.rendering;
    if (active === null) return;
    active.controller.abort(new AppFault({ id: 'mediaRenderCancelled' }));
    await this.cancelJob(active);
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    await this.waveforms.dispose();
    await this.inspector.dispose();
    await this.cancelRender().catch(() => undefined);
    await this.transition(() => this.closeStudio());
  }

  private async cancelJob(active: ActiveRender): Promise<void> {
    if (active.studio === null || active.jobId === null) return;
    await mediaResponse(`${active.studio.baseUrl}/api/render/${encodeURIComponent(active.jobId)}/cancel`, {
      method: 'POST',
    });
  }

  private async closeStudio(): Promise<void> {
    const studio = this.studio;
    this.studio = null;
    if (studio !== null) await terminateProcess(studio.child);
  }

  private async transition<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.transitions.then(operation);
    this.transitions = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
