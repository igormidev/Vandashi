import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, PendingLabel } from '../../shared/ui';

export function HistoryEditDialog({
  onConfirm,
  onClose,
  refreshPending = false,
}: {
  onConfirm: () => Promise<boolean>;
  onClose: () => void;
  refreshPending?: boolean;
}) {
  const { t } = useTranslation();
  const owner = useRef(false);
  const [pending, setPending] = useState(false);
  return (
    <Modal open title={t('chatEditFromHere')} onClose={onClose} locked={pending || refreshPending}>
      <p>{t('chatRewindConfirm')}</p>
      <div className="dialog-actions">
        <button type="button" className="button ghost" disabled={pending || refreshPending} onClick={onClose}>
          {t('cancel')}
        </button>
        <button
          type="button"
          className="button"
          disabled={pending}
          aria-busy={pending}
          onClick={() => {
            if (owner.current) return;
            owner.current = true;
            setPending(true);
            void onConfirm()
              .then((restored) => {
                if (restored) onClose();
              })
              .finally(() => {
                owner.current = false;
                setPending(false);
              });
          }}
        >
          {pending ? <PendingLabel label={t('loading')} /> : t(refreshPending ? 'retry' : 'chatEditFromHere')}
        </button>
      </div>
    </Modal>
  );
}
