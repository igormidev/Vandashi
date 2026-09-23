import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { AssetInspector } from '../src/infrastructure/media/asset-inspection';
import { resolveMediaRuntime } from '../src/infrastructure/media/runtime';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

it('cancels a pending probe and waits for its owned process to close before releasing inspection', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vandashi-probe-cancel-'));
  const source = join(directory, 'source.mp4');
  await writeFile(source, 'Original media remains untouched.');
  const original = await readFile(source);
  const child = Object.assign(new EventEmitter(), {
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    kill: vi.fn(() => true),
  });
  vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  const inspector = new AssetInspector(resolveMediaRuntime(), {});
  const controller = new AbortController();
  let settled = false;
  const pending = inspector.inspect(source, undefined, controller.signal).then(
    () => {
      settled = true;
      return null;
    },
    (error: unknown) => {
      settled = true;
      return error;
    },
  );
  try {
    await vi.waitFor(() => {
      expect(spawn).toHaveBeenCalledOnce();
    });
    controller.abort(new Error('Stop this inspection'));
    await vi.waitFor(() => {
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    });
    expect(settled).toBe(false);
    child.signalCode = 'SIGTERM';
    child.emit('close', null);
    expect(await pending).toMatchObject({ message: 'Stop this inspection' });
    expect(await readFile(source)).toEqual(original);
    await inspector.dispose();
  } finally {
    child.signalCode = 'SIGTERM';
    child.emit('close', null);
    await inspector.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
