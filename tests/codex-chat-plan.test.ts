import { describe, expect, it } from 'vitest';
import type { AgentRunInput } from '../src/domain/agent';
import { executeTurn } from '../src/infrastructure/codex/execution';
import { threadConfiguration } from '../src/infrastructure/codex/policy';
import type { RpcClient, RpcNotification } from '../src/infrastructure/codex/transport';
import { parseInvocation } from '../src/desktop/validation';

function planClient() {
  const requests: { method: string; params: unknown }[] = [];
  const listeners = new Set<(event: RpcNotification) => void>();
  let turn = 0;
  const client: RpcClient = {
    request: (method, params) => {
      requests.push({ method, params });
      if (method === 'config/read')
        return Promise.resolve({
          config: {
            mcp_servers: { external: { command: 'fixture' } },
            apps: { external: { enabled: true } },
          },
        });
      if (method === 'plugin/installed')
        return Promise.resolve({ marketplaces: [{ plugins: [{ id: 'external-plugin' }] }] });
      if (method === 'turn/start') {
        turn++;
        const id = `turn-${String(turn)}`;
        for (const listener of listeners)
          listener({
            method: 'turn/completed',
            params: { threadId: 'thread', turn: { id, status: 'completed', items: [] } },
          });
        return Promise.resolve({ turn: { id, status: 'inProgress' } });
      }
      return Promise.resolve({});
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onFailure: () => () => undefined,
    close: () => Promise.resolve(),
  };
  return { client, requests };
}
const input: AgentRunInput = {
  threadId: 'thread',
  cwd: '/workspace',
  mode: 'read',
  writableRoots: [],
  interactive: true,
  collaboration: 'plan',
  selection: { model: 'supported-model', reasoning: 'medium', fast: false },
  prompt: 'Prepare a plan.',
  attachments: [],
};
const callbacks = { onEvent: () => undefined, onTurn: () => undefined, supportsImages: false };

describe('Plan mode runtime scope', () => {
  it('plans in the OS read-only sandbox and explicitly resets the collaboration mode before continuing normal chat', async () => {
    const { client, requests } = planClient();
    expect((await executeTurn(client, 'thread', input, callbacks)).status).toBe('completed');
    expect(
      (
        await executeTurn(
          client,
          'thread',
          { ...input, collaboration: 'default', mode: 'edit', writableRoots: ['/workspace'] },
          callbacks,
        )
      ).status,
    ).toBe('completed');
    const turns = requests.filter((request) => request.method === 'turn/start');
    expect(turns[0]?.params).toMatchObject({
      approvalPolicy: 'never',
      runtimeWorkspaceRoots: ['/workspace'],
      sandboxPolicy: { type: 'readOnly', networkAccess: true },
      collaborationMode: { mode: 'plan', settings: { model: 'supported-model', reasoning_effort: 'medium' } },
    });
    expect(turns[1]?.params).toMatchObject({
      approvalPolicy: 'never',
      sandboxPolicy: { type: 'workspaceWrite', writableRoots: ['/workspace'] },
      collaborationMode: { mode: 'default' },
    });
  });

  it('rejects forged editable planning requests at both IPC and native execution boundaries', async () => {
    const { client, requests } = planClient();
    const request = {
      sessionId: 'session',
      text: 'Plan it.',
      mode: 'read',
      collaboration: 'plan',
      selection: input.selection,
      attachments: [],
    };
    expect(parseInvocation('sendChat', [request]).method).toBe('sendChat');
    expect(() => parseInvocation('sendChat', [{ ...request, mode: 'edit' }])).toThrow();
    await expect(executeTurn(client, 'thread', { ...input, mode: 'edit' }, callbacks)).rejects.toThrow();
    expect(requests).toEqual([]);
  });

  it('enables provider plan progress while retaining disabled external integrations in read-only planning', async () => {
    const { client } = planClient();
    const configuration = await threadConfiguration(client, input);
    expect(configuration).toMatchObject({
      sandbox: 'read-only',
      approvalPolicy: 'never',
      config: {
        'tools.update_plan.enabled': true,
        mcp_servers: { external: { enabled: false } },
        plugins: { 'external-plugin': { enabled: false } },
        'features.apps': false,
        'browser_use.enabled': false,
        'computer_use.enabled': false,
      },
    });
  });
});
