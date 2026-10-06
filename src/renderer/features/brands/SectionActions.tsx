import { RotateCcw, Save } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '../../shared/ui';

export function SectionActions({
  dirty,
  disabled,
  invalid = false,
  onReset,
  onSave,
}: {
  dirty: boolean;
  disabled: boolean;
  invalid?: boolean;
  onReset: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="section-actions">
      <IconButton label={t('discard')} disabled={!dirty || disabled} onClick={onReset}>
        <RotateCcw size={14} />
      </IconButton>
      <button
        type="button"
        className="button primary compact"
        disabled={!dirty || disabled || invalid}
        onClick={onSave}
      >
        <Save size={13} />
        {t('save')}
      </button>
    </div>
  );
}
