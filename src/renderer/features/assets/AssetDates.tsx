import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
export function AssetDates({
  createdAt,
  modifiedAt,
}: {
  createdAt?: string | undefined;
  modifiedAt?: string | undefined;
}) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 60_000);
    return () => {
      clearInterval(timer);
    };
  }, []);
  const format = (value: string) => {
    const date = new Date(value);
    const elapsed = Math.max(0, now - date.getTime());
    if (elapsed >= 604_800_000)
      return new Intl.DateTimeFormat(i18n.language, { dateStyle: 'long', timeStyle: 'short' }).format(date);
    const minutes = Math.floor(elapsed / 60_000);
    const parts: [number, 'day' | 'hour' | 'minute'][] = [
      [Math.floor(minutes / 1440), 'day'],
      [Math.floor(minutes / 60) % 24, 'hour'],
      [minutes % 60, 'minute'],
    ];
    const duration = new Intl.ListFormat(i18n.language, { style: 'short', type: 'unit' }).format(
      parts
        .filter(([value]) => value > 0)
        .map(([value, unit]) =>
          new Intl.NumberFormat(i18n.language, { style: 'unit', unit, unitDisplay: 'short' }).format(value),
        ),
    );
    return duration
      ? t('assetAgo', { duration })
      : new Intl.RelativeTimeFormat(i18n.language, { numeric: 'auto' }).format(0, 'second');
  };
  return (
    <dl className="asset-dates">
      {createdAt && (
        <>
          <dt>{t('createdAt')}</dt>
          <dd>
            <time dateTime={createdAt}>{format(createdAt)}</time>
          </dd>
        </>
      )}
      {modifiedAt && (
        <>
          <dt>{t('modifiedAt')}</dt>
          <dd>
            <time dateTime={modifiedAt}>{format(modifiedAt)}</time>
          </dd>
        </>
      )}
    </dl>
  );
}
