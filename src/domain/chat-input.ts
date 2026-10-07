import { AppFault } from './diagnostics';

/** Provider questions are transient turn state, never inferred from message prose. */
export interface AgentInputQuestion {
  id: string;
  header: string;
  question: string;
  isOther: boolean;
  isSecret: boolean;
  options: { label: string; description: string }[];
}
export interface AgentInputRequest {
  requestId: string;
  threadId: string;
  turnId: string;
  itemId: string;
  questions: AgentInputQuestion[];
}
export interface AgentInputResponse {
  requestId: string;
  threadId: string;
  turnId: string;
  answers: Record<string, string[]>;
}
export interface ChatInputRequest extends AgentInputRequest {
  sessionId: string;
}
export interface ChatInputResponse extends AgentInputResponse {
  sessionId: string;
}

/** Exact request identity and every question must match before sending any response. */
export function validateInputResponse(request: AgentInputRequest, response: AgentInputResponse): void {
  if (
    response.requestId !== request.requestId ||
    response.threadId !== request.threadId ||
    response.turnId !== request.turnId ||
    Object.keys(response.answers).length !== request.questions.length
  )
    throw new AppFault({ id: 'untrustedRequest' });
  for (const question of request.questions) {
    const answers = Object.hasOwn(response.answers, question.id) ? response.answers[question.id] : undefined;
    if (
      !answers ||
      answers.length !== 1 ||
      typeof answers[0] !== 'string' ||
      !answers[0].trim() ||
      answers[0].length > 20_000 ||
      (!question.isOther &&
        question.options.length > 0 &&
        !question.options.some((option) => option.label === answers[0]))
    )
      throw new AppFault({ id: 'untrustedRequest' });
  }
}
