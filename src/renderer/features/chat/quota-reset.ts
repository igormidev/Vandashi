/** A reset deadline is an observation, not proof that the provider renewed an allowance. */
export function quotaResetCountdown(
  resetsAt: string | null,
  now: number,
  language: string,
): { minutesRemaining: number; duration: string } | null {
  const deadline = resetsAt === null ? Number.NaN : Date.parse(resetsAt);
  if (!Number.isFinite(deadline) || !Number.isFinite(now)) return null;
  const minutesRemaining = Math.max(0, Math.ceil((deadline - now) / 60_000));
  const days = Math.floor(minutesRemaining / 1440);
  const hours = Math.floor((minutesRemaining % 1440) / 60);
  const minutes = minutesRemaining % 60;
  const parts: string[] = [];
  for (const [value, unit] of [
    [days, 'day'],
    [hours, 'hour'],
    [minutes, 'minute'],
  ] as const) {
    if (value || (!parts.length && minutesRemaining === 0 && unit === 'minute'))
      parts.push(
        new Intl.NumberFormat(language, { style: 'unit', unit, unitDisplay: 'short' }).format(value),
      );
  }
  return {
    minutesRemaining,
    duration: new Intl.ListFormat(language, { type: 'unit', style: 'short' }).format(parts),
  };
}
