import { clipHandoffSchema } from './clip-handoff-schema';
import { z } from 'zod';

export function interactionValidators(
  scope: z.ZodType,
  selection: z.ZodType,
  id: z.ZodString,
  path: z.ZodType,
  text: z.ZodString,
) {
  const chatRequest = z.tuple([
    z
      .object({
        sessionId: id,
        clientMessageId: z.uuid().optional(),
        text: text.min(1),
        mode: z.enum(['read', 'edit']),
        selection,
        attachments: z.array(path).max(50),
        handoff: clipHandoffSchema.optional(),
      })
      .strict(),
  ]);
  return {
    ensurePresets: z.tuple([scope]),
    savePreset: z.tuple([
      z
        .object({
          scope,
          presetId: id,
          revision: id,
          content: text,
          commit: z.object({ title: text.min(1), body: text.min(1) }).strict(),
        })
        .strict(),
    ]),
    installedBrowsers: z.tuple([]),
    storePastedImage: z.tuple([
      z
        .string()
        .min(1)
        .max(5_400_000)
        .regex(/^[A-Za-z0-9+/]+={0,2}$/u),
    ]),
    filePreview: z.tuple([path]),
    sendChat: chatRequest,
    queueChat: chatRequest,
    queuedChats: z.tuple([id]),
    removeQueuedChat: z.tuple([z.object({ sessionId: id, id: z.uuid() }).strict()]),
  };
}
