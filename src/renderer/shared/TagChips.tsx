import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
export function TagChips({
  value,
  onChange,
  disabled = false,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="tag-chips">
      {value.map((tag, index) => (
        <div className="tag-chip" key={index}>
          <input
            aria-label={t('tags')}
            value={tag}
            size={Math.max(3, Math.min(24, tag.length + 1))}
            disabled={disabled}
            onChange={(event) => {
              onChange(value.map((entry, position) => (position === index ? event.target.value : entry)));
            }}
          />
          <button
            type="button"
            aria-label={t('remove')}
            disabled={disabled}
            onClick={() => {
              onChange(value.filter((_, position) => position !== index));
            }}
          >
            <X size={11} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="tag-add"
        aria-label={t('addTag')}
        disabled={disabled || value.some((tag) => !tag.trim())}
        onClick={() => {
          onChange([...value, '']);
        }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
