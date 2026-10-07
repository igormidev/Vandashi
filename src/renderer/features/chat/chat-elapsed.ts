/** Elapsed time is observed with a monotonic clock; cached provider timestamps are never inferred. */
export function formatChatElapsed(milliseconds: number, locale: string): string {
  const seconds = Number.isFinite(milliseconds) ? Math.max(0, Math.floor(milliseconds / 1000)) : 0;
  const unit = (value: number, name: 'hour' | 'minute' | 'second') =>
    new Intl.NumberFormat(locale, { style: 'unit', unit: name, unitDisplay: 'narrow' }).format(value);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [
    ...(hours ? [unit(hours, 'hour')] : []),
    ...(minutes || hours ? [unit(minutes, 'minute')] : []),
    unit(remainder, 'second'),
  ].join(' ');
}
