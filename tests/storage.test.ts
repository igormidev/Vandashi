import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ChatSession, Scope } from '../src/domain/models';
import type { StorageRecovery } from '../src/domain/storage';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import { safeName } from '../src/infrastructure/storage/files';
import { tasteFiles } from '../src/domain/defaults';

describe('local workspace persistence', () => {
  let directory = '';
  let storage: LocalStorage;
  let git: LocalGit;
  let scope: Scope;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'vandashi-storage-'));
    git = new LocalGit();
    storage = new LocalStorage(join(directory, 'settings'), git);
    const brand = await storage.createBrand({ parentPath: directory, name: 'Science Studio' });
    scope = { brandId: brand.id, videoId: null, clipId: null };
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('creates a persistent brand, complete guides, and clean independent repositories', async () => {
    const workspace = await storage.openBrand(scope.brandId);
    expect(workspace.documents.map((document) => document.name)).toEqual([...tasteFiles]);
    expect(workspace.documents).toHaveLength(13);
    expect(new Set(workspace.documents.map((document) => document.content)).size).toBe(13);
    for (const document of workspace.documents) {
      const body = document.content
        .split('\n')
        .filter((line) => !line.startsWith('#'))
        .join(' ');
      expect(body.trim().split(/\s+/).length, document.name).toBeGreaterThan(200);
      expect(document.content, document.name).toMatch(/^# .+\n/);
      expect(document.content, document.name).not.toMatch(/\b(?:TODO|TBD|LOREM IPSUM)\b/);
      expect(await readFile(document.path, 'utf8')).toBe(document.content);
      for (const referencedGuide of document.content.match(/[A-Z_]+_TASTE\.md/g) ?? []) {
        expect(
          workspace.documents.some((item) => item.name === referencedGuide),
          referencedGuide,
        ).toBe(true);
      }
    }
    expect(workspace.dirty).toBe(false);
    const reloaded = new LocalStorage(join(directory, 'settings'), git);
    expect((await reloaded.getState()).lastBrandId).toBe(scope.brandId);
    expect(await reloaded.repositories(scope)).toHaveLength(2);
    await expect(storage.createBrand({ parentPath: directory, name: 'Science Studio' })).rejects.toThrow();
    expect((await storage.getState()).brands).toHaveLength(1);
  });

  it('keeps brand taste edits through restart and project creation without changing another brand', async () => {
    const original = await storage.openBrand(scope.brandId);
    const selected = original.documents.find(
      (document) => document.name === 'TITLE_LONG_FORM_VIDEOS_TASTE.md',
    );
    if (!selected) throw new Error('Fixture title guide missing');
    const customized = `${selected.content}\n## My channel preference\nUse calm, literal experiment titles.\n`;
    await storage.saveWorkspace({
      scope,
      revision: original.revision,
      documents: [{ path: selected.path, content: customized }],
      brandConfig: null,
      packaging: null,
      commit: { title: 'Refine title taste', body: 'Keep the channel preference in its editable guide.' },
    });

    const reloaded = new LocalStorage(join(directory, 'settings'), git);
    const otherBrand = await reloaded.createBrand({ parentPath: directory, name: 'Second Studio' });
    const second = await reloaded.openBrand(otherBrand.id);
    expect(second.documents.map(({ name, content }) => ({ name, content }))).toEqual(
      original.documents.map(({ name, content }) => ({ name, content })),
    );

    const video = await reloaded.createVideo({
      brandId: scope.brandId,
      name: 'Bridge experiment',
      ratio: '16:9',
    });
    expect(await readFile(join(await reloaded.projectPath(video.scope), 'script.md'), 'utf8')).toBe('');
    const restored = await reloaded.openBrand(scope.brandId);
    expect(restored.documents.map(({ name, content }) => ({ name, content }))).toEqual(
      original.documents.map(({ name, content }) => ({
        name,
        content: name === selected.name ? customized : content,
      })),
    );
    expect(restored.dirty).toBe(false);
    expect(second.dirty).toBe(false);
  });

  it('refreshes persisted brand names after manual and external configuration edits', async () => {
    const workspace = await storage.openBrand(scope.brandId);
    await storage.saveWorkspace({
      scope,
      revision: workspace.revision,
      brandConfig: { ...workspace.brand.config, name: 'Renamed Science' },
      documents: [],
      packaging: null,
      commit: { title: 'Rename brand', body: 'Use the updated public brand name.' },
    });
    const restored = new LocalStorage(join(directory, 'settings'), git);
    expect((await restored.getState()).brands[0]?.name).toBe('Renamed Science');
    const configPath = join(workspace.brand.path, 'brand_identity', 'brand_config.yml');
    const config = await readFile(configPath, 'utf8');
    await writeFile(configPath, config.replace('Renamed Science', 'Externally Renamed Science'));
    const refreshed = await restored.openWorkspace(scope);
    expect(refreshed.brand.name).toBe('Externally Renamed Science');
    expect((await restored.getState()).brands[0]?.name).toBe(refreshed.brand.name);
  });

  it.each(['../escape', 'CON', 'nul.txt', 'title.', 'bad/name', 'bad\\name', 'bad:name', '\u0000bad'])(
    'rejects nonportable or escaping names %s',
    (name) => {
      expect(() => safeName(name)).toThrow();
    },
  );

  it('creates independent video and clip histories without nested gitlinks', async () => {
    const video = await storage.createVideo({ brandId: scope.brandId, name: 'Gravity', ratio: '16:9' });
    const clip = await storage.createClip({
      scope: video.scope,
      name: 'One minute',
      ratio: '9:16',
      start: 0,
      end: 10,
    });
    expect(clip.parentVideoId).toBe(video.scope.videoId);
    expect((await storage.openWorkspace(video.scope)).clips).toHaveLength(1);
    expect((await git.status(await storage.projectPath(video.scope))).dirty).toBe(false);
    expect(await storage.repositories({ ...video.scope, clipId: clip.id })).toHaveLength(4);
    await expect(
      storage.createClip({ scope: video.scope, name: 'Invalid', ratio: '1:1', start: 3, end: 2 }),
    ).rejects.toThrow();
  });

  it('guards drafts against external changes and rejects non-document write targets', async () => {
    const workspace = await storage.openWorkspace(scope);
    const document = workspace.documents[0];
    if (!document) throw new Error('Fixture guide missing');
    await writeFile(document.path, '# Changed externally');
    await expect(
      storage.saveWorkspace({
        scope,
        revision: workspace.revision,
        documents: [],
        brandConfig: { ...workspace.brand.config, name: 'Changed Brand' },
        packaging: null,
        commit: { title: 'Update', body: 'Update settings.' },
      }),
    ).rejects.toThrow('changed outside');
    expect((await storage.openWorkspace(scope)).brand.name).toBe('Science Studio');
    const latest = await storage.openWorkspace(scope);
    await expect(
      storage.saveWorkspace({
        scope,
        revision: latest.revision,
        documents: [{ path: join(directory, 'outside.md'), content: 'no' }],
        brandConfig: null,
        packaging: null,
        commit: { title: 'Update', body: 'Update settings.' },
      }),
    ).rejects.toThrow('not editable');
  });

  it('recovers malformed YAML from its last valid commit and retains the invalid content', async () => {
    const recoveries: StorageRecovery[] = [];
    storage = new LocalStorage(join(directory, 'settings'), git, undefined, (recovery) => {
      recoveries.push(recovery);
    });
    const workspace = await storage.createVideo({ brandId: scope.brandId, name: 'History', ratio: '16:9' });
    const videoPath = await storage.projectPath(workspace.scope);
    const current = { ...workspace.video?.packaging, titles: { long: ['A preserved title'], short: [] } };
    if (!workspace.video) throw new Error('Fixture video missing');
    await storage.saveWorkspace({
      scope: workspace.scope,
      revision: workspace.revision,
      documents: [],
      brandConfig: null,
      packaging: { ...workspace.video.packaging, ...current },
      commit: { title: 'Update title', body: 'Preserve this approved title.' },
    });
    await writeFile(join(videoPath, 'video_packaging.yml'), 'broken: [');
    const restored = await storage.openWorkspace(workspace.scope);
    expect(restored.video?.packaging.titles.long).toEqual(['A preserved title']);
    const backups = await readdir(join(videoPath, '.vandashi-recovery'));
    expect(backups).toHaveLength(1);
    expect(await readFile(join(videoPath, '.vandashi-recovery', backups[0] ?? ''), 'utf8')).toBe('broken: [');
    expect(recoveries).toEqual([
      {
        path: join(videoPath, 'video_packaging.yml'),
        backupPath: join(videoPath, '.vandashi-recovery', backups[0] ?? ''),
        revision: await git.head(videoPath),
      },
    ]);
    await storage.openWorkspace(workspace.scope);
    expect(recoveries).toHaveLength(1);
  });

  it('blocks symlink escapes while allowing files inside the registered brand', async () => {
    const outside = join(directory, 'private');
    await mkdir(outside);
    await writeFile(join(outside, 'secret.txt'), 'private');
    const root = await storage.assetDirectory(scope);
    await symlink(outside, join(root, 'escape'));
    await expect(storage.allowedPath(join(root, 'escape', 'secret.txt'))).rejects.toThrow('symbolic link');
    await expect(storage.allowedPath(join(root, 'escape', 'new.txt'))).rejects.toThrow('symbolic link');
    await expect(storage.allowedPath(join(outside, 'secret.txt'))).rejects.toThrow('outside');
  });

  it('persists independent conversation scopes and undo checkpoints across restart', async () => {
    const session: ChatSession = {
      id: 'chat-1',
      scope,
      topic: 'brand',
      title: 'Brand',
      threadId: 'codex-1',
      messages: [],
      open: true,
      updatedAt: new Date().toISOString(),
      checkpoints: [
        {
          turnId: 'turn-1',
          threadId: 'codex-1',
          heads: { repository: 'head' },
          postHeads: { repository: 'after' },
          messageCount: 0,
        },
      ],
    };
    await Promise.all([
      storage.saveSession(session),
      storage.saveSession({ ...session, id: 'chat-2', topic: 'titles' }),
    ]);
    const reloaded = new LocalStorage(join(directory, 'settings'), git);
    expect(await reloaded.sessions(scope)).toHaveLength(2);
    expect((await reloaded.getSession('chat-1')).checkpoints).toEqual(session.checkpoints);
    expect(await reloaded.sessions({ ...scope, videoId: 'different' })).toHaveLength(0);
  });

  it('stages only an explicit script handoff and preserves external dirty files', async () => {
    const workspace = await storage.createVideo({ brandId: scope.brandId, name: 'Script', ratio: '16:9' });
    await storage.writeScript({
      scope: workspace.scope,
      revision: workspace.revision,
      content: '# My new scene',
    });
    const project = await storage.projectPath(workspace.scope);
    expect((await git.status(project)).paths).toEqual(['script.md']);
    expect(await readFile(join(project, 'script.md'), 'utf8')).toBe('# My new scene');
    const refreshed = await storage.openWorkspace(workspace.scope);
    expect(refreshed.dirty).toBe(true);
    await expect(
      storage.writeScript({
        scope: workspace.scope,
        revision: refreshed.revision,
        content: '# Another scene',
      }),
    ).rejects.toThrow('Commit other');
  });
});
