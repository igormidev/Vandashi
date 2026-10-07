import type { RefObject } from 'react';
import type { ChatRequest, ModelSelection } from '../../../domain/models';
import { useApp } from '../../app/store';
import type { Draft } from './session-state';
import type { ComposerAction } from './composer-actions';

export function useComposerSubmit(options: {
  sessionId: string;
  draft: Draft;
  locked: boolean;
  queueable: boolean;
  plan: boolean;
  mode: 'read' | 'edit';
  selection: ModelSelection;
  attachments: string[];
  owner: RefObject<boolean>;
  setSending: (value: boolean) => void;
  clearText: () => void;
  clearAttachments: () => void;
}) {
  const { api, run, models } = useApp();
  return async (action?: ComposerAction): Promise<void> => {
    const text = action?.text ?? options.draft.text;
    if (!text.trim() || options.draft.pending || options.locked || options.owner.current || !models.length)
      return;
    options.owner.current = true;
    options.setSending(true);
    try {
      const value = await run(async () => {
        const request: ChatRequest = {
          clientMessageId: crypto.randomUUID(),
          sessionId: options.sessionId,
          text: text.trim(),
          mode: action?.mode ?? (options.plan ? 'read' : options.mode),
          collaboration: action?.collaboration ?? (options.plan ? 'plan' : 'default'),
          selection: options.selection,
          attachments: action?.attachments ?? (action ? [] : options.attachments),
          ...(!action && options.draft.handoff && text === options.draft.seed
            ? { handoff: options.draft.handoff }
            : {}),
        };
        if (options.queueable) await api.queueChat(request);
        else await api.sendChat(request);
        return true;
      });
      if (value) {
        options.clearText();
        options.clearAttachments();
      }
    } finally {
      options.owner.current = false;
      options.setSending(false);
    }
  };
}
