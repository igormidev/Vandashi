export interface ClipRange {
  start: number;
  end: number;
}
export function validClipRange(range: ClipRange, duration: number): boolean {
  return (
    [range.start, range.end, duration].every(Number.isFinite) &&
    duration > 0 &&
    range.start >= 0 &&
    range.end <= duration &&
    range.end - range.start >= 0.099
  );
}
export function constrainClipRange(range: ClipRange, duration: number): ClipRange {
  if (!Number.isFinite(duration) || duration <= 0) return { start: 0, end: 0 };
  const start = Math.max(
    0,
    Math.min(Number.isFinite(range.start) ? range.start : 0, Math.max(0, duration - 0.1)),
  );
  return {
    start,
    end: Math.max(
      start + Math.min(duration, 0.1),
      Math.min(Number.isFinite(range.end) ? range.end : duration, duration),
    ),
  };
}
export function validClipName(name: string): boolean {
  const clean = name.trim();
  return (
    clean.length >= 1 &&
    clean.length <= 80 &&
    !/[<>:"/\\|?*]/u.test(clean) &&
    !['.', '..'].includes(clean) &&
    !/[. ]$/u.test(name)
  );
}
export function timecode(seconds: number): string {
  const value = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(value / 60);
  const rest = Math.floor(value % 60);
  const tenths = Math.floor((value % 1) * 10);
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}.${String(tenths)}`;
}
