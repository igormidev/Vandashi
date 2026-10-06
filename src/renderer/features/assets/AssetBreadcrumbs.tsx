import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { useTranslation } from 'react-i18next';
export function AssetBreadcrumbs({
  folder,
  disabled,
  onChange,
}: {
  folder: string;
  disabled: boolean;
  onChange: (folder: string) => void;
}) {
  const { t } = useTranslation();
  const segments = folder.split('/').filter(Boolean);
  return (
    <nav className="asset-folder-crumbs" aria-label={t('folder')}>
      <button
        type="button"
        disabled={disabled || !folder}
        onClick={() => {
          onChange('');
        }}
      >
        {t('assetLibrary')}
      </button>
      {segments.map((segment, index) => (
        <Fragment key={segments.slice(0, index + 1).join('/')}>
          <ChevronRight size={11} />
          <button
            type="button"
            disabled={disabled || index === segments.length - 1}
            onClick={() => {
              onChange(segments.slice(0, index + 1).join('/'));
            }}
          >
            {segment}
          </button>
        </Fragment>
      ))}
    </nav>
  );
}
