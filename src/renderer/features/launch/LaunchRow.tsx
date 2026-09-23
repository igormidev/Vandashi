import { ExternalLink, Upload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LaunchStatus, Platform } from '../../../domain/models';
import { useApp } from '../../app/store';
import { PlatformIcon } from '../../shared/PlatformIcon';
import { IconButton, PendingLabel } from '../../shared/ui';

const statuses: LaunchStatus[] = ['not_started', 'uploading', 'uploaded', 'failed'];
export function LaunchRow({
  platform,
  clipId,
  label,
  rendered = false,
  headingOnly = false,
  onPublish,
}: {
  platform: Platform;
  clipId: string | null;
  label?: string;
  rendered?: boolean;
  headingOnly?: boolean;
  onPublish: () => void;
}) {
  const { t } = useTranslation();
  const { api, workspace, run, busy, dirty, reload } = useApp();
  const launch = workspace?.launches.find((entry) => entry.platform === platform && entry.clipId === clipId);
  const saved = launch?.url ?? '';
  const [value, setValue] = useState({ saved, text: saved });
  if (value.saved !== saved) setValue({ saved, text: value.text === value.saved ? saved : value.text });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const lock = busy || dirty || saving;
  const name = label ? t('launchPlatformItem', { platform: t(platform), name: label }) : t(platform);
  const update = (status: LaunchStatus, url = value.text) => {
    if (!workspace) return;
    if (url.trim()) {
      try {
        const parsed = new URL(url);
        if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password)
          throw new Error('URL');
      } catch {
        setError(true);
        return;
      }
    }
    setError(false);
    setSaving(true);
    void run(async () => {
      try {
        await api.updateLaunch({
          scope: workspace.scope,
          launch: { platform, status, url: url.trim(), clipId },
        });
        await reload();
      } finally {
        setSaving(false);
      }
    });
  };
  return (
    <div className={`launch-row ${label ? 'clip-release' : ''}`} aria-busy={saving}>
      <div className="launch-platform">
        {!label && <PlatformIcon platform={platform} />}
        <h3>{label ?? t(platform)}</h3>
        {saving && (
          <span role="status">
            <PendingLabel label={t('loading')} />
          </span>
        )}
        {!headingOnly && (
          <span className={`badge ${launch?.status === 'uploaded' ? 'success' : ''}`}>
            {t(launch?.status ?? 'not_started')}
          </span>
        )}
      </div>
      {!headingOnly && (
        <div className="launch-controls">
          <select
            value={launch?.status ?? 'not_started'}
            aria-label={t('launchStatusLabel', { name })}
            disabled={lock}
            onChange={(event) => {
              const status = statuses.find((entry) => entry === event.target.value);
              if (status) update(status);
            }}
          >
            {statuses.map((status) => (
              <option value={status} key={status}>
                {t(status)}
              </option>
            ))}
          </select>
          <input
            type="url"
            value={value.text}
            aria-label={t('launchUrlLabel', { name })}
            placeholder={t('publicationUrl')}
            disabled={lock}
            aria-invalid={error}
            onChange={(event) => {
              setValue({ ...value, text: event.target.value });
              setError(false);
            }}
            onBlur={() => {
              if (value.text !== saved) update(launch?.status ?? 'not_started');
            }}
          />
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {t('launchUrlError')}
        </p>
      )}
      <div className="toolbar">
        {(headingOnly || launch?.status !== 'uploaded') && (
          <button
            type="button"
            className="button small"
            disabled={lock || (!headingOnly && !rendered) || launch?.status === 'uploading'}
            onClick={onPublish}
          >
            <Upload size={13} />
            {t(headingOnly ? 'chooseClip' : !rendered ? 'launchClipNeedsRender' : 'publish')}
          </button>
        )}
        {!headingOnly && saved && (
          <IconButton
            label={t('open')}
            onClick={() => {
              void run(() => api.openExternal(saved));
            }}
          >
            <ExternalLink size={13} />
          </IconButton>
        )}
      </div>
    </div>
  );
}
