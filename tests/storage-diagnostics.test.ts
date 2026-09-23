import { mkdtemp, mkdir, readFile, realpath, rm, stat, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExifTool } from 'exiftool-vendored';
import { z } from 'zod';
import { AppFault, diagnosticFromError } from '../src/domain/diagnostics';
import { defaultSettings } from '../src/domain/defaults';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { AssetStore } from '../src/infrastructure/storage/assets';
import { prepareEmbeddedMetadata } from '../src/infrastructure/storage/embedded-metadata';
import { containedPath, safeName } from '../src/infrastructure/storage/files';
import { Registry } from '../src/infrastructure/storage/registry';
import { metadataSchema } from '../src/infrastructure/storage/schemas';
import { storageFault } from '../src/infrastructure/storage/validation';
import { readYaml } from '../src/infrastructure/storage/yaml-files';

describe('storage and Git diagnostic producers', () => {
  let directory = '';
  beforeEach(async () => {
    directory = await realpath(await mkdtemp(join(tmpdir(), 'vandashi-storage-diagnostics-')));
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it('uses known IDs for path, filename, and Git guards', async () => {
    expect(() => safeName('../outside')).toThrow(AppFault);
    await expect(containedPath(directory, '../outside')).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'storagePathOutside' } },
    });
    const git = new LocalGit();
    await expect(git.restore(directory, '--all')).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'gitRestoreRevisionInvalid' } },
    });
    await expect(git.history(directory, -1)).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'gitHistoryPageInvalid' } },
    });
    await expect(git.commit(directory, '', '')).rejects.toMatchObject({
      diagnostic: { kind: 'app', message: { id: 'appCommitRequired' } },
    });
  });

  it('retains raw Git command failures as external text', async () => {
    const git = new LocalGit();
    await git.init(directory);
    const error: unknown = await git.head(directory).catch((failure: unknown) => failure);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AppFault);
    const diagnostic = diagnosticFromError(error);
    expect(diagnostic.kind).toBe('external');
    if (!(error instanceof Error) || diagnostic.kind !== 'external') throw new Error('Expected Git failure');
    expect(diagnostic.text).toBe(error.message);
    expect(diagnostic.text).toContain('HEAD');
  });

  it('keeps owned guidance separate from parser details and never classifies external prose by spelling', async () => {
    const external = new Error('Choose a valid name without reserved filename characters.');
    expect(diagnosticFromError(storageFault({ id: 'storageRegistryUnreadable' }, external))).toEqual({
      kind: 'app',
      message: { id: 'storageRegistryUnreadable' },
      externalDetail: external.message,
    });
    const known = new AppFault({ id: 'storagePathOutside' });
    expect(storageFault({ id: 'storageRegistryUnreadable' }, known)).toBe(known);
    const registry = new Registry(directory);
    await expect(registry.settings({ ...defaultSettings, splits: { assets: 5 } })).rejects.toMatchObject({
      diagnostic: {
        kind: 'app',
        message: { id: 'storageSettingsInvalid' },
        externalDetail: expect.stringContaining('splits') as unknown,
      },
    });
    await expect(readFile(join(directory, 'registry.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await writeFile(join(directory, 'registry.json'), '{broken');
    await expect(registry.state()).rejects.toMatchObject({
      diagnostic: {
        kind: 'app',
        message: { id: 'storageRegistryUnreadable' },
        externalDetail: expect.any(String) as unknown,
      },
    });
  });

  it('retains filenames as descriptor parameters for malformed metadata and unrecoverable YAML', async () => {
    const root = join(directory, 'assets');
    await mkdir(root);
    const media = join(root, '台本.ogg');
    await writeFile(media, 'media fixture');
    await writeFile(`${media}.vandashi.json`, '{}');
    await expect(new AssetStore((path) => path).list(root, false)).rejects.toMatchObject({
      diagnostic: {
        kind: 'app',
        message: { id: 'storageMetadataInvalid', params: { name: '台本.ogg' } },
        externalDetail: expect.stringContaining('title') as unknown,
      },
    });
    const git = new LocalGit();
    await git.init(directory);
    await writeFile(join(directory, 'config.yml'), 'name: 42');
    await git.commit(directory, 'Save invalid configuration', 'Preserve an invalid recovery fixture.');
    await expect(
      readYaml(directory, 'config.yml', z.object({ name: z.string() }), git),
    ).rejects.toMatchObject({
      diagnostic: {
        kind: 'app',
        message: { id: 'storageRecoveryFailed', params: { name: 'config.yml' } },
        externalDetail: expect.stringContaining('name') as unknown,
      },
    });
  });

  it('persists typed application metadata fallback guidance alongside its compatible English warning', async () => {
    const audio = join(directory, 'large.mp3');
    await writeFile(audio, '');
    await truncate(audio, 65 * 1024 * 1024);
    const prepared = await prepareEmbeddedMetadata(audio, {
      title: 'Large recording',
      description: '',
      tags: [],
    });
    try {
      expect(prepared.path).toBeNull();
      expect(prepared.result.embeddingDiagnostic).toEqual({
        kind: 'app',
        message: { id: 'storageLargeAudioSidecar' },
      });
      expect(prepared.result.embeddingWarning).toContain('sidecar');
      expect(
        metadataSchema.parse({
          title: 'Large recording',
          description: '',
          tags: [],
          hash: 'original',
          ...prepared.result,
        }).embeddingDiagnostic,
      ).toEqual(prepared.result.embeddingDiagnostic);
      expect((await stat(audio)).size).toBe(65 * 1024 * 1024);
    } finally {
      await prepared.dispose();
    }
  });

  it('retains ExifTool error text verbatim as an external metadata fallback diagnostic', async () => {
    const source = join(directory, 'image.png');
    await writeFile(source, 'Source remains unchanged');
    const external = 'ExifTool stderr: Ω\nVANDASHI_DIAGNOSTIC_V1:{"kind":"app"}';
    vi.spyOn(ExifTool.prototype, 'write').mockRejectedValueOnce(new Error(external));
    const prepared = await prepareEmbeddedMetadata(source, { title: 'Image', description: '', tags: [] });
    try {
      expect(prepared.result.embeddingDiagnostic).toEqual({ kind: 'external', text: external });
      expect(prepared.result.embeddingWarning).toBe(external);
      expect(await readFile(source, 'utf8')).toBe('Source remains unchanged');
    } finally {
      await prepared.dispose();
    }
  });
});
