import { describe, expect, it } from 'vitest';
import { OperationGate } from '../src/application/operation-gate';

describe('foreground work after passive workspace reads', () => {
  it('lets a native-picker metadata request wait for a focus refresh without a false busy failure', async () => {
    const events: (string | null)[] = [];
    const gate = new OperationGate((owner) => events.push(owner));
    const finishRead = gate.acquire('workspace-read', false);
    let descriptions = 0;
    const metadata = gate.run('asset-description', () => {
      descriptions++;
      return Promise.resolve('Observed city artwork');
    });
    await Promise.resolve();
    expect(descriptions).toBe(0);
    expect(events).toEqual([]);
    finishRead();
    await expect(metadata).resolves.toBe('Observed city artwork');
    expect(descriptions).toBe(1);
    expect(events).toEqual(['asset-description', null]);
    expect(gate.busy).toBe(false);
  });

  it('still rejects a competing edit instead of silently queueing it', async () => {
    const gate = new OperationGate();
    const release = gate.acquire('chat');
    let started = false;
    await expect(
      gate.run('asset-description', () => {
        started = true;
        return Promise.resolve();
      }),
    ).rejects.toThrow('Another operation');
    expect(started).toBe(false);
    release();
  });

  it('grants only one competing foreground operation after a read', async () => {
    const gate = new OperationGate();
    const finishRead = gate.acquire('workspace-read', false);
    let finishDescription: (() => void) | undefined;
    const first = gate.run(
      'asset-description',
      () => new Promise<void>((resolve) => (finishDescription = resolve)),
    );
    const second = gate.run('commit-message', () => Promise.resolve('unexpected'));
    const rejected = expect(second).rejects.toThrow('Another operation');
    finishRead();
    await rejected;
    expect(gate.busy).toBe(true);
    finishDescription?.();
    await first;
    expect(gate.busy).toBe(false);
  });
});

describe('conversation and Studio startup after completion', () => {
  it.each(['open-chat', 'studio-open'] as const)(
    'serializes %s and the other startup when both arrive during a workspace refresh',
    async (firstOwner) => {
      const gate = new OperationGate();
      const finishRead = gate.acquire('workspace-read', false);
      let finishFirst: (() => void) | undefined;
      let secondStarted = false;
      const first = gate.runStartup(
        firstOwner,
        () => new Promise<void>((resolve) => (finishFirst = resolve)),
      );
      const second = gate.runStartup(firstOwner === 'open-chat' ? 'studio-open' : 'open-chat', () => {
        secondStarted = true;
        return Promise.resolve('Ready');
      });
      expect(finishFirst).toBeUndefined();
      finishRead();
      await Promise.resolve();
      expect(finishFirst).toBeTypeOf('function');
      expect(secondStarted).toBe(false);
      finishFirst?.();
      await first;
      await expect(second).resolves.toBe('Ready');
      expect(gate.busy).toBe(false);
    },
  );

  it.each(['open-chat', 'studio-open'] as const)(
    '%s still rejects duplicate startups and active AI operations',
    async (owner) => {
      const gate = new OperationGate();
      let starts = 0;
      const start = () => {
        starts++;
        return Promise.resolve();
      };
      const finishSame = gate.acquire(owner);
      await expect(gate.runStartup(owner, start)).rejects.toThrow('Another operation');
      finishSame();
      const finishChat = gate.acquire('active-turn');
      await expect(gate.runStartup(owner, start)).rejects.toThrow('Another operation');
      finishChat();
      expect(starts).toBe(0);
    },
  );
});
