import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TranscriptionProgress } from '../../../domain/transcription';
import { useApp } from '../../app/store';
import { PendingLabel } from '../../shared/ui';
import { formatPercent } from '../../shared/format';
import { transcriptionPhaseLabels as phases } from '../../locales/transcription-labels';

export function useTranscriptionProgress() {
  const { api } = useApp();
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  useEffect(
    () =>
      api.onEvent((event) => {
        if (event.type === 'transcription') setProgress(event.active ? event.progress : null);
      }),
    [api],
  );
  return progress;
}

export function TranscriptionStatus({ progress }: { progress: TranscriptionProgress | null }) {
  const { t, i18n } = useTranslation();
  if (!progress) return null;
  return (
    <div className="transcription-status" role="status" aria-live="polite" aria-busy="true">
      <PendingLabel label={t(phases[progress.phase])} />
      {progress.file && (
        <span className="transcription-file" title={progress.file}>
          {progress.file}
        </span>
      )}
      {progress.total !== undefined && progress.completed !== undefined && (
        <span className="muted">
          {t('transcriptionCount', {
            completed: progress.completed.toLocaleString(i18n.language),
            total: progress.total.toLocaleString(i18n.language),
          })}
        </span>
      )}
      {progress.fraction !== undefined && (
        <progress max={1} value={progress.fraction} aria-label={t(phases[progress.phase])}>
          {formatPercent(progress.fraction, i18n.language)}
        </progress>
      )}
    </div>
  );
}
