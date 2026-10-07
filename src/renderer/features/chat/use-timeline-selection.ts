import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/** One listener per visible timeline; a quote never borrows selection from another row. */
export function useTimelineSelection(timeline: RefObject<HTMLDivElement | null>) {
  const [selection, setSelection] = useState<{ id: string; text: string } | null>(null);
  useEffect(() => {
    const changed = () => {
      const selected = window.getSelection();
      const anchor = selected?.anchorNode;
      const focus = selected?.focusNode;
      const element = anchor instanceof Element ? anchor : anchor?.parentElement;
      const body = element?.closest('.message-body');
      const message = body?.closest<HTMLElement>('[data-message-id]');
      const id = message?.dataset.messageId;
      const text = selected?.toString().trim();
      const next =
        id && text && body && focus && body.contains(focus) && timeline.current?.contains(message)
          ? { id, text }
          : null;
      setSelection((current) => (current?.id === next?.id && current?.text === next?.text ? current : next));
    };
    document.addEventListener('selectionchange', changed);
    return () => {
      document.removeEventListener('selectionchange', changed);
    };
  }, [timeline]);
  return selection;
}
