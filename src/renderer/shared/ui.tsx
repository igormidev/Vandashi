import * as Dialog from '@radix-ui/react-dialog';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Info, LoaderCircle, Sparkles, X } from 'lucide-react';
import { useId, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';

export function Tip({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <Tooltip.Root delayDuration={350}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip" sideOffset={8}>
          {label}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
export function IconButton({
  label,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <Tip label={label}>
      <button type="button" className="icon-button" aria-label={label} {...props}>
        {children}
      </button>
    </Tip>
  );
}
export function InfoTip({ text }: { text: string }) {
  return (
    <Tip
      label={
        <ReactMarkdown allowedElements={['p', 'strong', 'em', 'br']} unwrapDisallowed>
          {text}
        </ReactMarkdown>
      }
    >
      <button type="button" className="info-tip" aria-label={text.replace(/\*\*(.*?)\*\*/g, '$1')}>
        <Info size={14} />
      </button>
    </Tip>
  );
}
export function AiButton({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  const { t } = useTranslation();
  return (
    <IconButton label={t('askAi')} onClick={onClick} disabled={disabled}>
      <Sparkles size={16} />
    </IconButton>
  );
}
export function Modal({
  title,
  description,
  open,
  onClose,
  children,
  wide = false,
  locked = false,
}: {
  title: string;
  description?: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  locked?: boolean;
}) {
  const { t } = useTranslation();
  const descriptionId = useId();
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value && !locked) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-overlay" />
        <Dialog.Content
          className={`modal ${wide ? 'modal-wide' : ''}`}
          aria-describedby={description ? descriptionId : undefined}
        >
          <div className="modal-title">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="icon-button" aria-label={t('close')} disabled={locked}>
                <X size={18} />
              </button>
            </Dialog.Close>
          </div>
          {description && (
            <Dialog.Description id={descriptionId} className="muted">
              {description}
            </Dialog.Description>
          )}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
export function Empty({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {children}
    </div>
  );
}
export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={22} />
      <span>{label ?? t('loading')}</span>
    </div>
  );
}
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M3 5h8l5 11 5-11h8L16 29 3 5Z" fill="currentColor" />
      <path d="m16 5 4 8-4 8-4-8 4-8Z" fill="var(--bg)" />
    </svg>
  );
}
