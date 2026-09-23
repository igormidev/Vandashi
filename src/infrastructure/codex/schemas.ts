import { z } from 'zod';
import { AgentError } from '../../domain/agent';
import type { ModelInfo } from '../../domain/models';

export const record = z.record(z.string(), z.unknown());
export const itemSchema = z.object({ id: z.string(), type: z.string() }).catchall(z.unknown());
export const turnSchema = z.object({
  id: z.string(),
  status: z.string().optional(),
  items: z.array(itemSchema).default([]),
  error: z.object({ message: z.string() }).nullish(),
});
export const threadSchema = z.object({
  id: z.string(),
  turns: z.array(turnSchema).default([]),
  historyMode: z.string().optional(),
});
export const threadResponse = z.object({ thread: threadSchema });
export const turnResponse = z.object({ turn: turnSchema });
export const turnPage = z.object({ data: z.array(turnSchema), nextCursor: z.string().nullable() });
export const modelSchema = z.object({
  id: z.string(),
  model: z.string(),
  displayName: z.string(),
  description: z.string(),
  supportedReasoningEfforts: z.array(z.object({ reasoningEffort: z.string() })),
  defaultReasoningEffort: z.string(),
  isDefault: z.boolean(),
  serviceTiers: z.array(z.object({ id: z.string(), name: z.string() })).default([]),
  additionalSpeedTiers: z.array(z.string()).default([]),
  inputModalities: z.array(z.string()).default(['text']),
});
export const modelPage = z.object({ data: z.array(modelSchema), nextCursor: z.string().nullable() });
export type CodexModel = z.infer<typeof modelSchema>;
export type CodexItem = z.infer<typeof itemSchema>;
export function modelInfo(model: CodexModel): ModelInfo {
  return {
    id: model.model,
    name: model.displayName,
    description: model.description,
    reasoning: model.supportedReasoningEfforts.map((option) => option.reasoningEffort),
    defaultReasoning: model.defaultReasoningEffort,
    isDefault: model.isDefault,
    fast:
      model.serviceTiers.some((tier) => tier.id === 'priority') ||
      model.additionalSpeedTiers.includes('fast'),
  };
}
export function object(value: unknown): Record<string, unknown> {
  const parsed = record.safeParse(value);
  return parsed.success ? parsed.data : {};
}
export function string(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
export function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((part): part is string => typeof part === 'string') : [];
}
export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? z.array(z.unknown()).parse(value) : [];
}
export function missingHistory(error: unknown): never {
  if (
    error instanceof Error &&
    /thread.+not found|no rollout|not found.+thread|missing.+history|unknown thread/i.test(error.message)
  ) {
    throw new AgentError('missing-history', error.message);
  }
  throw error;
}
