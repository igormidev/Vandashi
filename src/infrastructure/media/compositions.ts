import { AppFault } from '../../domain/diagnostics';
import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';
import type { AspectRatio } from '../../domain/models';
import type { ClipMediaInput, MediaProbe } from '../../domain/media';

export const COMPOSITION_DIMENSIONS: Record<AspectRatio, readonly [number, number]> = {
  '16:9': [1920, 1080],
  '9:16': [1080, 1920],
  '1:1': [1080, 1080],
};

export function escapeHtml(text: string): string {
  return text.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character,
  );
}

export function createComposition(
  ratio: AspectRatio,
  title: string,
  source?: { path: string; start: number; duration: number },
): string {
  const [width, height] = COMPOSITION_DIMENSIONS[ratio];
  const duration = source?.duration ?? 10;
  const content = source
    ? `<video data-hf-id="hf-vandashi-source" id="source" class="clip" data-start="0" data-duration="${String(duration)}" data-media-start="${String(source.start)}" data-track-index="0" src="${escapeHtml(source.path)}" playsinline preload="auto" style="width:100%;height:100%;object-fit:cover"></video>`
    : `<h1 data-hf-id="hf-vandashi-title" id="title" class="clip" data-start="0" data-duration="10" data-track-index="0">${escapeHtml(title)}</h1>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=${String(width)},height=${String(height)}"><title>${escapeHtml(title)}</title><script src="compositions/vendor/gsap.min.js"></script>
<style>*{box-sizing:border-box}html,body{margin:0;width:${String(width)}px;height:${String(height)}px;overflow:hidden;background:#0a0a0a}#stage{width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;color:#fafafa}#title{font-size:72px;line-height:1.1;letter-spacing:-.03em;text-align:center;max-width:80%}</style></head><body>
<div data-hf-id="hf-vandashi-stage" id="stage" data-composition-id="main" data-start="0" data-duration="${String(duration)}" data-width="${String(width)}" data-height="${String(height)}">${content}</div>
<script>window.__timelines=window.__timelines||{};window.__timelines.main=gsap.timeline({paused:true}).to({},{duration:${String(duration)}});</script>
</body></html>\n`;
}

async function writeNew(path: string, content: string): Promise<void> {
  try {
    await writeFile(path, content, { flag: 'wx' });
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
  }
}

export async function seedProject(projectPath: string, ratio: AspectRatio, title: string): Promise<void> {
  await mkdir(join(projectPath, 'video_assets'), { recursive: true });
  await mkdir(join(projectPath, 'compositions', 'vendor'), { recursive: true });
  const require = createRequire(import.meta.url);
  const gsap = await readFile(require.resolve('gsap/dist/gsap.min.js'), 'utf8');
  await writeNew(join(projectPath, 'compositions', 'vendor', 'gsap.min.js'), gsap);
  await writeNew(join(projectPath, 'index.html'), createComposition(ratio, title));
  await writeNew(
    join(projectPath, 'hyperframes.json'),
    `${JSON.stringify(
      {
        $schema: 'https://hyperframes.heygen.com/schema/hyperframes.json',
        registry: 'https://raw.githubusercontent.com/heygen-com/hyperframes/main/registry',
        paths: { blocks: 'compositions', components: 'compositions/components', assets: 'video_assets' },
        media: { autoProxy: true },
      },
      null,
      2,
    )}\n`,
  );
}

export function validateClipRange(start: number, end: number, sourceDuration: number): void {
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    !Number.isFinite(sourceDuration) ||
    start < 0 ||
    end <= start ||
    end > sourceDuration + 0.05
  ) {
    throw new AppFault({ id: 'mediaClipRangeInvalid' });
  }
}

export async function createClipProject(
  input: ClipMediaInput,
  probe: (path: string) => Promise<MediaProbe>,
): Promise<void> {
  const metadata = await probe(input.sourceVideoPath);
  if (metadata.width === null || metadata.height === null)
    throw new AppFault({ id: 'mediaClipSourceInvalid' });
  validateClipRange(input.start, input.end, metadata.duration);
  const path = join(input.projectPath, 'index.html');
  // A clip creation must never overwrite an existing composition or its media.
  try {
    await stat(path);
    throw new AppFault({ id: 'mediaClipExists' });
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error;
  }
  await mkdir(join(input.projectPath, 'video_assets'), { recursive: true });
  const sourceName = `original${extname(input.sourceVideoPath).toLowerCase() || '.mp4'}`;
  await copyFile(
    input.sourceVideoPath,
    join(input.projectPath, 'video_assets', sourceName),
    constants.COPYFILE_EXCL,
  );
  await seedProject(input.projectPath, input.ratio, input.title);
  // Only replace the seed we have just created, and leave a concurrent author edit intact.
  const expected = createComposition(input.ratio, input.title);
  if ((await readFile(path, 'utf8')) !== expected) throw new AppFault({ id: 'mediaClipChanged' });
  await writeFile(
    path,
    createComposition(input.ratio, input.title, {
      path: `video_assets/${sourceName}`,
      start: input.start,
      duration: input.end - input.start,
    }),
  );
}
