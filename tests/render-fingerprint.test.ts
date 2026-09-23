import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { LocalGit } from '../src/infrastructure/git/local-git';

let directory: string;
const git = new LocalGit();
const html = `<script src="vendor/gsap.min.js"></script><h1>Hello</h1><script>
const timeline = gsap.timeline({ paused: true });
timeline.fromTo('h1', { opacity: 0 }, { opacity: 1, duration: 2 }, 0);
window.__timelines = window.__timelines || {};
window.__timelines.main = timeline;
</script>`;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vandashi-fingerprint-'));
  await mkdir(join(directory, 'vendor'));
  await mkdir(join(directory, 'thumbnails'));
  await writeFile(join(directory, 'index.html'), html);
  await writeFile(
    join(directory, 'vendor/gsap.min.js'),
    await readFile('node_modules/gsap/dist/gsap.min.js'),
  );
  await git.init(directory);
  await git.commit(directory, 'Initial scene', 'Create a literal GSAP composition.');
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

it('keeps release artwork independent from a literal GSAP scene but tracks composition changes', async () => {
  const revision = await git.contentRevision(directory);
  await writeFile(join(directory, 'thumbnails/main.png'), 'first image');
  await writeFile(join(directory, 'video_packaging.yml'), 'thumbnails: [thumbnails/main.png]');
  await git.commit(directory, 'Add thumbnail', 'Add release artwork without changing video content.');
  expect(await git.contentRevision(directory)).toBe(revision);
  await writeFile(join(directory, 'thumbnails/main.png'), 'second image');
  await git.commit(directory, 'Revise thumbnail', 'Try another release candidate.');
  expect(await git.contentRevision(directory)).toBe(revision);
  await writeFile(join(directory, 'index.html'), html.replace('Hello', 'Goodbye'));
  await git.commit(directory, 'Revise composition', 'Change the displayed title.');
  expect(await git.contentRevision(directory)).not.toBe(revision);
});

it.each([
  '<img src="thumbnails/main.png">',
  '<img src="thumbnails%2Fmain.png">',
  '<script>const folder = ["thumb", "nails"].join(""); document.querySelector("img").src = folder + "/main.png";</script>',
  '<script>const parts = [116,104,117,109,98]; window.renderAsset(parts);</script>',
  '<script src="https://example.invalid/scene.js"></script>',
  '<img src="&#116;humbnails/main.png">',
  '<iframe src="scene.html"></iframe>',
])('retains thumbnail dependencies for explicit references or uncertain runtime code: %s', async (source) => {
  await writeFile(join(directory, 'index.html'), source);
  await writeFile(join(directory, 'thumbnails/main.png'), 'first image');
  await git.commit(directory, 'Reference artwork', 'Use or dynamically resolve release media.');
  const revision = await git.contentRevision(directory);
  await writeFile(join(directory, 'thumbnails/main.png'), 'second image');
  await git.commit(directory, 'Replace artwork', 'Change the media bytes.');
  expect(await git.contentRevision(directory)).not.toBe(revision);
});

it('treats modified animation libraries conservatively', async () => {
  await writeFile(join(directory, 'thumbnails/main.png'), 'first image');
  await writeFile(join(directory, 'vendor/gsap.min.js'), 'window.loadDynamicMedia();');
  await git.commit(directory, 'Replace vendor script', 'Unknown code may resolve media dynamically.');
  const revision = await git.contentRevision(directory);
  await writeFile(join(directory, 'thumbnails/main.png'), 'second image');
  await git.commit(directory, 'Replace artwork', 'Update the potential render dependency.');
  expect(await git.contentRevision(directory)).not.toBe(revision);
});
