import { access, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { applicationFixture, type ApplicationFixture } from './application-fixture';
import { transcriptionFixture } from './transcription-fixture';
import { LocalGit } from '../src/infrastructure/git/local-git';

let app: ApplicationFixture;
let transcription: ReturnType<typeof transcriptionFixture>;
beforeEach(async () => {
  transcription = transcriptionFixture();
  app = await applicationFixture(transcription);
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});
async function child() {
  return app.store.createClip({ scope: app.scope, name: 'Child', ratio: '9:16', start: 0, end: 2 });
}
const reviewed = { title: 'Approved scene', body: 'Keep the reviewed manual changes.' };

it('preserves partial metadata and child AI writes on failure and resumes an interrupted scoped discard', async () => {
  const clip = await child();
  await app.api.startStudio(app.scope);
  const baseline = await app.git.head(app.path);
  const childBaseline = await app.git.head(clip.path);
  const parentAudio = join(app.path, 'video_assets', 'parent.ogg');
  const childAudio = join(clip.path, 'video_assets', 'child.ogg');
  await writeFile(join(app.path, 'index.html'), '<h1>Manual scene</h1>');
  app.agent.run.mockImplementationOnce(async () => {
    await writeFile(parentAudio, 'Parent speech');
    await writeFile(childAudio, 'Child speech');
    await writeFile(join(app.path, 'script.md'), '# Synchronized scene');
    return { threadId: 'studio', turnId: 'studio', status: 'completed', output: '', error: null };
  });
  const analyze = transcription.analyze.getMockImplementation();
  if (!analyze) throw new Error('Missing fixture');
  transcription.analyze.mockImplementationOnce(analyze).mockRejectedValueOnce(new Error('Alignment failed'));
  await expect(app.api.saveStudio({ scope: app.scope, ...reviewed })).rejects.toThrow('Alignment failed');
  expect(await app.git.head(app.path)).not.toBe(baseline);
  expect(await app.git.head(clip.path)).not.toBe(childBaseline);
  expect((await app.git.status(app.path)).dirty).toBe(false);
  expect((await app.git.status(clip.path)).dirty).toBe(false);
  expect(await readFile(`${parentAudio}.vandashi.json`, 'utf8')).toContain('whisperx');
  expect(
    (await app.api.studioChanges(app.scope)).files.some((file) =>
      file.path.includes('clips/Child/video_assets/child.ogg'),
    ),
  ).toBe(true);
  const restore = app.git.restore.bind(app.git);
  const calls: string[] = [];
  vi.spyOn(app.git, 'restore').mockImplementation(async (...args) => {
    calls.push(args[0]);
    if (calls.length === 2) throw new Error('Transient parent restore failure');
    return restore(...args);
  });
  await expect(app.api.discardStudio(app.scope)).rejects.toThrow('Transient parent restore failure');
  await expect(access(childAudio)).rejects.toThrow();
  await app.api.discardStudio(app.scope);
  expect(calls).toEqual([clip.path, app.path, app.path]);
  await expect(access(parentAudio)).rejects.toThrow();
  expect((await app.api.studioChanges(app.scope)).dirty).toBe(false);
});

it('keeps the original reviewed commit message when retrying a failed AI synchronization', async () => {
  await app.api.startStudio(app.scope);
  await writeFile(join(app.path, 'index.html'), '<h1>Manual scene</h1>');
  app.agent.run.mockRejectedValueOnce(new Error('Disconnected'));
  await expect(app.api.saveStudio({ scope: app.scope, ...reviewed })).rejects.toThrow('Disconnected');
  await app.api.startStudio(app.scope);
  await app.api.saveStudio({ scope: app.scope, title: 'Replacement', body: 'Different text' });
  expect((await app.git.history(app.path, 0)).commits[0]).toMatchObject(reviewed);
  expect((await app.api.studioChanges(app.scope)).dirty).toBe(false);
});

it.each(['retry', 'external-parent'] as const)(
  'handles %s after a partial commit without rerunning AI or accepting changed commit text',
  async (action) => {
    const clip = await child();
    await app.api.startStudio(app.scope);
    await writeFile(join(app.path, 'index.html'), '<h1>Manual scene</h1>');
    app.agent.run.mockImplementationOnce(async () => {
      await writeFile(join(clip.path, 'script.md'), '# Child update');
      return { threadId: 'studio', turnId: 'studio', status: 'completed', output: '', error: null };
    });
    const commit = app.git.commit.bind(app.git);
    let failed = false;
    vi.spyOn(app.git, 'commit').mockImplementation(async (...args) => {
      if (args[0] === clip.path && !failed) {
        failed = true;
        throw new Error('Child commit unavailable');
      }
      return commit(...args);
    });
    await expect(app.api.saveStudio({ scope: app.scope, ...reviewed })).rejects.toThrow(
      'Child commit unavailable',
    );
    expect((await app.api.studioChanges(app.scope)).dirty).toBe(true);
    if (action === 'external-parent') {
      await writeFile(join(app.path, 'index.html'), 'External staged edit');
      await app.git.stage(app.path, ['index.html']);
      const index = await app.git.indexEntries(app.path);
      await expect(app.api.saveStudio({ scope: app.scope, ...reviewed })).rejects.toMatchObject({
        diagnostic: { message: { id: 'storageWorkspaceConflict' } },
      });
      expect(await app.git.indexEntries(app.path)).toBe(index);
      expect(await readFile(join(app.path, 'index.html'), 'utf8')).toBe('External staged edit');
      expect(app.agent.run).toHaveBeenCalledOnce();
      return;
    }
    await app.api.saveStudio({ scope: app.scope, title: 'Replacement', body: 'Different text' });
    expect(app.agent.run).toHaveBeenCalledOnce();
    expect((await app.git.history(app.path, 0)).commits[0]).toMatchObject(reviewed);
    expect((await app.git.history(clip.path, 0)).commits[0]).toMatchObject(reviewed);
  },
);

it('rejects dirty registered children before AI and preserves an external commit during recovery', async () => {
  const clip = await child();
  await app.api.startStudio(app.scope);
  await writeFile(join(clip.path, 'script.md'), '# External child draft');
  await expect(app.api.saveStudio({ scope: app.scope, ...reviewed })).rejects.toMatchObject({
    diagnostic: { message: { id: 'appStudioOtherChanges' } },
  });
  expect(app.agent.run).not.toHaveBeenCalled();
  await app.git.commit(clip.path, 'External child', 'Save prior external draft.');
  app.agent.run.mockImplementationOnce(async () => {
    await writeFile(join(app.path, 'external.md'), 'Concurrent work');
    await new LocalGit().commit(app.path, 'External commit', 'Preserve concurrent work.');
    throw new Error('Disconnected');
  });
  await expect(app.api.saveStudio({ scope: app.scope, ...reviewed })).rejects.toMatchObject({
    diagnostic: { message: { id: 'appStudioCheckpointChanged' } },
  });
  expect((await app.git.history(app.path, 0)).commits[0]?.title).toBe('External commit');
  await expect(app.api.discardStudio(app.scope)).rejects.toMatchObject({
    diagnostic: { message: { id: 'appStudioCheckpointChanged' } },
  });
  expect(await readFile(join(app.path, 'external.md'), 'utf8')).toBe('Concurrent work');
});

it('retains the completed save through a failed workspace refresh without another AI turn', async () => {
  await app.api.startStudio(app.scope);
  await writeFile(join(app.path, 'index.html'), '<h1>Manual scene</h1>');
  vi.spyOn(app.store, 'openWorkspace').mockRejectedValueOnce(new Error('Refresh unavailable'));
  await expect(app.api.saveStudio({ scope: app.scope, ...reviewed })).rejects.toThrow('Refresh unavailable');
  await app.api.saveStudio({ scope: app.scope, ...reviewed });
  expect(app.agent.run).toHaveBeenCalledOnce();
  expect((await app.api.studioChanges(app.scope)).dirty).toBe(false);
});
