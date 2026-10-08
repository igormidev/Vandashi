import { z } from 'zod';
import { defaultSettings, platforms } from '../../domain/defaults';
import { parseAppMessage, parseDiagnostic } from '../../domain/diagnostics';
import type { Diagnostic } from '../../domain/diagnostics';
import type { AppMessage } from '../../domain/messages';
import { supportedLocales } from '../../domain/locales';
import { transcriptionModels } from '../../domain/transcription';

export const scopeSchema = z.object({
  brandId: z.string().min(1),
  videoId: z.string().nullable(),
  clipId: z.string().nullable(),
});
const strings = z.array(z.string());
const formats = <T extends z.ZodType>(schema: T) => z.object({ long: schema, short: schema });
export const packagingSchema = z
  .object({
    titles: formats(strings),
    descriptions: formats(z.string()),
    tags: formats(strings),
    thumbnails: strings,
    theme: z.string(),
  })
  .strict();
export const brandConfigSchema = z
  .object({
    name: z.string().trim().min(3),
    description: z.string(),
    image: z.string(),
    platforms: z.partialRecord(z.enum(platforms), z.object({ url: z.string(), browser: z.string() })),
  })
  .strict();
const selectionSchema = z.object({
  model: z.string().min(1),
  reasoning: z.string().min(1),
  fast: z.boolean(),
});
export const settingsSchema = z.object({
  locale: z.enum(supportedLocales),
  chat: selectionSchema,
  automation: selectionSchema,
  scriptSync: selectionSchema,
  splits: z.record(z.string(), z.number().min(25).max(75)),
  assetMetadata: selectionSchema.default(defaultSettings.assetMetadata),
  chapters: selectionSchema.default(defaultSettings.chapters),
  transcriptionModel: z.enum(transcriptionModels).default('large-v3-turbo'),
});
const brandSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  lastOpened: z.string(),
});
export const registrySchema = z.object({
  brands: z.array(brandSummarySchema),
  lastBrandId: z.string().nullable(),
  settings: settingsSchema,
});
export const videoRecordSchema = z.object({
  id: z.string().min(1),
  brandId: z.string().min(1),
  name: z.string().min(1),
  ratio: z.enum(['16:9', '9:16', '1:1']),
  origin: z.enum(['composition', 'imported']).default('composition'),
  updatedAt: z.string(),
  renderedPath: z.string().nullable(),
  renderedRevision: z.string().optional(),
  parentVideoId: z.string().optional(),
  start: z.number().nonnegative().optional(),
  end: z.number().positive().optional(),
});
export type VideoRecord = z.infer<typeof videoRecordSchema>;
export const launchSchema = z.object({
  platform: z.enum(platforms),
  status: z.enum(['not_started', 'uploading', 'uploaded', 'failed']),
  url: z.string(),
  clipId: z.string().nullable(),
});
export const launchesSchema = z.array(launchSchema);
export const metadataSchema = z.object({
  title: z.string(),
  description: z.string(),
  tags: strings,
  hash: z.string(),
  contentHash: z.string().optional(),
  metadataStorage: z.enum(['embedded', 'sidecar']).optional(),
  embeddingWarning: z.string().nullable().optional(),
  embeddingDiagnostic: z.custom<Diagnostic>((value) => parseDiagnostic(value) !== null).optional(),
  preserveBytes: z.boolean().optional(),
  // Invalid analysis is repairable; it must not prevent listing the source media.
  analysis: z.unknown().optional(),
  analysisContentHash: z.string().optional(),
});
const fileChangeSchema = z.object({
  path: z.string(),
  additions: z.number(),
  deletions: z.number(),
  diff: z.string(),
});
const messageSchema = z
  .object({
    phase: z.enum(['commentary', 'final_answer']).optional(),
    proposedPlan: z.boolean().optional(),
    timestampKnown: z.boolean().optional(),
    turnDurationMs: z.number().int().nonnegative().optional(),
    activity: z
      .object({
        kind: z.enum([
          'command',
          'read',
          'search',
          'file-change',
          'mcp',
          'dynamic',
          'browser',
          'web-search',
          'image-generation',
          'agent',
          'plan',
          'compaction',
          'review',
        ]),
        status: z.enum(['inProgress', 'completed', 'failed', 'declined', 'interrupted']),
        title: z.string().optional(),
        detail: z
          .string()
          .max(64 * 1024)
          .optional(),
        command: z.string().optional(),
        cwd: z.string().optional(),
        exitCode: z.number().optional(),
        durationMs: z.number().nonnegative().optional(),
        startedAt: z.string().optional(),
        completedAt: z.string().optional(),
        agents: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              status: z.enum(['pending', 'inProgress', 'completed', 'failed', 'declined', 'interrupted']),
              result: z.string().max(64 * 1024),
            }),
          )
          .optional(),
        steps: z
          .array(z.object({ text: z.string(), status: z.enum(['pending', 'inProgress', 'completed']) }))
          .optional(),
      })
      .transform(
        ({
          title,
          detail,
          command,
          cwd,
          exitCode,
          durationMs,
          startedAt,
          completedAt,
          steps,
          agents,
          ...activity
        }) => ({
          ...activity,
          ...(title === undefined ? {} : { title }),
          ...(detail === undefined ? {} : { detail }),
          ...(command === undefined ? {} : { command }),
          ...(cwd === undefined ? {} : { cwd }),
          ...(exitCode === undefined ? {} : { exitCode }),
          ...(durationMs === undefined ? {} : { durationMs }),
          ...(startedAt === undefined ? {} : { startedAt }),
          ...(completedAt === undefined ? {} : { completedAt }),
          ...(steps === undefined ? {} : { steps }),
          ...(agents === undefined ? {} : { agents }),
        }),
      )
      .optional(),
    attachments: z.array(z.string()).max(50).optional(),
    id: z.string(),
    role: z.enum(['user', 'assistant', 'reasoning', 'tool', 'error']),
    text: z.string(),
    turnId: z.string().nullable(),
    files: z.array(fileChangeSchema),
    createdAt: z.string(),
    appMessage: z.custom<AppMessage>((value) => parseAppMessage(value) !== null).optional(),
    userText: z.string().optional(),
    diagnostic: z.custom<Diagnostic>((value) => parseDiagnostic(value) !== null).optional(),
    generatedImages: z.array(z.string()).max(20).optional(),
  })
  .transform(
    ({
      appMessage,
      userText,
      diagnostic,
      generatedImages,
      attachments,
      activity,
      phase,
      proposedPlan,
      timestampKnown,
      turnDurationMs,
      ...message
    }) => ({
      ...message,
      ...(appMessage === undefined ? {} : { appMessage }),
      ...(userText === undefined ? {} : { userText }),
      ...(diagnostic === undefined ? {} : { diagnostic }),
      ...(generatedImages === undefined ? {} : { generatedImages }),
      ...(attachments === undefined ? {} : { attachments }),
      ...(activity === undefined ? {} : { activity }),
      ...(phase === undefined ? {} : { phase }),
      ...(proposedPlan === undefined ? {} : { proposedPlan }),
      ...(timestampKnown === undefined ? {} : { timestampKnown }),
      ...(turnDurationMs === undefined ? {} : { turnDurationMs }),
    }),
  );
const checkpointSchema = z
  .object({
    turnId: z.string(),
    threadId: z.string(),
    mode: z.enum(['read', 'edit']).optional(),
    collaboration: z.enum(['default', 'plan']).optional(),
    heads: z.record(z.string(), z.string()),
    messageCount: z.number().int().nonnegative(),
    postHeads: z.record(z.string(), z.string()).optional(),
  })
  .transform(({ postHeads, mode, collaboration, ...checkpoint }) => ({
    ...checkpoint,
    ...(mode === undefined ? {} : { mode }),
    ...(collaboration === undefined ? {} : { collaboration }),
    ...(postHeads === undefined ? {} : { postHeads }),
  }));
export const sessionSchema = z
  .object({
    branch: z.object({ parentId: z.string().min(1), messageId: z.string().min(1) }).optional(),
    id: z.string(),
    scope: scopeSchema,
    topic: z.string(),
    title: z.string(),
    threadId: z.string().nullable(),
    messages: z.array(messageSchema),
    open: z.boolean(),
    updatedAt: z.string(),
    checkpoints: z.array(checkpointSchema).default([]),
  })
  .transform(({ branch, ...session }) => ({ ...session, ...(branch ? { branch } : {}) }));
