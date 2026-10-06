import { z } from 'zod';
import { mkdir, readFile, lstat, realpath } from 'node:fs/promises';
import { AppFault } from '../../domain/diagnostics';
import createPresets from '../../domain/system-prompts/skills/vandashi-create-presets.md?raw';
import createAssets from '../../domain/system-prompts/skills/vandashi-create-assets.md?raw';
import useAssets from '../../domain/system-prompts/skills/vandashi-use-assets.md?raw';
import { atomicWrite, containedPath, errorCode, hashText } from '../storage/files';

const ownershipSchema = z
  .object({
    installed: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
    pending: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable(),
  })
  .strict();
type Ownership = z.infer<typeof ownershipSchema>;
const sources = {
  'vandashi-create-presets': createPresets,
  'vandashi-create-assets': createAssets,
  'vandashi-use-assets': useAssets,
};
/** Update only app-owned skills; preserve unrelated skills and locally edited versions. */
export async function installManagedSkills(codexHome: string): Promise<Record<string, string>> {
  const home = await realpath(codexHome);
  const root = await containedPath(home, 'skills');
  await mkdir(root, { recursive: true });
  if ((await lstat(root)).isSymbolicLink()) throw new AppFault({ id: 'storageSymlinkOutside' });
  const paths: Record<string, string> = {};
  for (const [name, source] of Object.entries(sources)) {
    const folder = await containedPath(root, name);
    let previous: Ownership | null = null;
    try {
      if ((await lstat(folder)).isSymbolicLink()) throw new AppFault({ id: 'storageSymlinkOutside' });
      const marker = await containedPath(folder, '.vandashi-owned');
      if ((await lstat(marker)).isSymbolicLink()) throw new AppFault({ id: 'storageSymlinkOutside' });
      const content = await readFile(marker, 'utf8');
      let value: unknown;
      try {
        value = JSON.parse(content);
      } catch {
        throw new AppFault({ id: 'storageMetadataInvalid', params: { name: marker } });
      }
      const parsed = ownershipSchema.safeParse(value);
      if (!parsed.success) throw new AppFault({ id: 'storageMetadataInvalid', params: { name: folder } });
      previous = parsed.data;
      const file = await containedPath(folder, 'SKILL.md');
      const current = await lstat(file).catch((error: unknown) => {
        if (errorCode(error) === 'ENOENT') return null;
        throw error;
      });
      if (current) {
        if (current.isSymbolicLink() || !current.isFile())
          throw new AppFault({ id: 'storageSymlinkOutside' });
        const hash = hashText(await readFile(file, 'utf8'));
        if (hash !== previous.installed && hash !== previous.pending)
          throw new AppFault({ id: 'storageMetadataInvalid', params: { name: folder } });
      } else if (previous.installed !== null || previous.pending !== hashText(source))
        throw new AppFault({ id: 'storageMetadataInvalid', params: { name: folder } });
    } catch (error) {
      if (errorCode(error) !== 'ENOENT') throw error;
      try {
        await lstat(folder);
        throw new AppFault({ id: 'storageMetadataInvalid', params: { name: folder } });
      } catch (missing) {
        if (errorCode(missing) !== 'ENOENT') throw missing;
      }
    }
    await mkdir(folder, { recursive: true });
    const file = await containedPath(folder, 'SKILL.md');
    if (previous?.installed !== hashText(source) || previous.pending) {
      await atomicWrite(
        await containedPath(folder, '.vandashi-owned'),
        JSON.stringify({ installed: previous?.installed ?? null, pending: hashText(source) }),
      );
      await atomicWrite(file, source);
      await atomicWrite(
        await containedPath(folder, '.vandashi-owned'),
        JSON.stringify({ installed: hashText(source), pending: null }),
      );
    }
    paths[name] = file;
  }
  return paths;
}
