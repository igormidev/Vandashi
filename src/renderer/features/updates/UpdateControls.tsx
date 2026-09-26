import { ArrowDownToLine, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { UpdateRelease } from '../../../domain/updates';
import { diagnosticText } from '../../app/diagnostics';
import { IconButton, Modal, PendingLabel } from '../../shared/ui';
import type { UpdateControl } from './use-updates';

export function UpdateCheck({ updates, disabled }: { updates: UpdateControl; disabled: boolean }) {
  const { t } = useTranslation();
  const { state, working } = updates;
  const checking = working || state?.phase === 'checking';
  return (
    <div className="update-check">
      <button
        type="button"
        className="button"
        disabled={
          disabled || checking || !state || state.phase === 'downloading' || state.phase === 'applying'
        }
        aria-busy={checking}
        onClick={() => {
          void updates.check();
        }}
      >
        {checking ? <PendingLabel label={t('updateChecking')} /> : t('updateCheck')}
      </button>
      <span className="muted update-check-result" role="status">
        {state?.diagnostic
          ? diagnosticText(state.diagnostic)
          : state?.phase === 'unsupported'
            ? t('updateDevelopment')
            : state?.phase === 'downloaded'
              ? t('updateReady', { version: state.release?.version ?? state.currentVersion })
              : state?.release
                ? t('updateAvailable', { version: state.release.version })
                : state?.checked && !checking
                  ? t('updateCurrent', { version: state.currentVersion })
                  : ''}
      </span>
    </div>
  );
}

export function UpdateControls({ updates, blocked }: { updates: UpdateControl; blocked: boolean }) {
  const { t } = useTranslation();
  const { state, working } = updates;
  const [reviewed, setReviewed] = useState<UpdateRelease | null>(null);
  const [dismissed, setDismissed] = useState('');
  if (!state?.release) return null;
  const ready = state.phase === 'downloaded' || state.phase === 'applying';
  const pending =
    working || state.phase === 'checking' || state.phase === 'downloading' || state.phase === 'applying';
  const notification = `${state.release.version}:${String(ready)}`;
  const label = ready
    ? t('updateReady', { version: state.release.version })
    : t('updateAvailable', { version: state.release.version });
  const action = ready
    ? state.mode === 'installer'
      ? t('updateOpenInstaller')
      : t('updateRestart')
    : t('updateDownload');
  const status =
    state.phase === 'checking'
      ? t('updateChecking')
      : state.phase === 'applying'
        ? t('updateApplying')
        : t('updateDownloading');
  return (
    <>
      <button
        type="button"
        className="button update-button"
        aria-label={label}
        onClick={() => {
          setReviewed(state.release);
        }}
      >
        {pending ? (
          <PendingLabel label={status} />
        ) : (
          <>
            <ArrowDownToLine size={15} aria-hidden="true" />
            {t('updateButton')}
          </>
        )}
      </button>
      {dismissed !== notification && !reviewed && (
        <aside className="update-toast" aria-label={t('updateButton')}>
          <div role="status">
            <strong>{label}</strong>
            {pending && <PendingLabel label={status} />}
          </div>
          <button
            type="button"
            className="button small"
            onClick={() => {
              setReviewed(state.release);
            }}
          >
            {t('updateReview')}
          </button>
          <IconButton
            label={t('dismiss')}
            onClick={() => {
              setDismissed(notification);
            }}
          >
            <X size={14} />
          </IconButton>
        </aside>
      )}
      {reviewed && (
        <Modal
          open
          title={
            ready
              ? t('updateReady', { version: reviewed.version })
              : t('updateAvailable', { version: reviewed.version })
          }
          locked={pending}
          onClose={() => {
            setReviewed(null);
            setDismissed(notification);
          }}
        >
          <div className="update-review">
            <p className="muted">
              {ready
                ? state.mode === 'installer'
                  ? t('updateInstallerHelp')
                  : t('updateRestartHelp')
                : t('updateDownloadHelp')}
            </p>
            <ul className="update-notes">
              {reviewed.notes.map((note, index) => (
                <li key={index}>{note}</li>
              ))}
            </ul>
            {pending && (
              <div className="update-progress" role="status" aria-live="polite">
                <PendingLabel label={status} />
                {state.progress !== null && (
                  <progress max={100} value={state.progress} aria-label={t('updateDownloading')} />
                )}
              </div>
            )}
            {state.diagnostic && (
              <p className="error-text" role="alert">
                {diagnosticText(state.diagnostic)}
              </p>
            )}
            {ready && blocked && <p className="muted">{t('updateFinishWork')}</p>}
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="button"
              disabled={pending}
              onClick={() => {
                setReviewed(null);
                setDismissed(notification);
              }}
            >
              {t('updateLater')}
            </button>
            <button
              type="button"
              className="button primary"
              disabled={pending || (ready && blocked)}
              aria-busy={pending}
              onClick={() => {
                if (ready) void updates.apply(reviewed.version);
                else void updates.download(reviewed.version);
              }}
            >
              {pending ? (
                <PendingLabel label={status} />
              ) : (
                <>
                  {ready ? (
                    <RefreshCw size={15} aria-hidden="true" />
                  ) : (
                    <ArrowDownToLine size={15} aria-hidden="true" />
                  )}
                  {action}
                </>
              )}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
