import { Check, Copy, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { IconButton } from '../../shared/ui';

export function MessageCopyButton({
  text,
  onPendingChange,
}: {
  text: string;
  onPendingChange?: (pending: boolean) => void;
}) {
  const { t } = useTranslation();
  const { run } = useApp();
  const [pending, setPending] = useState(false);
  const owned = useRef(false);
  const [copied, setCopied] = useState<{ text: string } | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopied(null);
    }, 1800);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);
  return (
    <IconButton
      label={t(copied?.text === text ? 'copied' : 'copy')}
      disabled={pending}
      aria-busy={pending}
      className="icon-button message-copy"
      onClick={() => {
        if (owned.current) return;
        owned.current = true;
        setPending(true);
        onPendingChange?.(true);
        void run(async () => {
          await navigator.clipboard.writeText(text);
          return true;
        }).then((success) => {
          setCopied(success === true ? { text } : null);
          setPending(false);
          owned.current = false;
          onPendingChange?.(false);
        });
      }}
    >
      {pending ? (
        <LoaderCircle size={13} className="spin" />
      ) : copied?.text === text ? (
        <Check size={13} />
      ) : (
        <Copy size={13} />
      )}
    </IconButton>
  );
}
