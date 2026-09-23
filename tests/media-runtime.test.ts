import { EventEmitter } from 'node:events';
import { spawn, type ChildProcess } from 'node:child_process';
import { afterEach, expect, it, vi } from 'vitest';
import { terminateProcess } from '../src/infrastructure/media/runtime';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

function processFixture(pid: number) {
  const process = Object.assign(new EventEmitter(), {
    pid,
    exitCode: null as number | null,
    signalCode: null as NodeJS.Signals | null,
    kill: vi.fn(() => true),
  });
  return { process, child: process as unknown as ChildProcess };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it('keeps Windows cleanup pending until both the child and taskkill finish, even when disposed twice', async () => {
  vi.stubGlobal('process', { ...process, platform: 'win32' });
  const parent = processFixture(4100);
  const killer = processFixture(4101);
  vi.mocked(spawn).mockReturnValue(killer.child);
  let settled = false;
  const first = terminateProcess(parent.child);
  const observed = first.then(() => {
    settled = true;
  });
  expect(spawn).toHaveBeenCalledWith(expect.stringMatching(/taskkill\.exe$/), ['/PID', '4100', '/T', '/F'], {
    windowsHide: true,
    stdio: 'ignore',
  });
  expect(parent.process.kill).not.toHaveBeenCalled();
  parent.process.exitCode = 1;
  parent.process.emit('close', 1);
  const second = terminateProcess(parent.child);
  expect(second).toBe(first);
  await Promise.resolve();
  expect(settled).toBe(false);
  expect(spawn).toHaveBeenCalledOnce();
  killer.process.exitCode = 0;
  killer.process.emit('close', 0);
  await Promise.all([observed, second]);
  expect(settled).toBe(true);
});

it.each(['error', 'nonzero'] as const)(
  'falls back on a Windows taskkill %s and still waits for closure',
  async (failure) => {
    vi.stubGlobal('process', { ...process, platform: 'win32' });
    const parent = processFixture(4200);
    const killer = processFixture(4201);
    vi.mocked(spawn).mockReturnValue(killer.child);
    let settled = false;
    const pending = terminateProcess(parent.child).then(() => {
      settled = true;
    });
    if (failure === 'error') killer.process.emit('error', new Error('taskkill unavailable'));
    killer.process.exitCode = 1;
    killer.process.emit('close', 1);
    await Promise.resolve();
    expect(parent.process.kill).toHaveBeenCalledWith('SIGKILL');
    expect(settled).toBe(false);
    parent.process.signalCode = 'SIGKILL';
    parent.process.emit('close', null);
    await pending;
  },
);

it('bounds a stalled Windows tree-kill command without reporting cleanup before the processes close', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('process', { ...process, platform: 'win32' });
  const parent = processFixture(4300);
  const killer = processFixture(4301);
  vi.mocked(spawn).mockReturnValue(killer.child);
  let settled = false;
  const pending = terminateProcess(parent.child).then(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(3_000);
  expect(parent.process.kill).toHaveBeenCalledWith('SIGKILL');
  expect(killer.process.kill).toHaveBeenCalledWith('SIGKILL');
  expect(settled).toBe(false);
  parent.process.signalCode = 'SIGKILL';
  parent.process.emit('close', null);
  await Promise.resolve();
  expect(settled).toBe(false);
  killer.process.signalCode = 'SIGKILL';
  killer.process.emit('close', null);
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});

it('preserves POSIX graceful termination and escalates only after the grace period', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('process', { ...process, platform: 'linux' });
  const parent = processFixture(4400);
  const pending = terminateProcess(parent.child);
  expect(parent.process.kill).toHaveBeenCalledExactlyOnceWith('SIGTERM');
  await vi.advanceTimersByTimeAsync(2_999);
  expect(parent.process.kill).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);
  expect(parent.process.kill).toHaveBeenLastCalledWith('SIGKILL');
  parent.process.signalCode = 'SIGKILL';
  parent.process.emit('close', null);
  await pending;
  expect(spawn).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
