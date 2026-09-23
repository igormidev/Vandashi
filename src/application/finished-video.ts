import { AppFault } from '../domain/diagnostics';
import type { DesktopApi } from '../domain/api';
import type { MediaPort, MediaProbe } from '../domain/media';
import type { AspectRatio } from '../domain/models';
import type { StoragePort } from '../domain/storage';

export function measuredFinishedRatio<T extends AspectRatio>(
  probe: MediaProbe,
  allowed: readonly T[],
): T | null {
  const { width, height, duration } = probe;
  if (
    !width ||
    !height ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    throw new AppFault({ id: 'appFinishedVideoInvalid' });
  // Accept codec-friendly even-pixel rounding, not a different creative aspect ratio.
  const matches = (ratio: number) =>
    Math.abs(width / height - ratio) / ratio <= 0.01 &&
    (Math.abs(width - height * ratio) <= 2 || Math.abs(height - width / ratio) <= 2);
  const values = { '16:9': 16 / 9, '9:16': 9 / 16, '1:1': 1 };
  return allowed.find((ratio) => matches(values[ratio])) ?? null;
}

export function finishedVideoRatio(probe: MediaProbe): '16:9' | '9:16' {
  const ratio = measuredFinishedRatio(probe, ['16:9', '9:16']);
  if (!ratio) throw new AppFault({ id: 'appFinishedVideoRatio' });
  return ratio;
}

export async function importFinishedVideo(
  input: Parameters<DesktopApi['importFinishedVideo']>[0],
  store: StoragePort,
  media: MediaPort,
) {
  const original = await media.probeMedia(input.sourcePath);
  const ratio = finishedVideoRatio(original);
  return store.importVideo({ ...input, ratio }, async (path) => {
    const copy = await media.probeMedia(path);
    if (
      finishedVideoRatio(copy) !== ratio ||
      copy.width !== original.width ||
      copy.height !== original.height ||
      Math.abs(copy.duration - original.duration) > 0.01
    )
      throw new AppFault({ id: 'appImportedVideoChanged' });
  });
}
