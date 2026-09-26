import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AssetAnalysis } from '../src/domain/transcription';
import { parseAssetAnalysis } from '../src/domain/transcription';
import { AssetStore } from '../src/infrastructure/storage/assets';
import { saveAssetAnalysis } from '../src/infrastructure/storage/asset-analysis';
import { LocalStorage } from '../src/infrastructure/storage/local-storage';
import { LocalGit } from '../src/infrastructure/git/local-git';
import { hashFile } from '../src/infrastructure/storage/files';

function speech(sourceHash: string): AssetAnalysis {
  return {
    schemaVersion: 1,
    sourceHash,
    category: 'dialog',
    categorySource: 'user',
    transcription: {
      status: 'complete',
      engine: 'whisperx',
      model: 'large-v3-turbo',
      language: 'en',
      duration: 2,
      alignment: 'word',
      segments: [{ start: 0.1, end: 1.5, text: 'Hello world' }],
      words: [
        { start: 0.1, end: 0.6, text: 'Hello' },
        { start: 0.8, end: 1.5, text: 'world' },
      ],
    },
  };
}

describe('durable transcription metadata', () => {
  let directory = '';
  let root = '';
  const assets = new AssetStore((path) => path);
  beforeEach(async () => {
    directory = await realpath(await mkdtemp(join(tmpdir(), 'vandashi-transcripts-')));
    root = join(directory, 'assets');
    await mkdir(root);
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('retains source timing through embedded MP3 imports and ordinary metadata edits, then invalidates replaced bytes', async () => {
    const source = join(directory, 'speech.mp3');
    const frame = Buffer.alloc(417);
    frame.set([0xff, 0xfb, 0x90, 0x64]);
    await writeFile(source, Buffer.concat([frame, frame, frame]));
    const sourceHash = await hashFile(source);
    const analysis = speech(sourceHash);
    const imported = await assets.import(
      root,
      {
        sourcePath: source,
        sourceHash,
        kind: 'audio',
        title: 'Speech',
        description: 'A greeting',
        tags: [],
        analysis,
      },
      false,
    );
    expect(imported.analysis).toEqual(analysis);
    expect(imported.tags).toEqual(['audio:dialog']);
    expect(await hashFile(imported.path)).not.toBe(sourceHash);
    const updated = await assets.update(
      root,
      imported.id,
      {
        expectedRevision: imported.revision,
        title: 'Greeting',
        description: 'Reviewed greeting',
        tags: ['voice'],
      },
      false,
    );
    expect(updated.analysis).toEqual(analysis);
    expect(updated.tags).toEqual(['voice', 'audio:dialog']);
    expect(updated.hash).toBe(sourceHash);
    await writeFile(updated.path, 'Different media');
    expect((await assets.get(root, updated.path, false)).analysis).toBeUndefined();
  });

  it('repairs replaced media without restoring its obsolete import identity', async () => {
    const source = join(directory, 'original.wav');
    await writeFile(source, 'Original media');
    const draft = {
      sourcePath: source,
      kind: 'audio' as const,
      title: 'Original',
      description: '',
      tags: [],
    };
    const first = await assets.import(root, draft, false);
    await writeFile(first.path, 'Different replacement media');
    const current = await assets.get(root, first.path, false);
    const hash = await hashFile(first.path);
    const repaired = await assets.saveAnalysis(
      root,
      { assetPath: first.path, expectedRevision: current.revision, analysis: speech(hash) },
      false,
    );
    expect(repaired.hash).toBe(hash);
    const reimported = await assets.import(
      root,
      { ...draft, analysis: speech(await hashFile(source)) },
      false,
    );
    expect(reimported.id).not.toBe(first.id);
    expect(await hashFile(first.path)).toBe(hash);
  });

  it('creates a local asset instead of rewriting a matching shared snapshot', async () => {
    const source = join(directory, 'shared.wav');
    await writeFile(source, 'Shared audio');
    const sharedRoot = join(root, '_shared');
    await mkdir(sharedRoot);
    const draft = { sourcePath: source, kind: 'audio' as const, title: 'Shared', description: '', tags: [] };
    const snapshot = await assets.import(sharedRoot, draft, true);
    const before = await readFile(snapshot.path + '.vandashi.json', 'utf8');
    const local = await assets.import(root, { ...draft, analysis: speech(await hashFile(source)) }, false);
    expect(local.shared).toBe(false);
    expect(local.path).not.toBe(snapshot.path);
    expect(await readFile(snapshot.path + '.vandashi.json', 'utf8')).toBe(before);
  });

  it('uses the shared CLI writer without touching preserveBytes media and rejects stale save attempts', async () => {
    const path = join(root, 'finished.mp4');
    await writeFile(path, 'Finished video fixture');
    const hash = await hashFile(path);
    await writeFile(
      path + '.vandashi.json',
      JSON.stringify({
        title: 'Finished',
        description: 'Final video',
        tags: [],
        hash,
        contentHash: hash,
        preserveBytes: true,
        metadataStorage: 'sidecar',
      }),
    );
    const before = await assets.get(root, path, false);
    const saved = await saveAssetAnalysis(root, {
      assetPath: path,
      expectedRevision: before.revision,
      analysis: speech(hash),
    });
    expect(saved.analysis).toEqual(speech(hash));
    expect(await hashFile(path)).toBe(hash);
    const edited = await assets.update(
      root,
      saved.id,
      { expectedRevision: saved.revision, title: 'Final', description: '', tags: [] },
      false,
    );
    expect(edited.analysis).toEqual(saved.analysis);
    expect(await hashFile(path)).toBe(hash);
    await expect(
      saveAssetAnalysis(root, { assetPath: path, expectedRevision: before.revision, analysis: speech(hash) }),
    ).rejects.toThrow();
    const sidecar = await readFile(path + '.vandashi.json', 'utf8');
    expect(JSON.parse(sidecar)).toMatchObject({ preserveBytes: true, analysis: speech(hash) });
    const stale = speech('a'.repeat(64));
    await expect(
      saveAssetAnalysis(root, { assetPath: path, expectedRevision: edited.revision, analysis: stale }),
    ).rejects.toThrow();
    expect(await readFile(path + '.vandashi.json', 'utf8')).toBe(sidecar);
  });

  it('repairs a duplicate import using verified original bytes even when embedded metadata changed its container hash', async () => {
    const source = join(directory, 'duplicate.mp3');
    const frame = Buffer.alloc(417);
    frame.set([0xff, 0xfb, 0x90, 0x64]);
    await writeFile(source, Buffer.concat([frame, frame, frame]));
    const draft = {
      sourcePath: source,
      kind: 'audio' as const,
      title: 'Original',
      description: 'Already imported',
      tags: ['favorite'],
    };
    const original = await assets.import(root, draft, false);
    expect(original.analysis).toBeUndefined();
    const bytes = await hashFile(original.path);
    const analysis = speech(await hashFile(source));
    const repaired = await assets.import(root, { ...draft, analysis }, false);
    expect(repaired.id).toBe(original.id);
    expect(repaired.analysis).toEqual(analysis);
    expect(repaired.tags).toEqual(['favorite', 'audio:dialog']);
    expect(await hashFile(repaired.path)).toBe(bytes);
    expect(await assets.list(root, false)).toHaveLength(1);
  });

  it('recognizes intentional skips and empty completed speech without accepting impossible timestamps or inconsistent categories', async () => {
    const path = join(root, 'music.opus');
    await writeFile(path, 'Compressed audio fixture');
    const hash = await hashFile(path);
    const item = await assets.get(root, path, false);
    const skipped: AssetAnalysis = {
      schemaVersion: 1,
      sourceHash: hash,
      category: 'music',
      categorySource: 'classifier',
      transcription: { status: 'not-required', reason: 'music' },
    };
    const saved = await saveAssetAnalysis(root, {
      assetPath: path,
      expectedRevision: item.revision,
      analysis: skipped,
    });
    expect(saved.analysis).toEqual(skipped);
    expect(saved.kind).toBe('audio');
    const empty = speech(hash);
    if (empty.transcription.status !== 'complete') throw new Error('Expected transcription');
    empty.transcription.segments = [];
    empty.transcription.words = [];
    empty.transcription.alignment = 'none';
    expect(parseAssetAnalysis(empty)).toEqual(empty);
    expect(parseAssetAnalysis({ ...skipped, category: 'dialog' })).toBeNull();
    const invalid = speech(hash);
    if (invalid.transcription.status !== 'complete') throw new Error('Expected transcription');
    const segment = invalid.transcription.segments[0];
    if (!segment) throw new Error('Expected segment');
    segment.end = 9;
    expect(parseAssetAnalysis(invalid)).toBeNull();
    segment.end = Number.NaN;
    expect(parseAssetAnalysis(invalid)).toBeNull();
  });

  it('discovers authoritative shared and scoped local media without hydrating YAML or duplicating shared snapshots', async () => {
    const git = new LocalGit();
    const storage = new LocalStorage(join(directory, 'state'), git);
    const brand = await storage.createBrand({ parentPath: directory, name: 'Transcription studio' });
    const brandScope = { brandId: brand.id, videoId: null, clipId: null };
    const shared = await storage.assetDirectory(brandScope);
    await writeFile(join(shared, 'shared.wav'), 'Shared audio');
    const video = await storage.createVideo({ brandId: brand.id, name: 'Episode', ratio: '16:9' });
    const local = await storage.assetDirectory(video.scope);
    await writeFile(join(local, 'local.wav'), 'Local audio');
    const project = await storage.projectPath(video.scope);
    await writeFile(join(project, 'video_packaging.yml'), 'invalid: [');
    const originals = await storage.transcriptionAssets({ kind: 'shared' });
    expect(originals.map((asset) => asset.relativePath)).toEqual(['shared.wav']);
    expect(originals[0]?.shared).toBe(true);
    const locals = await storage.transcriptionAssets({ kind: 'scope', scope: video.scope });
    expect(locals.map((asset) => asset.relativePath)).toEqual(['local.wav']);
    const captured = await storage.transcriptionAssets({ kind: 'repositories', paths: [shared, project] });
    expect(captured.map((asset) => asset.path).sort()).toEqual(
      [join(shared, 'shared.wav'), join(local, 'local.wav')].sort(),
    );
    expect(await readFile(join(project, 'video_packaging.yml'), 'utf8')).toBe('invalid: [');
    const candidate = locals[0];
    if (!candidate) throw new Error('Expected asset');
    const head = await git.head(project);
    await storage.saveAssetAnalysis({
      assetPath: candidate.path,
      expectedRevision: candidate.revision,
      analysis: speech(await hashFile(candidate.path)),
    });
    expect(await git.head(project)).toBe(head);
    expect((await git.status(project)).dirty).toBe(true);
    await expect(storage.transcriptionAssets({ kind: 'repositories', paths: [directory] })).rejects.toThrow();
    const copy = join(local, '_shared', 'shared.wav');
    const copyAsset = await assets.get(local, copy, false);
    await expect(
      storage.saveAssetAnalysis({
        assetPath: copy,
        expectedRevision: copyAsset.revision,
        analysis: speech(await hashFile(copy)),
      }),
    ).rejects.toThrow();
    const linked = join(local, 'linked.wav');
    await symlink(candidate.path, linked);
    await expect(
      saveAssetAnalysis(local, {
        assetPath: linked,
        expectedRevision: candidate.revision,
        analysis: speech(await hashFile(candidate.path)),
      }),
    ).rejects.toThrow();
  });

  it('publishes prepared finished-video transcription with the original byte-preservation receipt', async () => {
    const git = new LocalGit();
    const storage = new LocalStorage(join(directory, 'finished-state'), git);
    const brand = await storage.createBrand({ parentPath: directory, name: 'Finished media' });
    const sourcePath = join(directory, 'original.mp4');
    await writeFile(sourcePath, 'Original finished media bytes');
    const hash = await hashFile(sourcePath);
    const workspace = await storage.importVideo(
      { brandId: brand.id, name: 'Finished episode', ratio: '16:9', sourcePath },
      async (copy) => speech(await hashFile(copy)),
    );
    const asset = workspace.assets.find((item) => !item.shared);
    if (!asset) throw new Error('Expected imported media');
    expect(asset.analysis).toEqual(speech(hash));
    expect(await hashFile(asset.path)).toBe(hash);
    expect(JSON.parse(await readFile(asset.path + '.vandashi.json', 'utf8'))).toMatchObject({
      preserveBytes: true,
      analysisContentHash: hash,
    });
    expect(workspace.dirty).toBe(false);
  });
});
