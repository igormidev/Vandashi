import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let app: ApplicationFixture;
beforeEach(async () => {
  app = await applicationFixture();
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

it('awaits the private editor flush before checking Git and blocks navigation on a save failure', async () => {
  const studio = await app.api.startStudio(app.scope);
  expect(app.host.prepareStudio).toHaveBeenCalledWith(studio.url);
  app.host.flushStudio.mockImplementationOnce(async () => {
    await writeFile(join(app.path, 'index.html'), '<h1>Last debounced edit</h1>');
  });
  const changes = await app.api.studioChanges(app.scope);
  expect(changes.dirty).toBe(true);
  expect(changes.files.some((file) => file.diff.includes('Last debounced edit'))).toBe(true);
  app.host.flushStudio.mockRejectedValueOnce(new Error('Studio conflict'));
  await expect(app.api.studioChanges(app.scope)).rejects.toThrow('Studio conflict');
  expect((await app.git.status(app.path)).dirty).toBe(true);
});

it('synchronizes a manual change into the script before saving the approved commit', async () => {
  await app.api.startStudio(app.scope);
  await writeFile(join(app.path, 'index.html'), '<h1 style="color:red">Manual title</h1>');
  app.agent.run.mockImplementationOnce(async (input) => {
    expect(input.selection).toEqual((await app.store.getState()).settings.scriptSync);
    expect(input.prompt).toContain('Update ONLY script.md');
    expect(input.prompt).toContain('Manual title');
    await writeFile(join(app.path, 'script.md'), '# Scene\nThe manual title is red.');
    return {
      threadId: 'sync',
      turnId: 'sync',
      status: 'completed',
      output: 'Synchronized red title.',
      error: null,
    };
  });
  await app.api.saveStudio({
    scope: app.scope,
    title: 'Save title color',
    body: 'Keep the red title and synchronize its script.',
  });
  expect(await readFile(join(app.path, 'script.md'), 'utf8')).toContain('title is red');
  expect((await app.git.status(app.path)).dirty).toBe(false);
  expect((await app.git.history(app.path, 0)).commits[0]?.title).toBe('Save title color');
});

it('preserves edits without a success commit when script synchronization fails', async () => {
  await app.api.startStudio(app.scope);
  const head = await app.git.head(app.path);
  await writeFile(join(app.path, 'index.html'), '<h1>Preserve manual work</h1>');
  app.agent.run.mockRejectedValueOnce(new Error('Codex disconnected'));
  await expect(app.api.saveStudio({ scope: app.scope, title: 'Title', body: 'Body' })).rejects.toThrow(
    'disconnected',
  );
  expect(await app.git.head(app.path)).toBe(head);
  expect((await app.git.status(app.path)).dirty).toBe(true);
  expect(await readFile(join(app.path, 'index.html'), 'utf8')).toContain('Preserve manual work');
});

it('does not publish a successful render against a source changed during the export', async () => {
  app.media.renderVideo.mockImplementationOnce(async () => {
    const output = join(app.path, 'output', 'render.mp4');
    await mkdir(join(app.path, 'output'), { recursive: true });
    await writeFile(output, 'Preserved render');
    await writeFile(join(app.path, 'script.md'), '# Concurrent source change');
    return output;
  });
  await expect(app.api.renderVideo(app.scope)).rejects.toThrow('source changed during rendering');
  expect(await readFile(join(app.path, 'output', 'render.mp4'), 'utf8')).toBe('Preserved render');
  expect((await app.store.openWorkspace(app.scope)).video?.renderedPath).toBeNull();
});
