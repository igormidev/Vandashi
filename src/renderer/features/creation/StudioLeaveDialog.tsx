import { Folder } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { FileChange } from '../../../domain/models';
import { useApp } from '../../app/store';
import { Modal } from '../../shared/ui';
import { DiffFiles } from '../history/DiffFiles';

export function StudioLeaveDialog({
  open,
  files,
  onClose,
  onDiscard,
  onSave,
}: {
  open: boolean;
  files: FileChange[];
  onClose: () => void;
  onDiscard: () => Promise<void>;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const { run } = useApp();
  const [discarding, setDiscarding] = useState(false);
  return (
    <Modal
      title={t('studioLeave')}
      description={t('studioLeaveHelp')}
      open={open}
      onClose={onClose}
      locked={discarding}
      wide
    >
      <DiffFiles files={files} />
      <div className="modal-actions">
        <button className="button" type="button" disabled={discarding} onClick={onClose}>
          {t('cancel')}
        </button>
        <button
          className="button danger"
          type="button"
          disabled={discarding}
          onClick={() => {
            setDiscarding(true);
            void run(async () => {
              try {
                await onDiscard();
              } finally {
                setDiscarding(false);
              }
            });
          }}
        >
          {t(discarding ? 'loading' : 'discard')}
        </button>
        <button className="button primary" type="button" disabled={discarding} onClick={onSave}>
          <Folder size={14} />
          {t('save')}
        </button>
      </div>
    </Modal>
  );
}
