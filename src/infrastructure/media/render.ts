import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { RenderProgress } from '../../domain/media';
import type { StudioProcess } from './studio-process';

const jobSchema = z.object({
  jobId: z
    .string()
    .min(1)
    .refine((id) => !/[\\/]/.test(id) && !Array.from(id).some((character) => character.charCodeAt(0) < 32)),
  status: z.literal('rendering'),
});
const progressSchema = z.object({
  progress: z.number().min(0).max(100),
  status: z.enum(['rendering', 'complete', 'failed', 'cancelled']),
  stage: z.string().optional(),
  error: z.string().optional(),
});

export function parseRenderProgress(event: string): z.infer<typeof progressSchema> | null {
  const data = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n');
  if (!data) return null;
  return progressSchema.parse(JSON.parse(data) as unknown);
}

export async function mediaResponse(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const body = (await response.text()).slice(0, 2_000);
    throw new Error(`Hyperframes request failed (${String(response.status)}): ${body}`);
  }
  return response;
}

export async function startRender(studio: StudioProcess): Promise<string> {
  const response = await mediaResponse(`${studio.baseUrl}/api/projects/${studio.projectId}/render`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format: 'mp4', fps: 30, quality: 'high', telemetryOptOut: true }),
  });
  return jobSchema.parse((await response.json()) as unknown).jobId;
}

export async function observeRender(
  studio: StudioProcess,
  jobId: string,
  signal: AbortSignal,
  onProgress?: RenderProgress,
): Promise<string> {
  const response = await mediaResponse(`${studio.baseUrl}/api/render/${encodeURIComponent(jobId)}/progress`, {
    signal,
  });
  if (!response.body) throw new Error('Hyperframes did not provide render progress.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let complete = false;
  try {
    while (!complete) {
      const next = await reader.read();
      if (next.done) break;
      pending += decoder.decode(next.value, { stream: true });
      if (pending.length > 1_000_000) throw new Error('Hyperframes returned an oversized progress event.');
      const events = pending.split(/\r?\n\r?\n/);
      pending = events.pop() ?? '';
      for (const event of events) {
        const progress = parseRenderProgress(event);
        if (!progress) continue;
        onProgress?.(progress.progress, progress.stage ?? progress.status);
        if (progress.status === 'failed') throw new Error(progress.error ?? 'The video render failed.');
        if (progress.status === 'cancelled') throw new Error('The video render was cancelled.');
        if (progress.status === 'complete') complete = true;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  if (!complete) throw new Error('The renderer disconnected before completing the video.');
  const output = join(studio.info.projectPath, 'renders', `${jobId}.mp4`);
  const file = await stat(output);
  if (!file.isFile() || file.size === 0) throw new Error('The renderer did not produce a video file.');
  return output;
}
