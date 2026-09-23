import { Zap } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ModelSelection } from '../../../domain/models';
import { useApp } from '../../app/store';
import { IconButton, PendingLabel } from '../../shared/ui';
import type { chatEn } from '../../locales/chat-en';

const reasoningLabels: Record<string, keyof typeof chatEn> = {
  none: 'reasoningNone',
  minimal: 'reasoningMinimal',
  low: 'reasoningLow',
  medium: 'reasoningMedium',
  high: 'reasoningHigh',
  xhigh: 'reasoningExtraHigh',
  max: 'reasoningMax',
  ultra: 'reasoningUltra',
};

export function ModelPicker({
  value,
  onChange,
  disabled = false,
  pending = false,
  onRetry,
}: {
  value: ModelSelection;
  onChange: (value: ModelSelection) => void;
  disabled?: boolean;
  pending?: boolean;
  onRetry?: () => void;
}) {
  const { models, run, refresh } = useApp();
  const { t } = useTranslation();
  const refreshOwner = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const locked = disabled || pending || refreshing;
  const model = models.find((entry) => entry.id === value.model);
  const reasoningLabel = (level: string) => {
    const key = reasoningLabels[level];
    return key ? t(key) : level;
  };
  return (
    <div className="model-controls" aria-busy={pending || refreshing}>
      {!models.length && (
        <button
          className="button ghost small"
          type="button"
          disabled={locked}
          aria-busy={refreshing}
          onClick={() => {
            if (refreshOwner.current) return;
            refreshOwner.current = true;
            setRefreshing(true);
            void run(refresh).finally(() => {
              refreshOwner.current = false;
              setRefreshing(false);
            });
          }}
        >
          {refreshing ? <PendingLabel label={t('loading')} /> : t('noModels')}
        </button>
      )}
      <select
        aria-label={t('model')}
        disabled={locked || !models.length}
        value={value.model}
        onChange={(event) => {
          const next = models.find((entry) => entry.id === event.target.value);
          if (next) onChange({ model: next.id, reasoning: next.defaultReasoning, fast: false });
        }}
      >
        {!model && <option value={value.model}>{value.model}</option>}
        {models.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {entry.name}
          </option>
        ))}
      </select>
      <select
        aria-label={t('reasoning')}
        disabled={locked || !model}
        value={value.reasoning}
        onChange={(event) => {
          onChange({ ...value, reasoning: event.target.value });
        }}
      >
        {model && !model.reasoning.includes(value.reasoning) && (
          <option value={value.reasoning}>{reasoningLabel(value.reasoning)}</option>
        )}
        {(model?.reasoning ?? [value.reasoning]).map((level) => (
          <option key={level} value={level}>
            {reasoningLabel(level)}
          </option>
        ))}
      </select>
      {model?.fast && (
        <IconButton
          label={t('fastHelp')}
          disabled={locked}
          aria-pressed={value.fast}
          onClick={() => {
            onChange({ ...value, fast: !value.fast });
          }}
        >
          <Zap size={15} fill={value.fast ? 'currentColor' : 'none'} />
        </IconButton>
      )}
      {pending && (
        <span role="status">
          <PendingLabel label={t('loading')} />
        </span>
      )}
      {onRetry && (
        <button className="button ghost small" type="button" disabled={locked} onClick={onRetry}>
          {t('retry')}
        </button>
      )}
    </div>
  );
}
