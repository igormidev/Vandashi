import { Check, Copy, LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { IconButton } from '../../shared/ui';

export function MessageCopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const { run } = useApp();
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => {
      setCopied(false);
    }, 1800);
    return () => {
      clearTimeout(timer);
    };
  }, [copied]);
  return (
    <IconButton
      label={t(copied ? 'copied' : 'copy')}
      disabled={pending}
      aria-busy={pending}
      className="icon-button message-copy"
      onClick={() => {
        if (pending) return;
        setPending(true);
        void run(async () => {
          await navigator.clipboard.writeText(text);
          return true;
        }).then((success) => {
          setCopied(success === true);
          setPending(false);
        });
      }}
    >
      {pending ? (
        <LoaderCircle size={13} className="spin" />
      ) : copied ? (
        <Check size={13} />
      ) : (
        <Copy size={13} />
      )}
    </IconButton>
  );
}
