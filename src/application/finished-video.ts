import type { DesktopApi } from '../domain/api';
import type { MediaPort, MediaProbe } from '../domain/media';
import type { StoragePort } from '../domain/storage';

export function finishedVideoRatio(probe: MediaProbe): '16:9' | '9:16' {
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
    throw new Error('Choose a valid finished video with a positive duration.');
  // Accept codec-friendly even-pixel rounding, not a different creative aspect ratio.
  const matches = (ratio: number) =>
    Math.abs(width / height - ratio) / ratio <= 0.01 &&
    (Math.abs(width - height * ratio) <= 2 || Math.abs(height - width / ratio) <= 2);
  if (matches(16 / 9)) return '16:9';
  if (matches(9 / 16)) return '9:16';
  throw new Error(
    'Import a 16:9 landscape or 9:16 portrait video. Square videos use the clip import workflow.',
  );
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
      throw new Error('The selected video changed while it was imported. Select it again.');
  });
}
