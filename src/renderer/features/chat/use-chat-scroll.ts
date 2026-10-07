import { useCallback, useLayoutEffect, useRef, useState } from 'react';

interface ReadingPosition {
  top: number;
  follow: boolean;
  anchor?: { id: string; offset: number };
}

function rows(node: HTMLElement): HTMLElement[] {
  return [...node.querySelectorAll<HTMLElement>('[data-chat-row-id]')];
}

function readingPosition(node: HTMLElement): ReadingPosition {
  const top = node.getBoundingClientRect().top + node.clientTop;
  const row = rows(node).find((entry) => entry.getBoundingClientRect().bottom > top);
  const id = row?.dataset.chatRowId;
  return {
    top: node.scrollTop,
    follow: node.scrollHeight - node.scrollTop - node.clientHeight < 48,
    ...(row && id ? { anchor: { id, offset: row.getBoundingClientRect().top - top } } : {}),
  };
}

function restorePosition(node: HTMLElement, position: ReadingPosition) {
  const row = position.anchor && rows(node).find((entry) => entry.dataset.chatRowId === position.anchor?.id);
  if (row && position.anchor) {
    const offset = row.getBoundingClientRect().top - node.getBoundingClientRect().top - node.clientTop;
    node.scrollTop += offset - position.anchor.offset;
  } else node.scrollTop = position.top;
}

/** Retain observed row anchors, never measure an old session after its rows were replaced. */
export function useChatScroll(sessionId: string | undefined) {
  const pane = useRef<HTMLElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, ReadingPosition>());
  const selected = useRef<string | undefined>(sessionId);
  const following = useRef(true);
  const [away, setAway] = useState(false);
  const paneRef = useCallback((node: HTMLElement | null) => {
    pane.current = node;
  }, []);
  const scrollRef = useCallback((node: HTMLDivElement | null) => {
    scroll.current = node;
  }, []);
  const contentRef = useCallback((node: HTMLDivElement | null) => {
    content.current = node;
  }, []);
  const composerRef = useCallback((node: HTMLDivElement | null) => {
    composer.current = node;
  }, []);
  const remember = useCallback(() => {
    const node = scroll.current;
    const id = selected.current;
    if (!node || !id) return;
    const position = readingPosition(node);
    following.current = position.follow;
    positions.current.set(id, position);
    setAway(!position.follow);
  }, []);
  const toEnd = useCallback(() => {
    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    following.current = true;
    remember();
    setAway(false);
  }, [remember]);
  const currentRow = useCallback((): string | null => {
    return scroll.current ? (readingPosition(scroll.current).anchor?.id ?? null) : null;
  }, []);
  const toMessage = useCallback((messageId: string): boolean => {
    const node = scroll.current;
    const target =
      content.current &&
      [...content.current.querySelectorAll<HTMLElement>('[data-message-id]')].find(
        (entry) => entry.dataset.messageId === messageId,
      );
    if (!node || !target) return false;
    following.current = false;
    setAway(true);
    const top =
      node.scrollTop +
      target.getBoundingClientRect().top -
      node.getBoundingClientRect().top -
      node.clientTop -
      12;
    node.scrollTo({
      top,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    });
    return true;
  }, []);
  useLayoutEffect(() => {
    selected.current = sessionId;
    const node = scroll.current;
    const body = content.current;
    const input = composer.current;
    const container = pane.current;
    if (!node || !body || !input || !container || !sessionId) return;
    const saved = positions.current.get(sessionId);
    following.current = saved?.follow ?? true;
    const resize = () => {
      container.style.setProperty('--composer-height', `${String(input.getBoundingClientRect().height)}px`);
      if (following.current) node.scrollTop = node.scrollHeight;
      else {
        const position = positions.current.get(sessionId);
        if (position) restorePosition(node, position);
      }
      remember();
    };
    container.style.setProperty('--composer-height', `${String(input.getBoundingClientRect().height)}px`);
    if (saved && !saved.follow) restorePosition(node, saved);
    else node.scrollTop = node.scrollHeight;
    remember();
    const observer = new ResizeObserver(resize);
    observer.observe(body);
    observer.observe(input);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [sessionId, remember]);
  return {
    paneRef,
    scrollRef,
    contentRef,
    composerRef,
    onScroll: remember,
    toEnd,
    toMessage,
    currentRow,
    away,
  };
}
