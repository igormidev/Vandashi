import { updateValidators } from './update-validation';
import { transcriptionValidators } from './transcription-validation';
import { AppFault } from '../domain/diagnostics';
import { extname } from 'node:path';
import { z } from 'zod';
import type { ApiMethod } from '../domain/api';
import { desktopUrl } from './request-errors';
import { supportedLocales } from '../domain/locales';
import { clipHandoffSchema } from './clip-handoff-schema';
import { audioCategories, transcriptionModels } from '../domain/transcription';

const text = z.string().max(2_000_000);
const id = z.string().min(1).max(500);
const path = z
  .string()
  .min(1)
  .max(32_768)
  .refine((value) => !value.includes('\0'));
const scope = z
  .object({ brandId: id, videoId: id.nullable(), clipId: id.nullable() })
  .strict()
  .refine((value) => value.clipId === null || value.videoId !== null);
const selection = z.object({ model: id, reasoning: id, fast: z.boolean() }).strict();
const platform = z.enum([
  'youtube',
  'youtubeShorts',
  'odysee',
  'rumble',
  'tiktok',
  'instagram',
  'facebook',
  'x',
]);
const texts = z.array(text).max(500);
const packaging = z
  .object({
    titles: z.object({ long: texts, short: texts }).strict(),
    descriptions: z.object({ long: text, short: text }).strict(),
    tags: z.object({ long: texts, short: texts }).strict(),
    thumbnails: z.array(path),
    theme: text,
  })
  .strict();
const brandConfig = z
  .object({
    name: z.string().trim().min(3).max(100),
    description: text,
    image: text,
    platforms: z.partialRecord(platform, z.object({ url: text, browser: text }).strict()),
  })
  .strict();
const draft = z
  .object({
    audioCategory: z.enum(audioCategories).optional(),
    sourcePath: path,
    sourceHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    title: text,
    description: text,
    tags: texts,
    kind: z.enum(['image', 'video', 'audio', 'other']),
  })
  .strict();
const commit = { title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10000) };
const noArgs = z.tuple([]);
export const validators: Readonly<Record<ApiMethod, z.ZodType>> = Object.freeze({
  ...transcriptionValidators(scope),
  ...updateValidators,
  getState: noArgs,
  chooseDirectory: noArgs,
  chooseFiles: z.tuple([z.enum(['assets', 'images', 'video'])]),
  createBrand: z.tuple([z.object({ parentPath: path, name: z.string().trim().min(3).max(100) }).strict()]),
  openBrand: z.tuple([id]),
  importBrand: z.tuple([z.object({ path }).strict()]),
  listVideos: z.tuple([id]),
  createVideo: z.tuple([z.object({ brandId: id, name: id, ratio: z.enum(['16:9', '9:16']) }).strict()]),
  importFinishedVideo: z.tuple([z.object({ brandId: id, name: id, sourcePath: path }).strict()]),
  openWorkspace: z.tuple([scope]),
  saveWorkspace: z.tuple([
    z
      .object({
        scope,
        revision: text,
        documents: z.array(z.object({ path, content: text }).strict()).max(100),
        brandConfig: brandConfig.nullable(),
        packaging: packaging.nullable(),
        commit: z.object(commit).strict(),
      })
      .strict(),
  ]),
  suggestCommit: z.tuple([z.object({ scope, summary: text }).strict()]),
  history: z.tuple([z.object({ scope, page: z.number().int().min(0).max(100_000) }).strict()]),
  checks: z.tuple([z.object({ scope: scope.nullable(), video: z.boolean() }).strict()]),
  models: noArgs,
  settings: z.tuple([
    z
      .object({
        locale: z.enum(supportedLocales),
        transcriptionModel: z.enum(transcriptionModels),
        chat: selection,
        automation: selection,
        scriptSync: selection,
        assetMetadata: selection,
        chapters: selection,
        splits: z.record(z.string().max(100), z.number().min(25).max(75)),
      })
      .strict(),
  ]),
  sessions: z.tuple([scope]),
  openChat: z.tuple([z.object({ scope, topic: id, title: id }).strict()]),
  closeChat: z.tuple([id]),
  resetChat: z.tuple([id]),
  sendChat: z.tuple([
    z
      .object({
        sessionId: id,
        text: text.min(1),
        mode: z.enum(['read', 'edit']),
        selection,
        attachments: z.array(path).max(50),
        handoff: clipHandoffSchema.optional(),
      })
      .strict(),
  ]),
  cancelChat: noArgs,
  undoChat: z.tuple([id]),
  describeAsset: z.tuple([
    z.object({ scope, path, requestId: id, category: z.enum(audioCategories).optional() }).strict(),
  ]),
  cancelAssetInspection: z.tuple([id]),
  importAsset: z.tuple([z.object({ scope, draft }).strict()]),
  updateAsset: z.tuple([
    z
      .object({
        scope,
        assetId: id,
        expectedRevision: z.string().regex(/^[a-f0-9]{64}$/u),
        title: text,
        description: text,
        tags: texts,
        commit: z.object(commit).strict().optional(),
      })
      .strict(),
  ]),
  deleteAsset: z.tuple([
    z.object({ scope, assetId: id, expectedRevision: z.string().regex(/^[a-f0-9]{64}$/u) }).strict(),
  ]),
  importThumbnail: z.tuple([z.object({ scope, sourcePath: path }).strict()]),
  startStudio: z.tuple([scope]),
  studioChanges: z.tuple([scope]),
  discardStudio: z.tuple([scope]),
  saveStudio: z.tuple([z.object({ scope, ...commit }).strict()]),
  renderVideo: z.tuple([scope]),
  saveScript: z.tuple([
    z.object({ scope, revision: text, content: text, guidance: text, selection }).strict(),
  ]),
  createClip: z.tuple([
    z
      .object({
        scope,
        name: id,
        ratio: z.enum(['9:16', '1:1']),
        start: z.number().min(0),
        end: z.number().positive(),
        prompt: text,
        selection,
      })
      .strict()
      .refine((value) => value.end > value.start),
  ]),
  updateLaunch: z.tuple([
    z
      .object({
        scope,
        launch: z
          .object({
            platform,
            status: z.enum(['not_started', 'uploading', 'uploaded', 'failed']),
            url: text,
            clipId: id.nullable(),
          })
          .strict(),
      })
      .strict(),
  ]),
  generateChapters: z.tuple([scope]),
  importFinishedClip: z.tuple([z.object({ scope, sourcePath: path }).strict()]),
  preparePublish: z.tuple([
    z
      .object({
        scope,
        platform,
        browser: id,
        packaging,
        clipId: id.nullable(),
        chapters: z
          .array(
            z.object({ seconds: z.number().int().min(0), title: z.string().trim().min(1).max(500) }).strict(),
          )
          .max(500)
          .optional(),
      })
      .strict(),
  ]),
  revealPath: z.tuple([path]),
  openExternal: z.tuple([
    z
      .string()
      .max(8192)
      .refine((value) => {
        try {
          externalUrl(value);
          return true;
        } catch {
          return false;
        }
      }),
  ]),
  copyImage: z.tuple([path]),
  mediaUrl: z.tuple([path]),
  assetWaveform: z.tuple([z.object({ scope, assetId: id }).strict()]),
});

/** IPC structured-clone data is plain and bounded before deep schema parsing. */
function validateEnvelope(input: unknown): void {
  let nodes = 0;
  let characters = 0;
  const inspect = (value: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > 20_000 || depth > 20) throw new AppFault({ id: 'desktopRequestTooLarge' });
    if (typeof value === 'string') {
      characters += value.length;
      if (characters > 8_000_000) throw new AppFault({ id: 'desktopRequestTooLarge' });
      return;
    }
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return;
    if (!value || typeof value !== 'object') throw new AppFault({ id: 'desktopRequestValueUnsupported' });
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      throw new AppFault({ id: 'desktopRequestObjectUnsupported' });
    for (const [key, nested] of Object.entries(value)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key))
        throw new AppFault({ id: 'desktopRequestKeyUnsafe' });
      inspect(nested, depth + 1);
    }
  };
  inspect(input, 0);
}

export function parseInvocation(method: unknown, args: unknown): { method: ApiMethod; args: unknown[] } {
  if (typeof method !== 'string' || !Object.hasOwn(validators, method))
    throw new AppFault({ id: 'unknownOperation' });
  validateEnvelope(args);
  const name = method as ApiMethod;
  const parsed = validators[name].safeParse(args);
  if (!parsed.success) throw new AppFault({ id: 'desktopArgumentsInvalid' }, parsed.error.message);
  if (!Array.isArray(parsed.data)) throw new AppFault({ id: 'desktopArgumentsInvalid' });
  return { method: name, args: parsed.data };
}

export function externalUrl(value: string): string {
  const url = desktopUrl(value, { id: 'desktopExternalUrlInvalid' });
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
    throw new AppFault({ id: 'desktopExternalUrlInvalid' });
  return url.toString();
}

export function rendererLocation(
  packaged: boolean,
  developmentUrl: string | undefined,
  fileUrl: string,
): string {
  if (packaged || !developmentUrl) return fileUrl;
  const url = desktopUrl(developmentUrl, { id: 'desktopRendererNotLoopback' });
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username ||
    url.password
  ) {
    throw new AppFault({ id: 'desktopRendererNotLoopback' });
  }
  return url.toString();
}

export function trustedSender(
  event: { sender: unknown; senderFrame: { url: string } | null },
  webContents: { mainFrame: unknown },
  expectedUrl: string,
): boolean {
  if (event.sender !== webContents || !event.senderFrame || event.senderFrame !== webContents.mainFrame)
    return false;
  try {
    const actual = new URL(event.senderFrame.url);
    const expected = new URL(expectedUrl);
    actual.hash = '';
    expected.hash = '';
    return actual.toString() === expected.toString();
  } catch {
    return false;
  }
}

const mediaExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.avif',
  '.bmp',
  '.tif',
  '.tiff',
  '.mp4',
  '.mov',
  '.webm',
  '.mkv',
  '.avi',
  '.m4v',
  '.mp3',
  '.wav',
  '.m4a',
  '.aac',
  '.ogg',
  '.flac',
  '.aiff',
]);
export function mediaRequestPath(value: string, method: string): string {
  const url = desktopUrl(value, { id: 'desktopMediaRequestUnsupported' });
  const requested = url.searchParams.get('path');
  const revision = url.searchParams.get('revision');
  if (
    !['GET', 'HEAD'].includes(method) ||
    url.protocol !== 'vandashi-media:' ||
    url.hostname !== 'local' ||
    url.pathname !== '/file' ||
    url.port ||
    url.username ||
    url.password ||
    (revision === null
      ? url.searchParams.size !== 1
      : url.searchParams.size !== 2 || !/^[a-f0-9]{64}$/.test(revision)) ||
    !requested ||
    !mediaExtensions.has(extname(requested).toLowerCase())
  ) {
    throw new AppFault({ id: 'desktopMediaRequestUnsupported' });
  }
  const parsed = path.safeParse(requested);
  if (!parsed.success) throw new AppFault({ id: 'desktopMediaRequestUnsupported' }, parsed.error.message);
  return parsed.data;
}

export { PathPermissions } from './path-permissions';
