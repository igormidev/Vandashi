import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { z } from 'zod';
import { HyperframesMediaAdapter } from '../src/infrastructure/media/hyperframes';
import { runProcess } from '../src/infrastructure/media/runtime';

// Deliberately opt in: this launches real Chrome/FFmpeg and exercises the shipped vendor bundle.
it.skipIf(process.env['VANDASHI_MEDIA_SMOKE'] !== '1')(
  'opens real Studio, persists an edit, renders a video and closes its server',
  async () => {
    const project = await mkdtemp(join(tmpdir(), 'vandashi-studio-smoke-'));
    const adapter = new HyperframesMediaAdapter();
    let studioUrl = '';
    try {
      await adapter.seedProject(project, '16:9', 'Before edit');
      const path = join(project, 'index.html');
      const missingIds = (await readFile(path, 'utf8'))
        .replaceAll('data-duration="10"', 'data-duration="0.4"')
        .replace('duration:10', 'duration:0.4')
        .replace('<!DOCTYPE html>', '<!doctype html>')
        .replaceAll('Before edit', '<span>Before edit</span>');
      await writeFile(path, missingIds);
      await adapter.normalizeProject(project);
      const html = await readFile(path, 'utf8');
      expect(html).toMatch(/<span data-hf-id="[^"]+">Before edit<\/span>/);
      await adapter.normalizeProject(project);
      expect(await readFile(path, 'utf8')).toBe(html);
      const studio = await adapter.startStudio(project);
      studioUrl = studio.url;
      expect((await fetch(studio.url)).status).toBe(200);
      expect((await fetch(studio.previewUrl)).status).toBe(200);
      expect(await readFile(path, 'utf8')).toBe(html); // Viewing should not create a spurious Git change.
      const fileUrl = studio.previewUrl.replace(/\/preview$/, '/files/index.html');
      const current = z
        .object({ content: z.string(), version: z.string() })
        .parse((await (await fetch(fileUrl)).json()) as unknown);
      const content = current.content.replaceAll('Before edit', 'After edit');
      const save = await fetch(fileUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/html', 'If-Match': current.version },
        body: content,
      });
      expect(save.status).toBe(200);
      expect(await readFile(path, 'utf8')).toContain('After edit');
      const progress: number[] = [];
      const output = await adapter.renderVideo(project, (value) => {
        progress.push(value);
      });
      expect(progress.at(-1)).toBe(100);
      const metadata = await adapter.probeMedia(output);
      expect(metadata.width).toBe(1920);
      expect(metadata.height).toBe(1080);
      expect(metadata.duration).toBeGreaterThanOrEqual(0.39);
      expect(metadata.duration).toBeLessThan(0.5);
    } finally {
      await adapter.dispose();
      await rm(project, { recursive: true, force: true });
    }
    if (studioUrl) await expect(fetch(studioUrl, { signal: AbortSignal.timeout(1_000) })).rejects.toThrow();
  },
  120_000,
);

it.skipIf(process.env['VANDASHI_MEDIA_SMOKE'] !== '1')(
  'renders an independent portrait clip with trimmed video and audio',
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'vandashi-clip-smoke-'));
    const adapter = new HyperframesMediaAdapter();
    try {
      const source = join(root, 'source.mp4');
      await runProcess(
        'ffmpeg',
        [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'testsrc2=size=320x180:rate=30:duration=2',
          '-f',
          'lavfi',
          '-i',
          'sine=frequency=880:sample_rate=48000:duration=2',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-shortest',
          source,
        ],
        process.env,
      );
      const projectPath = join(root, 'portrait');
      await adapter.createClip({
        projectPath,
        sourceVideoPath: source,
        ratio: '9:16',
        start: 0.5,
        end: 1,
        title: 'Clip smoke',
      });
      const output = await adapter.renderVideo(projectPath);
      const metadata = await adapter.probeMedia(output);
      expect(metadata.width).toBe(1080);
      expect(metadata.height).toBe(1920);
      expect(metadata.duration).toBeGreaterThanOrEqual(0.49);
      expect(metadata.duration).toBeLessThan(0.6);
      expect(metadata.hasAudio).toBe(true);
    } finally {
      await adapter.dispose();
      await rm(root, { recursive: true, force: true });
    }
  },
  120_000,
);
