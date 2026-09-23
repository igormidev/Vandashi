import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Workspace } from '../../../domain/models';
import { useApp } from '../../app/store';
import { Modal, PendingLabel } from '../../shared/ui';

export function ImportVideoDialog({
  brandId,
  onClose,
  onOpen,
}: {
  brandId: string;
  onClose: () => void;
  onOpen: (workspace: Workspace, destination?: 'packaging' | 'launch') => void;
}) {
  const { t } = useTranslation();
  const { api, run } = useApp();
  const [name, setName] = useState('');
  const [sourcePath, setSourcePath] = useState('');
  const [loading, setLoading] = useState(false);
  const filename = sourcePath.split(/[/\\]/).at(-1) ?? '';
  return (
    <Modal title={t('importFinishedVideo')} open locked={loading} onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setLoading(true);
          void run(async () => {
            const workspace = await api.importFinishedVideo({ brandId, name, sourcePath });
            onOpen(workspace, 'launch');
            onClose();
          }).finally(() => {
            setLoading(false);
          });
        }}
      >
        <div className="form">
          <p className="muted">{t('importFinishedVideoHelp')}</p>
          <div className="field">
            <span>{t('finishedVideoFile')}</span>
            <button
              type="button"
              className="button"
              disabled={loading}
              onClick={() => {
                setLoading(true);
                void run(async () => {
                  const selected = (await api.chooseFiles('video'))[0];
                  if (!selected) return;
                  setSourcePath(selected);
                  if (!name.trim()) setName((selected.split(/[/\\]/).at(-1) ?? '').replace(/\.[^.]+$/, ''));
                }).finally(() => {
                  setLoading(false);
                });
              }}
            >
              {t('chooseFinishedVideo')}
            </button>
            <p className="muted" role="status">
              {filename || t('noFinishedVideoSelected')}
            </p>
          </div>
          <label className="field" htmlFor="import-video-name">
            <span>{t('videoName')}</span>
            <input
              id="import-video-name"
              disabled={loading}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              minLength={3}
              maxLength={100}
              required
            />
          </label>
        </div>
        <div className="modal-actions">
          <button type="button" className="button" disabled={loading} onClick={onClose}>
            {t('cancel')}
          </button>
          <button
            type="submit"
            className="button primary"
            disabled={loading || !sourcePath || name.trim().length < 3}
            aria-busy={loading}
          >
            {loading ? <PendingLabel label={t('loading')} /> : t('importAndLaunch')}
          </button>
        </div>
      </form>
    </Modal>
  );
}
