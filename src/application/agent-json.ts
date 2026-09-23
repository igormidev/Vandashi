import { AppFault } from '../domain/diagnostics';
/** Accept strict JSON and a single JSON code fence, never silently pick an unrelated object. */
export function parseAgentJson(output: string): unknown {
  const trimmed = output.trim();
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/iu.exec(trimmed);
  try {
    return JSON.parse(fenced?.[1] ?? trimmed) as unknown;
  } catch {
    throw new AppFault({ id: 'appInvalidAgentJson' });
  }
}
