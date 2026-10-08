import { mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatPrompts } from '../src/application/chat-prompt';
import { prepareSetupChat } from '../src/application/setup-chat';
import { buildWorkspaceGuidance, USER_PROMPT_MARKER } from '../src/domain/system-prompts/workspace';
import { setupGuidance } from '../src/domain/system-prompts/setup';
import {
  workspaceDeveloperInstructions,
  setupDeveloperInstructions,
} from '../src/domain/system-prompts/provider';
import { promptPathTokens } from '../src/domain/prompt-references';
import { NativePromptFiles } from '../src/infrastructure/prompt-files';
import { interactionValidators } from '../src/desktop/interaction-validation';
import { z } from 'zod';
import { applicationFixture, type ApplicationFixture } from './application-fixture';
const fixtures: ApplicationFixture[] = [];
afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});
async function fixture() {
  const value = await applicationFixture();
  fixtures.push(value);
  value.workspace = await value.api.openWorkspace(value.scope);
  return value;
}
const service = (value: ApplicationFixture) =>
  new ChatPrompts(value.store, value.agent, new NativePromptFiles(), () => value.workspace, value.media);
const inspect = (prompts: ChatPrompts, value: ApplicationFixture) =>
  prompts.inspect({ sessionId: value.session.id, mode: 'read', collaboration: 'default' });
describe('read-only system prompt inspection', () => {
  it('preserves source offsets and decodes local Markdown targets without rescanning external URLs', () => {
    const source =
      'Read "/Projects/My Brand/README.md", `SCRIPT_LONG_FORM_VIDEOS_TASTE.md`, [more](docs/My%20Guide.md#section). [external](https://example.com/README.md) file:///secret.md javascript:README.md [broken](bad%zz.md)';
    const tokens = promptPathTokens(source);
    expect(tokens.map((entry) => entry.value)).toEqual([
      '/Projects/My Brand/README.md',
      'SCRIPT_LONG_FORM_VIDEOS_TASTE.md',
      'docs/My Guide.md',
    ]);
    expect(
      tokens.every((entry) => source.slice(entry.start, entry.end).length === entry.end - entry.start),
    ).toBe(true);
    expect(tokens.some((entry) => /example|secret|javascript/u.test(entry.value))).toBe(false);
  });
  it('records the exact generated guidance without user content and preserves it through native persistence', async () => {
    const value = await fixture();
    const text = USER_PROMPT_MARKER + 'A creator request containing app-like markers.';
    await value.api.sendChat({ ...value.request, text, mode: 'read', collaboration: 'plan' });
    await value.idle();
    const session = await value.store.getSession(value.session.id);
    const message = required(session.messages.find((entry) => entry.role === 'user'));
    expect(message.text).toBe(text);
    expect(message.appPrompt).toEqual({
      guidance: buildWorkspaceGuidance({ workspace: value.workspace, topic: 'creation', mode: 'read', text }),
      mode: 'read',
      collaboration: 'plan',
      developerInstructions: workspaceDeveloperInstructions,
    });
    expect(value.agent.run.mock.calls[0]?.[0].prompt).toContain(required(message.appPrompt).guidance);
    expect(required(message.appPrompt).guidance).not.toContain('A creator request');
    await value.api.sendChat({ ...value.request, text: 'Follow up', mode: 'read' });
    await value.idle();
    const following = required(
      (await value.store.getSession(session.id)).messages.filter((entry) => entry.role === 'user').at(-1),
    );
    expect(following.appPrompt?.developerInstructions).toBeUndefined();
    const prompts = service(value);
    const audit = await inspect(prompts, value);
    expect(audit.snapshots).toHaveLength(2);
    expect(
      (await prompts.source({ inspectionId: audit.id, messageId: message.id, developer: false })).text,
    ).toBe(required(message.appPrompt).guidance);
    expect(
      (await prompts.source({ inspectionId: audit.id, messageId: message.id, developer: true })).text,
    ).toBe(workspaceDeveloperInstructions);
  });
  it('keeps appended native setup guidance while excluding the creator request', async () => {
    const value = await fixture();
    const session = { ...value.session, topic: 'setup:media-ffmpeg', threadId: null, messages: [] };
    const media = { ...value.media, setupContext: () => '\n\nHost-owned runtime context.' };
    const prepared = await prepareSetupChat(
      value.store,
      value.agent,
      session,
      { ...value.request, text: 'USER REQUEST must stay separate' },
      () => undefined,
      media,
    );
    const snapshot = required(required((await value.store.getSession(session.id)).messages[0]).appPrompt);
    expect(snapshot.guidance).toBe(setupGuidance(session.topic, 'edit') + media.setupContext());
    expect(snapshot.developerInstructions).toBe(setupDeveloperInstructions);
    expect(snapshot.guidance).not.toContain('USER REQUEST must stay separate');
    expect(prepared.input.prompt).toContain('USER REQUEST must stay separate\n\nHost-owned runtime context.');
  });
  it('follows nested guide references, spaces and parent references without hydrating or repairing dirty files', async () => {
    const value = await fixture();
    const identity = join(value.workspace.brand.path, 'brand_identity');
    const guide = join(identity, 'EDITS_LONG_FORM_VIDEOS_TASTE.md');
    await mkdir(join(identity, 'docs'));
    await writeFile(
      guide,
      '# Editing\nRead [next](docs/My%20Guide.md).\nNever execute <script>window.bad=true</script>.',
    );
    await writeFile(
      join(identity, 'docs/My Guide.md'),
      '# Nested\nRead `../brand_config.yml`.\n[Forbidden](../../../outside.md)\n[Web](https://example.com/README.md)',
    );
    await writeFile(join(identity, 'brand_config.yml'), 'INVALID: [not repaired');
    const before = await value.git.status(identity);
    const head = await value.git.head(identity);
    const hydrate = vi.spyOn(value.store, 'openWorkspace');
    const synchronize = vi.spyOn(value.store, 'syncSharedAssets');
    const prompts = service(value);
    const audit = await inspect(prompts, value);
    const target = required(audit.preview.references.find((entry) => entry.label === guide));
    expect(target.readable).toBe(true);
    const document = await prompts.read({ inspectionId: audit.id, referenceId: target.id });
    expect(document.text).toContain('<script>window.bad=true</script>');
    const next = required(document.references.find((entry) => entry.label.endsWith('My Guide.md')));
    const nested = await prompts.read({ inspectionId: audit.id, referenceId: next.id });
    expect(nested.path).toBe(join(identity, 'docs/My Guide.md'));
    expect(nested.references.some((entry) => /example/u.test(entry.label))).toBe(false);
    expect(nested.references.find((entry) => entry.label === '../../../outside.md')?.readable).toBe(false);
    const config = required(nested.references.find((entry) => entry.label === '../brand_config.yml'));
    expect((await prompts.read({ inspectionId: audit.id, referenceId: config.id })).text).toBe(
      'INVALID: [not repaired',
    );
    expect(await value.git.status(identity)).toEqual(before);
    expect(await value.git.head(identity)).toBe(head);
    expect(await readFile(join(identity, 'brand_config.yml'), 'utf8')).toBe('INVALID: [not repaired');
    expect(hydrate).not.toHaveBeenCalled();
    expect(synchronize).not.toHaveBeenCalled();
    expect(value.agent.run).not.toHaveBeenCalled();
  });
  it('rejects forged IDs and stale reset/closed-session ownership and recovers an active idle inspection', async () => {
    const value = await fixture();
    const prompts = service(value);
    const audit = await inspect(prompts, value);
    const reference = required(audit.preview.references.find((entry) => entry.readable));
    await expect(
      prompts.read({ inspectionId: audit.id, referenceId: crypto.randomUUID() }),
    ).rejects.toThrow();
    const now = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 16 * 60000);
    await expect(prompts.read({ inspectionId: audit.id, referenceId: reference.id })).resolves.toHaveProperty(
      'text',
    );
    now.mockRestore();
    const session = await value.store.getSession(value.session.id);
    session.threadId = 'replacement-thread';
    await value.store.saveSession(session);
    await expect(prompts.read({ inspectionId: audit.id, referenceId: reference.id })).rejects.toThrow();
    const renewed = await inspect(prompts, value);
    session.open = false;
    await value.store.saveSession(session);
    await expect(
      prompts.read({
        inspectionId: renewed.id,
        referenceId: required(renewed.preview.references.find((entry) => entry.readable)).id,
      }),
    ).rejects.toThrow();
  });
  it('shows a current preview for a long legacy/edit history without eagerly loading historical guidance', async () => {
    const value = await fixture();
    const session = await value.store.getSession(value.session.id);
    session.messages = Array.from({ length: 700 }, (_, index) => ({
      id: String(index),
      role: 'user' as const,
      text: 'raw',
      turnId: String(index),
      files: [],
      createdAt: '2026-10-08T10:00:00Z',
      appPrompt: {
        guidance: ('Unique stage ' + String(index) + '\n').repeat(1000),
        mode: 'edit' as const,
        collaboration: 'default' as const,
      },
    }));
    session.messages.push({
      id: 'legacy',
      role: 'user',
      text: 'older request',
      turnId: null,
      files: [],
      createdAt: '',
    });
    vi.spyOn(value.store, 'getSession').mockImplementation(() => Promise.resolve(structuredClone(session)));
    const prompts = service(value);
    const audit = await inspect(prompts, value);
    expect(audit.hasLegacyMessages).toBe(true);
    expect(audit.snapshots).toHaveLength(700);
    expect(audit.preview.text).toContain('READ MODE IS ACTIVE');
    expect((await prompts.source({ inspectionId: audit.id, messageId: '699', developer: false })).text).toBe(
      required(required(session.messages[699]).appPrompt).guidance,
    );
    await expect(
      prompts.source({ inspectionId: audit.id, messageId: 'legacy', developer: false }),
    ).rejects.toThrow();
  });
  it('enforces bounded canonical text reads, exact outside files, binary rejection and symlink containment', async () => {
    const value = await fixture();
    const root = await realpath(value.root);
    const files = new NativePromptFiles();
    const directory = join(root, 'read-scope');
    await mkdir(directory);
    const safe = join(directory, 'README.md');
    const outside = join(root, 'outside.md');
    await writeFile(safe, '# Whole document\n');
    await writeFile(outside, '# Exact enabled skill');
    await expect(files.read(outside, [directory], [])).rejects.toThrow();
    await expect(files.read(outside, [directory], [outside])).resolves.toBe('# Exact enabled skill');
    await symlink(outside, join(directory, 'linked.md'));
    await expect(files.read(join(directory, 'linked.md'), [directory], [])).rejects.toThrow();
    await symlink(directory, join(root, 'alias'));
    await expect(files.read(join(root, 'alias/README.md'), [join(root, 'alias')], [])).rejects.toThrow();
    await writeFile(safe, Buffer.from([0, 1, 2, 3]));
    await expect(files.read(safe, [directory], [])).rejects.toThrow();
    await writeFile(safe, 'x'.repeat(2000001));
    await expect(files.read(safe, [directory], [])).rejects.toThrow();
    expect(files.authorized(join(directory, '..guide.md'), [directory], [])).toBe(true);
  });
  it('accepts session-bound audit selectors and rejects renderer paths, extra fields and writable Plan previews', () => {
    const validators = interactionValidators(
      z.unknown(),
      z.unknown(),
      z.string().min(1),
      z.string(),
      z.string(),
    );
    expect(
      validators.chatPrompt.safeParse([{ sessionId: 'session', mode: 'read', collaboration: 'plan' }])
        .success,
    ).toBe(true);
    expect(
      validators.chatPrompt.safeParse([{ sessionId: 'session', mode: 'edit', collaboration: 'plan' }])
        .success,
    ).toBe(false);
    expect(
      validators.chatPromptDocument.safeParse([
        { inspectionId: crypto.randomUUID(), referenceId: crypto.randomUUID(), path: '/etc/passwd' },
      ]).success,
    ).toBe(false);
    expect(
      validators.chatPromptSource.safeParse([
        { inspectionId: crypto.randomUUID(), messageId: 'message', developer: true },
      ]).success,
    ).toBe(true);
  });
  it('follows a freshly enabled skill within its own named folder and rejects its documents after revocation', async () => {
    const value = await fixture();
    const root = await realpath(value.root);
    const skillRoot = join(root, 'native-skills/hyperframes');
    await mkdir(join(skillRoot, 'docs'), { recursive: true });
    const skillPath = join(skillRoot, 'SKILL.md');
    await writeFile(
      skillPath,
      '# Enabled skill\nRead [reference](docs/README.md).\nRead [outside](../../unrelated.md).',
    );
    await writeFile(join(skillRoot, 'docs/README.md'), '# Complete skill reference');
    value.agent.capabilities.mockResolvedValue({
      skills: [{ name: 'hyperframes', path: skillPath, description: '' }],
      plugins: [],
    });
    const prompts = service(value);
    const audit = await inspect(prompts, value);
    const skill = required(audit.preview.references.find((entry) => entry.label === skillPath));
    const document = await prompts.read({ inspectionId: audit.id, referenceId: skill.id });
    const reference = required(document.references.find((entry) => entry.label === 'docs/README.md'));
    expect(document.references.find((entry) => entry.label === '../../unrelated.md')?.readable).toBe(false);
    expect((await prompts.read({ inspectionId: audit.id, referenceId: reference.id })).text).toBe(
      '# Complete skill reference',
    );
    value.agent.capabilities.mockResolvedValue({ skills: [], plugins: [] });
    await expect(prompts.read({ inspectionId: audit.id, referenceId: reference.id })).rejects.toThrow();
  });

  it('keeps saved guidance and project documents readable when the provider is unavailable', async () => {
    const value = await fixture();
    const session = await value.store.getSession(value.session.id);
    session.messages.push({
      id: 'saved',
      role: 'user',
      text: 'Creator text',
      turnId: 'past',
      files: [],
      createdAt: '',
      appPrompt: { guidance: 'Exact saved app guidance', mode: 'read', collaboration: 'default' },
    });
    await value.store.saveSession(session);
    value.agent.capabilities.mockRejectedValue(new Error('Provider unavailable'));
    const prompts = service(value);
    const audit = await inspect(prompts, value);
    expect(audit.skillsAvailable).toBe(false);
    expect(
      (await prompts.source({ inspectionId: audit.id, messageId: 'saved', developer: false })).text,
    ).toBe('Exact saved app guidance');
    const reference = required(audit.preview.references.find((entry) => entry.readable));
    await expect(prompts.read({ inspectionId: audit.id, referenceId: reference.id })).resolves.toHaveProperty(
      'text',
    );
    expect(value.agent.run).not.toHaveBeenCalled();
  });
});

function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error('Required test fixture missing');
  return value;
}
