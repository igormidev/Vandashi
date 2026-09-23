import { Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ModelSelection } from '../../../domain/models';
import { useApp } from '../../app/store';
import { IconButton } from '../../shared/ui';
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
}: {
  value: ModelSelection;
  onChange: (value: ModelSelection) => void;
  disabled?: boolean;
}) {
  const { models, run, refresh } = useApp();
  const { t } = useTranslation();
  const model = models.find((entry) => entry.id === value.model);
  const reasoningLabel = (level: string) => {
    const key = reasoningLabels[level];
    return key ? t(key) : level;
  };
  return (
    <div className="model-controls">
      {!models.length && (
        <button
          className="button ghost small"
          type="button"
          disabled={disabled}
          onClick={() => {
            void run(refresh);
          }}
        >
          {t('noModels')}
        </button>
      )}
      <select
        aria-label={t('model')}
        disabled={disabled || !models.length}
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
        disabled={disabled || !model}
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
          disabled={disabled}
          aria-pressed={value.fast}
          onClick={() => {
            onChange({ ...value, fast: !value.fast });
          }}
        >
          <Zap size={15} fill={value.fast ? 'currentColor' : 'none'} />
        </IconButton>
      )}
    </div>
  );
}
