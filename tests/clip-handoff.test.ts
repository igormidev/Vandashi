import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clipHandoffText } from '../src/domain/clip-handoff';
import { availableLocales } from '../src/domain/locales';
import { appMessageCatalogs } from '../src/domain/messages/catalogs';
import type { ClipHandoff } from '../src/domain/models';
import { parseInvocation } from '../src/desktop/validation';
import { messageText } from '../src/renderer/app/diagnostics';
import i18n from '../src/renderer/i18n';
import { clipCreationFixture, type ClipCreationFixture } from './clip-creation-fixture';

let app: ClipCreationFixture;
beforeEach(async () => {
  app = await clipCreationFixture();
});
afterEach(async () => {
  await app.idle();
  await i18n.changeLanguage('en');
  vi.restoreAllMocks();
  await app.cleanup();
});
const handoff = (): ClipHandoff => ({
  message: { id: 'clipHandoff', params: { ratio: app.input.ratio, start: 2, end: 6 } },
  guidance: app.input.prompt,
});

it('persists the typed clip instruction and untouched guidance through provider history recovery', async () => {
  const result = await app.api.createClip(app.input);
  await app.idle();
  const scope = { ...app.scope, clipId: result.clip.id };
  const session = (await app.store.sessions(scope))[0];
  if (!session) throw new Error('Missing clip conversation');
  const user = session.messages.find((message) => message.role === 'user');
  expect(user).toMatchObject({
    appMessage: handoff().message,
    userText: app.input.prompt,
    text: clipHandoffText(handoff()),
    turnId: 'turn-1',
  });
  if (!user) throw new Error('Missing clip request');
  app.agent.readThread.mockResolvedValue({
    id: 'thread',
    turnIds: ['turn-1'],
    messages: [
      {
        id: 'provider-normalized',
        role: 'user',
        turnId: user.turnId,
        files: [],
        createdAt: user.createdAt,
        text: 'Normalized provider text',
      },
    ],
  });
  const recovered = await app.api.openChat({ scope, topic: 'clip', title: result.clip.name });
  expect(recovered.messages.filter((message) => message.role === 'user')).toEqual([user]);
  expect(app.agent.run.mock.calls.find(([input]) => !input.outputSchema)?.[0].prompt).toContain(
    clipHandoffText(handoff()),
  );
  for (const locale of availableLocales) {
    await i18n.changeLanguage(locale);
    const localized = appMessageCatalogs[locale].clipHandoff
      .replace('{{ratio}}', '9:16')
      .replace('{{start}}', '2')
      .replace('{{end}}', '6');
    expect(user.appMessage && messageText(user.appMessage)).toBe(localized);
    expect(clipHandoffText(handoff(), messageText)).toBe(`${localized}\n\n${app.input.prompt}`);
    expect(user.userText).toBe(app.input.prompt);
  }
});

it('canonicalizes an untouched localized retry while treating edited text as user content', async () => {
  app.agent.capabilities.mockRejectedValueOnce(new Error('Temporarily offline'));
  const created = await app.api.createClip(app.input);
  if (created.generation.status !== 'failed') throw new Error('Missing recoverable failure');
  const scope = { ...app.scope, clipId: created.clip.id };
  const session = await app.api.openChat({ scope, topic: 'clip', title: created.clip.name });
  await i18n.changeLanguage('ja');
  const retry = created.generation.handoff;
  const localized = clipHandoffText(retry, messageText);
  await app.api.sendChat({ ...app.request, sessionId: session.id, text: localized, handoff: retry });
  await app.idle();
  let stored = await app.store.getSession(session.id);
  expect(stored.messages.find((message) => message.role === 'user')).toMatchObject({
    text: clipHandoffText(retry),
    appMessage: retry.message,
    userText: retry.guidance,
  });
  const edited = `${localized}\nOnly discuss this change.`;
  await app.api.sendChat({ ...app.request, sessionId: session.id, text: edited, mode: 'read' });
  await app.idle();
  stored = await app.store.getSession(session.id);
  const last = stored.messages.filter((message) => message.role === 'user').at(-1);
  expect(last?.text).toBe(edited);
  expect(last).not.toHaveProperty('appMessage');
  expect(last).not.toHaveProperty('userText');
});

it('rejects a clip handoff outside a clip conversation before workspace writes or inference', async () => {
  const read = vi.spyOn(app.store, 'openWorkspace');
  const sync = vi.spyOn(app.store, 'syncSharedAssets');
  await expect(app.api.sendChat({ ...app.request, handoff: handoff() })).rejects.toMatchObject({
    diagnostic: { message: { id: 'untrustedRequest' } },
  });
  expect(read).not.toHaveBeenCalled();
  expect(sync).not.toHaveBeenCalled();
  expect(app.agent.run).not.toHaveBeenCalled();
  expect((await app.store.getSession(app.session.id)).messages).toEqual([]);
});

it('accepts only bounded exact clip instruction descriptors at IPC', () => {
  const request = { ...app.request, handoff: handoff() };
  expect(parseInvocation('sendChat', [request]).args[0]).toEqual(request);
  for (const invalid of [
    { ...handoff(), message: { id: 'turnSaved' } },
    { ...handoff(), extra: 'injected' },
    { ...handoff(), guidance: 'x'.repeat(2_000_001) },
    ...[
      { ratio: '16:9', start: 2, end: 6 },
      { ratio: '9:16', start: -1, end: 6 },
      { ratio: '9:16', start: 6, end: 6 },
      { ratio: '9:16', start: '2', end: 6 },
      { ratio: '9:16', start: 2, end: Infinity },
      { ratio: '9:16', start: 2, end: 6, extra: 'injected' },
    ].map((params) => ({ ...handoff(), message: { id: 'clipHandoff', params } })),
  ])
    expect(() => parseInvocation('sendChat', [{ ...request, handoff: invalid }])).toThrow();
});
