import { constants, type Stats } from 'node:fs';
import { copyFile, lstat, mkdir, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { AppFault } from '../../domain/diagnostics';
import { containedPath } from './files';

/** Never replace or merge a destination entry created outside this import. */
export async function publishImportedDirectory(
  staging: string,
  destination: string,
  expected?: Pick<Stats, 'dev' | 'ino'>,
  manifest: '.vandashi.yml' | '.vandashi-brand.json' = '.vandashi.yml',
): Promise<void> {
  const reserved = expected ?? (await lstat(destination));
  const guard = async (): Promise<void> => {
    const current = await lstat(destination);
    if (!current.isDirectory() || current.dev !== reserved.dev || current.ino !== reserved.ino)
      throw new AppFault({ id: 'storageImportReservationChanged' });
  };
  const copy = async (source: string, target: string): Promise<void> => {
    await guard();
    const valid = await containedPath(destination, target);
    const info = await lstat(source);
    if (info.isDirectory()) {
      await mkdir(valid);
      for (const name of await readdir(source)) await copy(join(source, name), join(valid, name));
    } else if (info.isFile()) await copyFile(source, valid, constants.COPYFILE_EXCL);
    else throw new AppFault({ id: 'storageImportUnexpectedEntry' });
    await guard();
  };
  for (const name of await readdir(staging))
    if (name !== manifest) await copy(join(staging, name), join(destination, name));
  // Project discovery cannot see the import until every file and Git object is in place.
  await copy(join(staging, manifest), join(destination, manifest));
}
