import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, ChatSession, Scope } from '../../../domain/models';
import { useApp } from '../../app/store';
import { messageText } from '../../app/diagnostics';
import { clipHandoffText } from '../../../domain/clip-handoff';
import { restoreComposerDraft } from './composer-actions';
import { AppFault } from '../../../domain/diagnostics';

export function useHistoryActions(
  session: ChatSession | undefined,
  replace: (session: ChatSession) => void,
  select: (id: string) => void,
) {
  const { api, run, reload, beginNavigation, setChatTarget, setToast } = useApp();
  const [target, setTarget] = useState<ChatMessage | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [refreshPending, setRefreshPending] = useState(false);
  const owner = useRef(false);
  const receipt = useRef<{ scope: Scope; release: () => void } | null>(null);
  useEffect(
    () => () => {
      receipt.current?.release();
    },
    [],
  );
  const confirm = async (): Promise<boolean> => {
    if (!session || !target) return false;
    const result = await run(async () => {
      if (!receipt.current) {
        const restored = await restoreComposerDraft(session.id, async () => {
          const navigation = beginNavigation();
          if (!navigation) throw new AppFault({ id: 'appOperationBusy' });
          try {
            const saved = await api.rewindChat({ sessionId: session.id, messageId: target.id });
            replace(saved.session);
            receipt.current = { scope: saved.session.scope, release: navigation.release };
            setRefreshPending(true);
            return {
              ...saved.draft,
              text: saved.draft.handoff
                ? clipHandoffText(saved.draft.handoff, messageText)
                : saved.draft.text,
            };
          } catch (error) {
            navigation.release();
            throw error;
          }
        });
        if (!restored) {
          setToast({ kind: 'interface', key: 'chatDraftOccupied' });
          return false;
        }
      }
      const saved = receipt.current;
      if (!saved) return false;
      // The exact restored draft is already adopted. A failed refresh retries only
      // this read and keeps every editing/navigation consumer locked.
      await reload(saved.scope);
      saved.release();
      receipt.current = null;
      setRefreshPending(false);
      return true;
    });
    return result === true;
  };
  const fork = (message: ChatMessage) => {
    if (!session || owner.current) return;
    owner.current = true;
    setPendingId(message.id);
    void run(async () => {
      const saved = await api.forkChat({ sessionId: session.id, messageId: message.id });
      replace(saved);
      setChatTarget(null);
      select(saved.id);
    }).finally(() => {
      owner.current = false;
      setPendingId(null);
    });
  };
  return {
    target,
    setTarget,
    pendingId,
    refreshPending,
    confirm,
    fork,
    close: () => {
      if (!receipt.current) setTarget(null);
    },
  };
}
