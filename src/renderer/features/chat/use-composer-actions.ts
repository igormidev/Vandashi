import { useEffect } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { registerComposerActions, type ComposerAction } from './composer-actions';
import type { Draft } from './session-state';

export function useComposerActions(options: {
  sessionId: string;
  locked: boolean;
  draft: Draft;
  attachments: string[];
  owner: RefObject<boolean>;
  setDraft: Dispatch<SetStateAction<Draft>>;
  setMode: (mode: 'read' | 'edit') => void;
  setCollaboration: (mode: 'default' | 'plan') => void;
  restoreAttachments: (paths: string[]) => void;
  setSending: (sending: boolean) => void;
  setFocusKey: Dispatch<SetStateAction<number>>;
  submit: (action: ComposerAction) => Promise<void>;
}) {
  useEffect(() => {
    const available = (replace: boolean) =>
      !options.locked &&
      !options.draft.pending &&
      !options.owner.current &&
      (!replace || (!options.draft.text.trim() && !options.attachments.length));
    const adopt = (action: ComposerAction) => {
      options.setDraft((current) => {
        const next: Draft = {
          ...current,
          text: action.replace ? action.text : `${current.text}${current.text ? '\n\n' : ''}${action.text}`,
        };
        if (action.replace) {
          delete next.handoff;
          next.pending = null;
          if (action.handoff) {
            next.handoff = action.handoff;
            next.seed = action.text;
          }
        }
        return next;
      });
      if (action.mode) options.setMode(action.mode);
      if (action.collaboration) options.setCollaboration(action.collaboration);
      if (action.attachments) options.restoreAttachments(action.attachments);
      options.setFocusKey((current) => current + 1);
    };
    return registerComposerActions(options.sessionId, {
      insert: (action) => {
        if (!available(action.replace === true)) return false;
        adopt(action);
        if (action.submit) void options.submit(action);
        return true;
      },
      restore: async (prepare) => {
        if (!available(true)) return false;
        options.owner.current = true;
        options.setSending(true);
        try {
          adopt({ ...(await prepare()), replace: true });
          return true;
        } finally {
          options.owner.current = false;
          options.setSending(false);
        }
      },
    });
  }, [options]);
}
