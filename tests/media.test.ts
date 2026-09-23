import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createClipProject,
  createComposition,
  seedProject,
  validateClipRange,
} from '../src/infrastructure/media/compositions';
import { parseMediaProbe, requiredDoctorChecks } from '../src/infrastructure/media/diagnostics';
import { parseRenderProgress } from '../src/infrastructure/media/render';
import { parseStudioReady } from '../src/infrastructure/media/studio-process';
import { ensureProjectIgnore } from '../src/infrastructure/media/project-ignore';
import { LocalGit } from '../src/infrastructure/git/local-git';

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
async function directory(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'vandashi-media-'));
  directories.push(path);
  return path;
}

describe('Hyperframes boundary', () => {
  it('reconstructs loopback URLs and rejects a different opened workspace', () => {
    const ready = {
      schemaVersion: 1,
      operation: 'start',
      ok: true,
      result: {
        projectName: 'my video',
        projectDir: '/tmp/project',
        host: '127.0.0.1',
        port: 31420,
        ready: true,
        studioUrl: 'https://evil.example/',
      },
    };
    expect(parseStudioReady(JSON.stringify(ready), '/tmp/project')?.info.url).toBe(
      'http://127.0.0.1:31420/#project/my%20video',
    );
    expect(() => parseStudioReady(JSON.stringify(ready), '/tmp/another-project')).toThrow(
      'different project',
    );
    expect(
      parseStudioReady(
        JSON.stringify({ ...ready, result: { ...ready.result, host: '0.0.0.0' } }),
        '/tmp/project',
      ),
    ).toBeNull();
    expect(parseStudioReady('warning: starting', '/tmp/project')).toBeNull();
  });

  it('does not treat optional transcription or Docker failures as render blockers', () => {
    const checks = requiredDoctorChecks(
      JSON.stringify({
        ok: false,
        checks: [
          ...['Node.js', 'FFmpeg', 'FFprobe', 'Chrome'].map((name) => ({
            name,
            ok: true,
            detail: 'Available',
          })),
          { name: 'Docker', ok: false, detail: 'Not installed' },
          { name: 'whisper-cpp', ok: false, detail: 'Not installed' },
        ],
      }),
    );
    expect(checks).toHaveLength(4);
    expect(checks.every((check) => check.status === 'ready')).toBe(true);
    expect(requiredDoctorChecks('{"checks":[]}').every((check) => check.status === 'missing')).toBe(true);
  });

  it('reads CRLF render events and validates malformed progress', () => {
    expect(parseRenderProgress('event: progress\r\ndata: {"progress":100,"status":"complete"}\r\n')).toEqual({
      progress: 100,
      status: 'complete',
    });
    expect(parseRenderProgress(': keepalive')).toBeNull();
    expect(() => parseRenderProgress('data: {"progress":120,"status":"complete"}')).toThrow();
  });

  it('extracts video dimensions and sound without accepting invalid durations', () => {
    expect(
      parseMediaProbe(
        '{"streams":[{"codec_type":"video","width":1920,"height":1080},{"codec_type":"audio"}],"format":{"duration":"4.25","format_name":"mp4"}}',
      ),
    ).toEqual({ duration: 4.25, width: 1920, height: 1080, hasAudio: true, format: 'mp4' });
    expect(() => parseMediaProbe('{"format":{"duration":"NaN"}}')).toThrow('invalid duration');
  });
});

describe('editable compositions', () => {
  it('migrates only generated output ignores and keeps authored Studio manifests visible to Git', async () => {
    const path = await directory();
    const git = new LocalGit();
    await writeFile(join(path, '.gitignore'), '# Existing user rule\nprivate/');
    await ensureProjectIgnore(path);
    const initial = await readFile(join(path, '.gitignore'), 'utf8');
    await ensureProjectIgnore(path);
    expect(await readFile(join(path, '.gitignore'), 'utf8')).toBe(initial);
    expect(initial).toContain('# Existing user rule\nprivate/\n');
    await git.init(path);
    await mkdir(join(path, 'renders'));
    await writeFile(join(path, 'renders', 'output.mp4'), 'Rendered video');
    await mkdir(join(path, '.thumbnails'));
    await writeFile(join(path, '.thumbnails', 'frame.jpg'), 'Generated thumbnail');
    await mkdir(join(path, '.hyperframes'));
    await writeFile(join(path, '.hyperframes', 'studio-manual-edits.json'), '{}');
    const status = await git.status(path);
    expect(status.paths.some((value) => value.includes('renders') || value.includes('.thumbnails'))).toBe(
      false,
    );
    expect(status.paths.some((value) => value.includes('.hyperframes'))).toBe(true);
  });
  it('seeds the canonical video asset folder without overwriting author changes', async () => {
    const path = await directory();
    await seedProject(path, '9:16', '<My video>');
    const initial = await readFile(join(path, 'index.html'), 'utf8');
    expect(initial).toContain('data-width="1080" data-height="1920"');
    expect(initial).toContain('&lt;My video&gt;');
    expect(initial).toContain('data-hf-id="hf-vandashi-title"');
    expect(await readFile(join(path, 'hyperframes.json'), 'utf8')).toContain('"assets": "video_assets"');
    await writeFile(join(path, 'index.html'), 'author edit');
    await seedProject(path, '16:9', 'Second title');
    expect(await readFile(join(path, 'index.html'), 'utf8')).toBe('author edit');
  });

  it('rejects inverted, non-finite, negative, and out-of-range clip ranges', () => {
    for (const [start, end] of [
      [5, 3],
      [-1, 2],
      [0, 11],
      [0, NaN],
      [Infinity, 2],
      [2, 2],
    ]) {
      expect(() => {
        validateClipRange(start ?? NaN, end ?? NaN, 10);
      }).toThrow();
    }
    expect(() => {
      validateClipRange(1, 10, 10);
    }).not.toThrow();
    expect(
      createComposition('1:1', 'Clip', { path: 'video_assets/original.mp4', start: 2, duration: 3 }),
    ).toContain('data-media-start="2"');
  });

  it('creates an independently editable trimmed clip and refuses to overwrite it', async () => {
    const path = await directory();
    const source = join(path, 'source.mp4');
    const clip = join(path, 'clip');
    await writeFile(source, 'fixture-media');
    const probe = () =>
      Promise.resolve({ duration: 10, width: 1920, height: 1080, hasAudio: true, format: 'mp4' });
    const input = {
      projectPath: clip,
      sourceVideoPath: source,
      ratio: '9:16' as const,
      start: 2,
      end: 5,
      title: 'Excerpt',
    };
    await createClipProject(input, probe);
    const html = await readFile(join(clip, 'index.html'), 'utf8');
    expect(html).toContain('data-duration="3"');
    expect(html).toContain('data-media-start="2"');
    expect(await readFile(join(clip, 'video_assets', 'original.mp4'), 'utf8')).toBe('fixture-media');
    await expect(createClipProject(input, probe)).rejects.toThrow('already exists');
  });
});
