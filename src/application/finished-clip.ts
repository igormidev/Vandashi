import { AppFault } from '../domain/diagnostics';
import { importedClipName } from '../domain/import-names';
import type { MediaPort, MediaProbe } from '../domain/media';
import type { Scope } from '../domain/models';
import type { StoragePort } from '../domain/storage';
import { measuredFinishedRatio } from './finished-video';
import type { Transcriptions } from './transcriptions';

export function finishedClipRatio(probe: MediaProbe): '9:16' | '1:1' {
  const ratio = measuredFinishedRatio(probe, ['9:16', '1:1']);
  if (!ratio) throw new AppFault({ id: 'appFinishedClipRatio' });
  return ratio;
}

export async function importFinishedClip(
  input: { scope: Scope; sourcePath: string },
  store: StoragePort,
  media: MediaPort,
  transcriptions?: Transcriptions,
) {
  const original = await media.probeMedia(input.sourcePath);
  const ratio = finishedClipRatio(original);
  return store.importClip(
    { ...input, name: importedClipName(input.sourcePath), ratio, duration: original.duration },
    async (path) => {
      const copy = await media.probeMedia(path);
      if (
        finishedClipRatio(copy) !== ratio ||
        copy.width !== original.width ||
        copy.height !== original.height ||
        Math.abs(copy.duration - original.duration) > 0.01
      )
        throw new AppFault({ id: 'appImportedVideoChanged' });
      return transcriptions?.analyze({ path, kind: 'video' });
    },
  );
}
