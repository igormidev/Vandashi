import { useRef } from 'react';
import type { ChatMessage } from '../../../domain/models';

export function sentPrompts(messages: ChatMessage[]): string[] {
  return messages
    .filter((message) => message.role === 'user' && !message.pending)
    .map((message) => message.userText ?? message.text)
    .filter((text) => !!text.trim())
    .reverse();
}

/** Recall starts only from an empty draft; Down returns to that exact draft. */
export function useComposerHistory(text: string, messages: ChatMessage[], adopt: (text: string) => void) {
  const recalled = useRef<{ index: number; text: string; original: string } | null>(null);
  return (direction: 'older' | 'newer'): boolean => {
    const current = recalled.current?.text === text ? recalled.current : null;
    if (!current && text.trim()) return false;
    const prompts = sentPrompts(messages);
    const index = (current?.index ?? -1) + (direction === 'older' ? 1 : -1);
    if (index < -1 || index >= prompts.length || (!current && direction === 'newer')) return false;
    const original = current?.original ?? text;
    const next = index < 0 ? original : prompts[index];
    if (next === undefined) return false;
    recalled.current = index < 0 ? null : { index, text: next, original };
    adopt(next);
    return true;
  };
}
