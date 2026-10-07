import { afterEach, expect, it, vi } from 'vitest';
import type { AgentPort } from '../src/domain/agent';
import type { StoragePort } from '../src/domain/storage';
import { ChatSkills } from '../src/application/chat-skills';
import { loadCapabilities } from '../src/infrastructure/codex/discovery';
import type { RpcClient } from '../src/infrastructure/codex/transport';
import { commandItems, commandQuery } from '../src/renderer/features/chat/composer-command';
import {
  addStash,
  readStash,
  restoreStash,
  type ComposerSnapshot,
} from '../src/renderer/features/chat/composer-stash';

afterEach(() => {
  vi.unstubAllGlobals();
});
function storage(failWrite = -1) {
  const values = new Map<string, string>();
  let writes = 0;
  const local = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (++writes === failWrite) throw new DOMException('Storage full', 'QuotaExceededError');
      values.set(key, value);
    },
  };
  vi.stubGlobal('localStorage', local);
  return {
    values,
    local,
    get writes() {
      return writes;
    },
  };
}
const snapshot = (text: string): ComposerSnapshot => ({
  draft: { text, seed: null, pending: null },
  mode: 'read',
  collaboration: 'plan',
  attachments: ['/selected/native/image.png'],
});

it('recognizes exact leading slash and skill queries without interpreting quoted or embedded user content', () => {
  expect(commandQuery('/plan Explain this carefully')).toEqual({
    kind: 'command',
    query: 'plan',
    remainder: 'Explain this carefully',
  });
  expect(commandQuery('$hyper')).toEqual({ kind: 'skill', query: 'hyper', remainder: '' });
  expect(commandQuery('$hyperframes already selected')).toBeNull();
  expect(commandQuery('Quote /compact')).toBeNull();
  expect(commandQuery('> /edit')).toBeNull();
  const skills = [{ name: 'hyperframes', description: 'Verified enabled provider skill' }];
  expect(commandItems(skills, 'skill:hyper', false, true).map((item) => item.id)).toEqual(['$hyperframes']);
  expect(commandItems(skills, '', false, false).map((item) => item.id)).toEqual([
    '/read',
    '/edit',
    '$hyperframes',
  ]);
});

it('persists exact draft mode, collaboration and file selections per conversation before clearing active input', () => {
  const { values } = storage();
  const original = snapshot('Exact\n\n  user draft');
  addStash('one', original);
  expect(readStash('other')).toEqual([]);
  const saved = readStash('one')[0];
  expect(saved).toMatchObject(original);
  expect(JSON.parse(values.get('vandashi.draft.one') ?? '{}')).toMatchObject({
    text: '',
    mode: 'read',
    collaboration: 'plan',
    attachments: [],
  });
  const replacement = snapshot('Current draft to preserve');
  const restored = restoreStash('one', saved?.id ?? '', replacement);
  expect(restored).toMatchObject(original);
  expect(readStash('one')).toHaveLength(1);
  expect(readStash('one')[0]).toMatchObject(replacement);
  expect(JSON.parse(values.get('vandashi.draft.one') ?? '{}')).toMatchObject({
    text: original.draft.text,
    attachments: original.attachments,
  });
});

it('keeps both the live and selected draft recoverable across every failed stash restore write', () => {
  for (const failedStep of [3, 4, 5]) {
    const { values } = storage(failedStep);
    const selected = snapshot('Selected exact draft');
    addStash('one', selected);
    const selectedId = readStash('one')[0]?.id ?? '';
    const active = snapshot('Unsaved current draft');
    expect(() => restoreStash('one', selectedId, active)).toThrow();
    const durable = readStash('one');
    expect(durable.some((entry) => entry.draft.text === selected.draft.text)).toBe(true);
    // The first failed write leaves the original live editor untouched. Later failures
    // retain its exact replacement safety copy before writing the selected active draft.
    if (failedStep > 3) expect(durable.some((entry) => entry.draft.text === active.draft.text)).toBe(true);
    expect(active.draft.text).toBe('Unsaved current draft');
    expect(values.has('vandashi.draft.one')).toBe(true);
  }
});

it('rejects corrupt cached drafts and preserves all twenty entries when swapping at stash capacity', () => {
  const { values } = storage();
  values.set(
    'vandashi.stash.invalid',
    JSON.stringify([
      {
        id: 'bad',
        createdAt: 'today',
        draft: snapshot('broken').draft,
        mode: 'unsafe',
        collaboration: 'plan',
        attachments: [],
      },
    ]),
  );
  expect(readStash('invalid')).toEqual([]);
  for (let index = 0; index < 20; index++) addStash('full', snapshot(`saved ${String(index)}`));
  const entries = readStash('full');
  expect(() => {
    addStash('full', snapshot('overflow'));
  }).toThrow(RangeError);
  expect(restoreStash('full', entries[0]?.id ?? '', snapshot('new current'))?.draft.text).toBe('saved 19');
  const remaining = readStash('full');
  expect(remaining).toHaveLength(20);
  expect(remaining[0]?.draft.text).toBe('new current');
  expect(remaining.some((entry) => entry.draft.text === 'saved 0')).toBe(true);
});

it('returns fresh project-scoped enabled skills without leaking provider paths or hydrating the workspace', async () => {
  const getSession = vi
    .fn()
    .mockResolvedValue({ id: 'one', open: true, scope: { brandId: 'brand', videoId: null, clipId: null } });
  const discoverAgentScope = vi.fn().mockResolvedValue({ cwd: '/registered/exact/project' });
  const openWorkspace = vi.fn();
  const capabilities = vi.fn<AgentPort['capabilities']>().mockResolvedValue({
    plugins: [],
    skills: [
      { name: 'hyperframes', path: '/private/provider/hyperframes/SKILL.md', description: 'Enabled' },
      { name: 'hyperframes', path: '/duplicate', description: 'Duplicate' },
      { name: 'injected\n$other', path: '/bad', description: 'Invalid token' },
      { name: 'disabled-or-invalid', path: '', description: 'Missing provider path' },
    ],
  });
  const service = new ChatSkills(
    { getSession, discoverAgentScope, openWorkspace } as unknown as StoragePort,
    { capabilities } as unknown as AgentPort,
  );
  const first = service.read('one');
  const same = service.read('one');
  expect(same).toBe(first);
  expect(await first).toEqual([{ name: 'hyperframes', description: 'Enabled' }]);
  expect(capabilities).toHaveBeenCalledWith('/registered/exact/project');
  expect(openWorkspace).not.toHaveBeenCalled();
  await service.read('one');
  expect(capabilities).toHaveBeenCalledTimes(2);
  getSession.mockResolvedValueOnce({ id: 'one', open: false, scope: {} });
  await expect(service.read('one')).rejects.toThrow();
  expect(capabilities).toHaveBeenCalledTimes(2);
});

it('force-reloads native skills and excludes disabled or malformed provider entries without changing feature flags', async () => {
  const request = vi.fn<RpcClient['request']>().mockImplementation((method) =>
    Promise.resolve(
      method === 'skills/list'
        ? {
            data: [
              {
                skills: [
                  { name: 'enabled', path: '/provider/enabled', description: 'Active', enabled: true },
                  { name: 'disabled', path: '/provider/disabled', description: 'Inactive', enabled: false },
                  { name: 'unknown', path: '/provider/unknown', description: 'No explicit permission' },
                ],
              },
            ],
          }
        : {},
    ),
  );
  const capabilities = await loadCapabilities({ request } as unknown as RpcClient, '/exact/cwd');
  expect(request).toHaveBeenCalledWith('skills/list', { cwds: ['/exact/cwd'], forceReload: true });
  expect(capabilities.skills.map((entry) => entry.name)).toEqual(['enabled']);
  expect(request.mock.calls.some(([method]) => /config|feature|thread\//u.test(method))).toBe(false);
});
