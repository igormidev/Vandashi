import { useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

export function ExpandableText({ text }: { text: string }) {
  const { t } = useTranslation();
  const paragraph = useRef<HTMLParagraphElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflow, setOverflow] = useState(false);
  useLayoutEffect(() => {
    const element = paragraph.current;
    if (!element || expanded) return;
    const measure = () => {
      setOverflow(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [text, expanded]);
  return (
    <>
      <p ref={paragraph} className={expanded ? 'expandable-text' : 'expandable-text clamp'}>
        {text}
      </p>
      {(overflow || expanded) && (
        <button
          className="button ghost small"
          type="button"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded(!expanded);
          }}
        >
          {t(expanded ? 'less' : 'more')}
        </button>
      )}
    </>
  );
}
