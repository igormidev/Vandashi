import { useTranslation } from 'react-i18next';
import { audioCategories } from '../../../domain/transcription';
import type { AudioCategory } from '../../../domain/transcription';
import { audioCategoryLabels as categoryLabels } from '../../locales/transcription-labels';

export function AudioCategoryPicker({
  value,
  onChange,
  title,
}: {
  value: AudioCategory | '';
  onChange: (category: AudioCategory) => void;
  title?: string;
}) {
  const { t } = useTranslation();
  return (
    <label className="field">
      <span>{title ?? t('audioCategory')}</span>
      <select
        value={value}
        onChange={(event) => {
          const category = audioCategories.find((entry) => entry === event.target.value);
          if (category) onChange(category);
        }}
      >
        <option value="" disabled>
          {t('audioCategoryChoose')}
        </option>
        {audioCategories.map((category) => (
          <option key={category} value={category}>
            {t(categoryLabels[category])}
          </option>
        ))}
      </select>
    </label>
  );
}
