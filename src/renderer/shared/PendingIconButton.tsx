import { LoaderCircle } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useApp } from '../app/store';
import { IconButton } from './ui';

export function PendingIconButton({
  label,
  children,
  action,
}: {
  label: string;
  children: ReactNode;
  action: () => Promise<void>;
}) {
  const { run } = useApp();
  const owner = useRef(false);
  const [pending, setPending] = useState(false);
  return (
    <IconButton
      label={label}
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        if (owner.current) return;
        owner.current = true;
        setPending(true);
        void run(action).finally(() => {
          owner.current = false;
          setPending(false);
        });
      }}
    >
      {pending ? <LoaderCircle className="spin" size={14} aria-hidden="true" /> : children}
    </IconButton>
  );
}
