import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useApp } from '../../app/store';
import { Modal } from '../../shared/ui';
import { errorText } from '../../app/diagnostics';

export function CommitDialog({
  onSave,
  onClose,
  summary = '',
}: {
  onSave: (commit: { title: string; body: string }) => Promise<void>;
  onClose: () => void;
  summary?: string;
}) {
  const { t } = useTranslation();
  const { api, workspace, run } = useApp();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    if (!workspace) return;
    void api
      .suggestCommit({ scope: workspace.scope, summary })
      .then((value) => {
        if (!disposed) {
          setGenerationError(null);
          setTitle(value.title);
          setBody(value.body);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) setGenerationError(errorText(error));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [api, workspace, summary]);
  return (
    <Modal
      title={t('commitDialog')}
      open
      locked={saving}
      onClose={() => {
        if (!saving) onClose();
      }}
    >
      <div className="form">
        {loading && <p className="muted">{t('generatingCommit')}</p>}
        {generationError && (
          <p className="field-error" role="alert">
            {generationError}
          </p>
        )}
        <label className="field">
          <span>{t('commitTitle')}</span>
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
            disabled={loading || saving}
          />
        </label>
        <label className="field">
          <span>{t('commitBody')}</span>
          <textarea
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
            }}
            disabled={loading || saving}
          />
        </label>
      </div>
      <div className="modal-actions">
        <button className="button" type="button" onClick={onClose} disabled={saving}>
          {t('cancel')}
        </button>
        <button
          className="button primary"
          type="button"
          disabled={!title.trim() || !body.trim() || loading || saving}
          onClick={() => {
            setSaving(true);
            void run(() => onSave({ title: title.trim(), body: body.trim() })).finally(() => {
              setSaving(false);
            });
          }}
        >
          {t(saving ? 'loading' : 'save')}
        </button>
      </div>
    </Modal>
  );
}
