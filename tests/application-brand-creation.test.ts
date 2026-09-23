import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { applicationFixture, type ApplicationFixture } from './application-fixture';

let fixture: ApplicationFixture;
beforeEach(async () => {
  fixture = await applicationFixture();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fixture.cleanup();
});

it('checks the real Git executable before brand writes and permits a clean retry after repair', async () => {
  const before = await readdir(fixture.root);
  const missing = new LocalGit(join(fixture.root, 'unavailable-git'));
  const check = vi.spyOn(fixture.git, 'checkAvailable').mockImplementation(() => missing.checkAvailable());
  const create = vi.spyOn(fixture.store, 'createBrand');
  const input = { parentPath: fixture.root, name: 'First Brand' };
  for (let attempt = 0; attempt < 2; attempt++)
    await expect(fixture.api.createBrand(input)).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'gitUnavailable' } },
    });
  expect(create).not.toHaveBeenCalled();
  expect(await readdir(fixture.root)).toEqual(before);
  expect((await fixture.store.getState()).brands).toHaveLength(1);
  check.mockRestore();
  const created = await fixture.api.createBrand(input);
  expect(create).toHaveBeenCalledOnce();
  expect(create).toHaveBeenCalledWith(input);
  expect(created.name).toBe(input.name);
  expect((await fixture.store.getState()).brands).toHaveLength(2);
});
