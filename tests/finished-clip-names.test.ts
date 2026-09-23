import { mkdir, readFile, readdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import * as importedWriter from '../src/infrastructure/storage/finished-video';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

const fixtures: ApplicationFixture[] = [];
async function setup(filename = 'Café 🎬.mp4') {
  const app = await applicationFixture();
  fixtures.push(app);
  const sourcePath = join(app.root, filename);
  await writeFile(sourcePath, 'Original finished clip bytes\0untouched metadata');
  app.media.probeMedia.mockResolvedValue({
    width: 1080,
    height: 1920,
    duration: 12,
    hasAudio: true,
    format: 'mp4',
  });
  return { ...app, sourcePath, input: { scope: app.scope, sourcePath } };
}
afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(fixtures.splice(0).map((app) => app.cleanup()));
});

it('uses the original human filename and readable ordinals without replacing earlier imports', async () => {
  const app = await setup();
  const original = await readFile(app.sourcePath);
  const first = await app.api.importFinishedClip(app.input);
  const firstHead = await app.git.head(first.path);
  const second = await app.api.importFinishedClip(app.input);
  expect([first.name, second.name]).toEqual(['Café 🎬', 'Café 🎬 (2)']);
  expect(first.path).not.toBe(second.path);
  expect(first.id).not.toBe(second.id);
  expect(await app.git.head(first.path)).toBe(firstHead);
  for (const clip of [first, second]) {
    if (!clip.renderedPath) throw new Error('Missing imported source');
    expect(await readFile(clip.renderedPath)).toEqual(original);
    expect((await app.git.status(clip.path)).dirty).toBe(false);
  }
  expect(await readFile(app.sourcePath)).toEqual(original);
});

it('counts case-normalized files, directories and symlinks as occupied names', async () => {
  const app = await setup();
  const directory = join(app.path, 'clips');
  await mkdir(join(directory, 'CAFE\u0301 🎬'));
  await writeFile(join(directory, 'Café 🎬 (2)'), 'Existing file');
  const outside = join(app.root, 'outside');
  await mkdir(outside);
  await writeFile(join(outside, 'keep.txt'), 'External work');
  await symlink(outside, join(directory, 'café 🎬 (3)'), 'junction');
  const clip = await app.api.importFinishedClip(app.input);
  expect(clip.name).toBe('Café 🎬 (4)');
  expect(await readFile(join(directory, 'Café 🎬 (2)'), 'utf8')).toBe('Existing file');
  expect(await readdir(outside)).toEqual(['keep.txt']);
  expect(await readFile(join(outside, 'keep.txt'), 'utf8')).toBe('External work');
});

it.skipIf(process.platform === 'win32')(
  'sanitizes the copied filename without changing source bytes',
  async () => {
    const app = await setup(' .Café: launch?.mp4');
    const original = await readFile(app.sourcePath);
    const clip = await app.api.importFinishedClip(app.input);
    expect(clip.name).toBe('Café launch');
    expect(clip.renderedPath).toBe(join(clip.path, 'video_assets', 'Café launch.mp4'));
    if (!clip.renderedPath) throw new Error('Missing copied source');
    expect(await readFile(clip.renderedPath)).toEqual(original);
    expect(await readFile(app.sourcePath)).toEqual(original);
  },
);

it('does not automatically retry a raced reservation or overwrite the new entry', async () => {
  const app = await setup('Named clip.mp4');
  const directory = join(app.path, 'clips');
  const original = importedWriter.initializeImportedVideo;
  const writer = vi
    .spyOn(importedWriter, 'initializeImportedVideo')
    .mockImplementationOnce(async (...args) => {
      await writeFile(join(args[0], args[1].name), 'Concurrent external file');
      return original(...args);
    });
  await expect(app.api.importFinishedClip(app.input)).rejects.toMatchObject({
    diagnostic: {
      kind: 'app',
      message: { id: 'storageImportNameCollision', params: { path: join(directory, 'Named clip') } },
    },
  });
  expect(writer).toHaveBeenCalledOnce();
  expect(await readdir(directory)).toEqual(['Named clip']);
  expect(await readFile(join(directory, 'Named clip'), 'utf8')).toBe('Concurrent external file');
  writer.mockRestore();
  const retried = await app.api.importFinishedClip(app.input);
  expect(retried.name).toBe('Named clip (2)');
  expect(await readFile(join(directory, 'Named clip'), 'utf8')).toBe('Concurrent external file');
});
