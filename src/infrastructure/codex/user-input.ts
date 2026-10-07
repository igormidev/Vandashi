import { z } from 'zod';
import type { AgentInputRequest } from '../../domain/chat-input';

const id = z.string().min(1).max(500);
const safeQuestionId = id.refine((value) => !['__proto__', 'prototype', 'constructor'].includes(value));
const text = z.string().max(20_000);
const question = z.object({
  id: safeQuestionId,
  header: text,
  question: text.min(1),
  isOther: z.boolean().default(false),
  isSecret: z.boolean().default(false),
  options: z
    .array(z.object({ label: text.min(1), description: text }))
    .max(20)
    .nullish()
    .transform((value) => value ?? []),
});
const input = z.object({
  threadId: id,
  turnId: id,
  itemId: id,
  questions: z.array(question).min(1).max(10),
});

export function parseUserInput(params: unknown, requestId: string): AgentInputRequest | null {
  const parsed = input.safeParse(params);
  if (!parsed.success) return null;
  const questions = parsed.data.questions;
  if (new Set(questions.map((entry) => entry.id)).size !== questions.length) return null;
  if (
    questions.some(
      (entry) => new Set(entry.options.map((option) => option.label)).size !== entry.options.length,
    )
  )
    return null;
  return { requestId, ...parsed.data };
}
