import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatSession, Scope } from '../../../domain/models';
import { useApp } from '../../app/store';
import { applyMessage, mergeSession, selectedSession } from './session-state';
import { openConversation } from './open-conversation';
import { scopeKey } from '../../../domain/defaults';
import { cachedSelection, cacheSelection } from './draft-cache';

export function useSessions(scope: Scope) {
  const { api, run, chatTarget, busy } = useApp();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selected, setSelected] = useState<string | null>(() => cachedSelection(scopeKey(scope)));
  const [loading, setLoading] = useState(true);
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  const [mediaGeneration, setMediaGeneration] = useState<Record<string, number>>({});
  const mediaHydrated = useCallback((id: string) => {
    setMediaGeneration((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
  }, []);
  useEffect(() => {
    cacheSelection(scopeKey(scope), selected);
  }, [scope, selected]);
  const opened = useRef(new Set<string>());
  const targetOpened = useRef<typeof chatTarget>(null);
  const hydrationAttempts = useRef(new Set<string>());
  const idleGeneration = useRef(0);
  const [hydrationRetry, setHydrationRetry] = useState(0);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const generation = useRef(0);
  const pending = useRef(new Map<string, ChatSession['messages']>());
  const refresh = useCallback(
    async (authoritative = false) => {
      if (!authoritative) hydrationAttempts.current.clear();
      const ticket = ++generation.current;
      try {
        const result = await api.sessions(scope);
        if (ticket !== generation.current) return;
        setSessions((current) => {
          const updated = result.map((session) => {
            if (authoritative) return session;
            const existing = current.find((entry) => entry.id === session.id);
            return mergeSession(session, {
              ...(existing ?? session),
              messages: pending.current.get(session.id) ?? existing?.messages ?? [],
            });
          });
          return authoritative
            ? updated
            : [...updated, ...current.filter((session) => !result.some((entry) => entry.id === session.id))];
        });
        if (authoritative) pending.current.clear();
        setSelected((current) =>
          current && !authoritative && opened.current.has(current)
            ? current
            : selectedSession(result, current),
        );
        setFailed(false);
      } catch (error) {
        if (ticket === generation.current) setFailed(true);
        throw error;
      } finally {
        if (ticket === generation.current) setLoading(false);
      }
    },
    [api, scope],
  );
  useEffect(() => {
    void run(() => refresh());
    return () => {
      generation.current++;
    };
  }, [refresh, run]);
  useEffect(() => {
    if (!chatTarget) {
      setOpening(false);
      return;
    }
    let disposed = false;
    setOpening(true);
    void run(async () => {
      try {
        const result = await openConversation(api, {
          scope,
          topic: chatTarget.topic,
          title: chatTarget.title,
        });
        if (disposed) return;
        targetOpened.current = chatTarget;
        setSessions((current) => {
          const existing = current.find((entry) => entry.id === result.id);
          const updated = mergeSession(result, {
            ...(existing ?? result),
            messages: pending.current.get(result.id) ?? existing?.messages ?? [],
          });
          return [updated, ...current.filter((entry) => entry.id !== result.id)];
        });
        if (result.historyDeferred) {
          opened.current.delete(result.id);
          hydrationAttempts.current.delete(result.id);
        } else {
          opened.current.add(result.id);
          mediaHydrated(result.id);
        }
        setSelected(result.id);
        setFailed(false);
        setLoading(false);
      } catch (error) {
        if (disposed) return;
        setFailed(true);
        setLoading(false);
        throw error;
      } finally {
        if (!disposed) setOpening(false);
      }
    });
    return () => {
      disposed = true;
    };
  }, [api, chatTarget, mediaHydrated, run, scope]);
  useEffect(() => {
    if (
      (chatTarget && targetOpened.current !== chatTarget) ||
      busy ||
      !selected ||
      opened.current.has(selected) ||
      hydrationAttempts.current.has(selected)
    )
      return;
    const session = sessions.find((entry) => entry.id === selected && entry.open);
    if (!session) return;
    hydrationAttempts.current.add(session.id);
    const idleAtStart = idleGeneration.current;
    void run(async () => {
      try {
        const result = await openConversation(api, { scope, topic: session.topic, title: session.title });
        if (!mounted.current) return;
        if (result.historyDeferred) {
          // The operation's idle event retries this read. Updating sessions here would
          // create an immediate request loop before that event reaches the renderer.
          hydrationAttempts.current.delete(result.id);
          if (idleGeneration.current !== idleAtStart) setHydrationRetry((value) => value + 1);
          return;
        }
        opened.current.add(result.id);
        mediaHydrated(result.id);
        setSessions((current) =>
          current.map((entry) =>
            entry.id === result.id && entry.open
              ? mergeSession(result, { ...entry, messages: pending.current.get(entry.id) ?? entry.messages })
              : entry,
          ),
        );
        // Hydration never selects a tab: a late response must not steal the user's current conversation.
        setFailed(false);
      } catch (error) {
        if (mounted.current) setFailed(true);
        throw error;
      }
    });
  }, [api, busy, chatTarget, hydrationRetry, mediaHydrated, run, scope, selected, sessions]);
  useEffect(
    () =>
      api.onEvent((event) => {
        if (event.type === 'chat') {
          pending.current.set(
            event.sessionId,
            applyMessage(pending.current.get(event.sessionId) ?? [], event),
          );
          setSessions((current) =>
            current.map((session) =>
              session.id === event.sessionId
                ? { ...session, messages: applyMessage(session.messages, event) }
                : session,
            ),
          );
        }
        if (event.type === 'activity' && ['done', 'error'].includes(event.activity.phase)) {
          idleGeneration.current++;
          void run(() => refresh(true));
        }
      }),
    [api, refresh, run],
  );
  const replace = (result: ChatSession) => {
    generation.current++;
    pending.current.delete(result.id);
    setSessions((current) => current.map((session) => (session.id === result.id ? result : session)));
  };
  const close = async (id: string) => {
    await api.closeChat(id);
    opened.current.delete(id);
    generation.current++;
    pending.current.delete(id);
    setSessions((current) =>
      current.map((session) => (session.id === id ? { ...session, open: false } : session)),
    );
    setSelected((current) =>
      current === id ? (sessions.find((session) => session.id !== id && session.open)?.id ?? null) : current,
    );
  };
  return {
    sessions,
    selected,
    setSelected,
    loading,
    opening,
    failed,
    refresh,
    replace,
    close,
    mediaGeneration,
  };
}
