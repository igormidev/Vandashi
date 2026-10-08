export function relativeMessageTime(createdAt: string, now: number, locale: string) {
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp) || !Number.isFinite(now)) return null;
  const difference = now - timestamp;
  const minutes = Math.floor(Math.abs(difference) / 60_000);
  if (minutes === 0) return { kind: 'now' as const, time: '' };
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainder = minutes % 60;
  const unit = (value: number, name: 'day' | 'hour' | 'minute') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'narrow' }).format(value);
  const parts = [
    ...(days ? [unit(days, 'day')] : []),
    ...(hours ? [unit(hours, 'hour')] : []),
    ...(remainder ? [unit(remainder, 'minute')] : []),
  ];
  return {
    kind: difference < 0 ? ('future' as const) : ('ago' as const),
    time: new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(parts),
  };
}
