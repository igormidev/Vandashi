import { z } from 'zod';
import { AppFault } from '../../domain/diagnostics';
import type { ReleaseArtifact } from './github-release';

export function validateNativeUpdate(info: unknown, release: ReleaseArtifact): void {
  const schema = z.object({
    version: z.string(),
    files: z
      .array(z.object({ url: z.string(), size: z.number(), sha512: z.string() }))
      .min(1)
      .max(12),
    packages: z.never().optional(),
  });
  const parsed = schema.safeParse(info);
  if (!parsed.success || parsed.data.version !== release.version) throw new AppFault({ id: 'updateInvalid' });
  let selected = false;
  for (const file of parsed.data.files) {
    const artifact = Object.values(release.artifacts).find((asset) => asset.name === file.url);
    if (!artifact || artifact.size !== file.size || artifact.sha512 !== file.sha512)
      throw new AppFault({ id: 'updateInvalid' });
    if (file.url === release.asset.name) selected = true;
  }
  if (!selected) throw new AppFault({ id: 'updateInvalid' });
}
