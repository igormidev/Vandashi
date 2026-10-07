import { Download } from 'lucide-react';
import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../../shared/ui';
import { planMarkdownFilename } from './plan-export';

/** Browser download ownership keeps raw plan text out of filesystem IPC. */
export function PlanDownload({ text, title, disabled }: { text: string; title: string; disabled: boolean }) {
  const { t } = useTranslation();
  const link = useRef<HTMLAnchorElement>(null);
  const available = !disabled && !!text.trim();
  useLayoutEffect(() => {
    if (!available) return;
    const anchor = document.createElement('a');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
    anchor.href = url;
    anchor.download = planMarkdownFilename(title, t('planProposed'));
    anchor.hidden = true;
    document.body.append(anchor);
    link.current = anchor;
    return () => {
      link.current = null;
      anchor.remove();
      URL.revokeObjectURL(url);
    };
  }, [text, title, available, t]);
  const label = t('chatPlanDownload');
  return (
    <IconButton
      label={label}
      disabled={!available}
      onClick={() => {
        link.current?.click();
      }}
    >
      <Download size={13} aria-hidden="true" />
    </IconButton>
  );
}
