import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let app: ApplicationFixture;
let baseline: string;
let original: string;
const edited = '<h1>Manual title awaiting script synchronization</h1>';
beforeEach(async () => {
  app = await applicationFixture();
  await writeFile(join(app.path, 'index.html'), '<h1>Opening title</h1>');
  baseline = await app.git.commit(app.path, 'Opening scene', 'Prepare the editor checkpoint.');
  original = await readFile(join(app.path, 'index.html'), 'utf8');
  await app.api.startStudio(app.scope);
  await writeFile(join(app.path, 'index.html'), edited);
});
afterEach(async () => {
  await app.idle();
  await app.cleanup();
});

it('rejects a real external commit between the opening-head check and the safety commit', async () => {
  const commit = app.git.commit.bind(app.git);
  let external = '';
  vi.spyOn(app.git, 'commit').mockImplementationOnce(async (...args) => {
    await writeFile(join(app.path, 'external.md'), 'Preserve the external commit');
    external = await new LocalGit().commit(app.path, 'External work', 'Committed before safety snapshot.');
    return commit(...args);
  });
  const restore = vi.spyOn(app.git, 'restore');
  await expect(app.api.discardStudio(app.scope)).rejects.toMatchObject({
    diagnostic: { kind: 'app', message: { id: 'appStudioCheckpointChanged' } },
  });
  expect(await app.git.head(app.path)).toBe(external);
  expect(await readFile(join(app.path, 'external.md'), 'utf8')).toContain('external commit');
  expect(await readFile(join(app.path, 'index.html'), 'utf8')).toBe(edited);
  expect(restore).not.toHaveBeenCalled();
  expect((await app.git.history(app.path, 0)).commits[0]?.title).toBe('External work');
});

it('passes only its exact owned backup to restore and preserves an external commit after that backup', async () => {
  const restore = app.git.restore.bind(app.git);
  let external = '';
  let backup = '';
  vi.spyOn(app.git, 'restore').mockImplementationOnce(async (path, revision, expected) => {
    backup = await app.git.head(path);
    expect(revision).toBe(baseline);
    expect(expected).toBe(backup);
    await writeFile(join(path, 'external.md'), 'Preserve work after the backup');
    external = await new LocalGit().commit(path, 'External work', 'Committed after safety snapshot.');
    return restore(path, revision, expected);
  });
  await expect(app.api.discardStudio(app.scope)).rejects.toMatchObject({
    diagnostic: { kind: 'app', message: { id: 'appUndoLaterChanges' } },
  });
  expect(await app.git.head(app.path)).toBe(external);
  expect(await readFile(join(app.path, 'external.md'), 'utf8')).toContain('after the backup');
  expect(await readFile(join(app.path, 'index.html'), 'utf8')).toBe(edited);
  expect(await app.git.readAt(app.path, backup, 'index.html')).toBe(edited);
  expect((await app.api.studioChanges(app.scope)).dirty).toBe(true);
});

it('retains a failed discard through leave checks and reopening, then retries the same backup without AI', async () => {
  const commit = vi.spyOn(app.git, 'commit');
  const restore = vi.spyOn(app.git, 'restore').mockRejectedValueOnce(new Error('Transient restore failure'));
  await expect(app.api.discardStudio(app.scope)).rejects.toThrow('Transient restore failure');
  const backup = await app.git.head(app.path);
  expect(backup).not.toBe(baseline);
  expect((await app.git.status(app.path)).dirty).toBe(false);
  const changes = await app.api.studioChanges(app.scope);
  expect(changes.dirty).toBe(true);
  expect(changes.files.some((file) => file.diff.includes(edited))).toBe(true);
  await app.api.startStudio(app.scope);
  await app.api.discardStudio(app.scope);
  expect(commit).toHaveBeenCalledOnce();
  expect(restore.mock.calls).toEqual([
    [app.path, baseline, backup],
    [app.path, baseline, backup],
  ]);
  expect(await readFile(join(app.path, 'index.html'), 'utf8')).toBe(original);
  expect(await app.git.readAt(app.path, backup, 'index.html')).toBe(edited);
  expect((await app.api.studioChanges(app.scope)).dirty).toBe(false);
  expect(app.agent.run).not.toHaveBeenCalled();
});

it.each(['dirty', 'committed'] as const)(
  'preserves %s external edits before retrying a failed discard',
  async (kind) => {
    const commit = vi.spyOn(app.git, 'commit');
    vi.spyOn(app.git, 'restore').mockRejectedValueOnce(new Error('Transient restore failure'));
    await expect(app.api.discardStudio(app.scope)).rejects.toThrow('Transient restore failure');
    const backup = await app.git.head(app.path);
    await writeFile(join(app.path, 'index.html'), 'External edit after failed discard');
    const expected =
      kind === 'committed'
        ? await new LocalGit().commit(app.path, 'External work', 'Preserve the changed source.')
        : backup;
    await expect(app.api.discardStudio(app.scope)).rejects.toMatchObject({
      diagnostic: {
        kind: 'app',
        message: { id: kind === 'dirty' ? 'gitRestoreDirty' : 'appUndoLaterChanges' },
      },
    });
    expect(commit).toHaveBeenCalledOnce();
    expect(await app.git.head(app.path)).toBe(expected);
    expect(await readFile(join(app.path, 'index.html'), 'utf8')).toBe('External edit after failed discard');
    expect(await app.git.readAt(app.path, backup, 'index.html')).toBe(edited);
    expect((await app.api.studioChanges(app.scope)).dirty).toBe(true);
    expect(app.agent.run).not.toHaveBeenCalled();
  },
);

it('includes the preserved manual diff when the user saves instead of retrying discard', async () => {
  vi.spyOn(app.git, 'restore').mockRejectedValueOnce(new Error('Transient restore failure'));
  await expect(app.api.discardStudio(app.scope)).rejects.toThrow('Transient restore failure');
  app.agent.run.mockImplementationOnce(async (input) => {
    expect(input.prompt).toContain(edited);
    await writeFile(join(app.path, 'script.md'), '# Scene\nThe manually edited title.');
    return { threadId: 'sync', turnId: 'sync', status: 'completed', output: '', error: null };
  });
  await app.api.saveStudio({ scope: app.scope, title: 'Keep manual work', body: 'Synchronize its script.' });
  expect(await readFile(join(app.path, 'index.html'), 'utf8')).toBe(edited);
  expect((await app.api.studioChanges(app.scope)).dirty).toBe(false);
  expect((await app.git.history(app.path, 0)).commits[0]?.title).toBe('Keep manual work');
});

it('records the reviewed save after a failed discard even if synchronization needs no script write', async () => {
  vi.spyOn(app.git, 'restore').mockRejectedValueOnce(new Error('Transient restore failure'));
  await expect(app.api.discardStudio(app.scope)).rejects.toThrow('Transient restore failure');
  const backup = await app.git.head(app.path);
  await app.api.saveStudio({ scope: app.scope, title: 'Reviewed title', body: 'Reviewed description.' });
  const approved = (await app.git.history(app.path, 0)).commits[0];
  expect(approved).toMatchObject({ title: 'Reviewed title', body: 'Reviewed description.' });
  expect(approved?.sha).not.toBe(backup);
  expect(await readFile(join(app.path, 'index.html'), 'utf8')).toBe(edited);
  expect((await app.api.studioChanges(app.scope)).dirty).toBe(false);
});
