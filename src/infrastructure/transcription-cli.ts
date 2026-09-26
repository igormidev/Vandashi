import { basename, dirname, join, resolve } from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { AssetStore } from './storage/assets';
import { Registry } from './storage/registry';
import { ManagedTranscriptionAdapter } from './transcription/adapter';
import { audioCategories, transcriptionModels } from '../domain/transcription';
import { diagnosticFromError } from '../domain/diagnostics';

/** The CLI and desktop use the same worker, validation, source hashes and sidecar writer. */
async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      file: { type: 'string' },
      cache: { type: 'string' },
      worker: { type: 'string' },
      model: { type: 'string' },
      profile: { type: 'string' },
      category: { type: 'string', default: 'auto' },
      offline: { type: 'boolean', default: false },
    },
    strict: true,
  });
  if (!values.file || !values.cache)
    throw new Error(
      'Usage: --cache PATH --file PATH [--category auto|dialog|music|sound-effect] [--model MODEL]',
    );
  const path = resolve(values.file);
  if ((await realpath(path)) !== path || !(await lstat(path)).isFile())
    throw new Error('Use the canonical path of a regular asset file.');
  let root = dirname(path);
  while (!['video_assets', 'shared_assets'].includes(basename(root))) {
    const parent = dirname(root);
    if (parent === root)
      throw new Error('Place the media in video_assets or shared_assets before running this command.');
    root = parent;
  }
  const selected =
    values.model ??
    (values.profile
      ? (await new Registry(values.profile).state()).settings.transcriptionModel
      : 'large-v3-turbo');
  const model = transcriptionModels.find((entry) => entry === selected);
  const category = audioCategories.find((entry) => entry === values.category);
  if (!model || (!category && values.category !== 'auto'))
    throw new Error('Unsupported transcription model or audio category.');
  const shared = basename(root) === 'shared_assets';
  const assets = new AssetStore((file) => file);
  const asset = await assets.get(root, path, shared);
  if (asset.shared && !shared)
    throw new Error('Analyze the original shared_assets file, not its _shared copy.');
  if (asset.kind !== 'audio' && asset.kind !== 'video') {
    process.stdout.write(
      JSON.stringify({ type: 'result', path, isAudio: false, kind: asset.kind, required: false }) + '\n',
    );
    return;
  }
  const runtime = new ManagedTranscriptionAdapter({
    cacheDirectory: values.cache,
    workerPath: values.worker ?? join(import.meta.dirname, 'transcription-resources/worker.py'),
    readOnly: values.offline,
  });
  const controller = new AbortController();
  const cancel = () => {
    controller.abort();
  };
  process.once('SIGINT', cancel);
  process.once('SIGTERM', cancel);
  try {
    const analysis =
      asset.analysis && (!category || asset.analysis.category === category)
        ? asset.analysis
        : await runtime.analyze(
            { path, kind: asset.kind, model, ...(category ? { category } : {}) },
            (progress) => {
              process.stderr.write(JSON.stringify({ type: 'progress', ...progress }) + '\n');
            },
            controller.signal,
          );
    const saved =
      asset.analysis === analysis
        ? asset
        : await assets.saveAnalysis(
            root,
            { assetPath: path, expectedRevision: asset.revision, analysis },
            shared,
          );
    const verified = await assets.get(root, saved.path, shared);
    if (!verified.analysis) throw new Error('The saved transcript could not be verified.');
    const transcript = verified.analysis.transcription;
    process.stdout.write(
      JSON.stringify({
        type: 'result',
        path,
        isAudio: asset.kind === 'audio',
        kind: asset.kind,
        category: verified.analysis.category,
        status: transcript.status,
        segments: transcript.status === 'complete' ? transcript.segments.length : 0,
        metadata: path + '.vandashi.json',
        verified: true,
      }) + '\n',
    );
  } finally {
    process.removeListener('SIGINT', cancel);
    process.removeListener('SIGTERM', cancel);
    await runtime.dispose();
  }
}
void main().catch((error: unknown) => {
  process.stderr.write(JSON.stringify({ type: 'error', diagnostic: diagnosticFromError(error) }) + '\n');
  process.exitCode = 1;
});
