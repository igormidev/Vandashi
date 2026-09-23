import { extname, isAbsolute } from 'node:path';
import { AppFault } from '../../domain/diagnostics';
import type { SaveInput, Workspace } from '../../domain/models';
import { brandConfigSchema, packagingSchema } from './schemas';
import { parseStorage } from './validation';
import { atomicWrite, containedPath } from './files';
import { saveBrandImage } from './brand-image';
import { writeYaml } from './yaml-files';
import type { ManualMutation } from './manual-mutation';

export async function saveWorkspaceFiles(
  input: SaveInput,
  workspace: Workspace,
  repositories: string[],
  mutation: ManualMutation,
): Promise<void> {
  if (!input.commit.title.trim() || !input.commit.body.trim())
    throw new AppFault({ id: 'appCommitRequired' });
  const config =
    input.brandConfig === null
      ? null
      : parseStorage(brandConfigSchema, input.brandConfig, { id: 'storageBrandConfigInvalid' });
  const packaging =
    input.packaging === null
      ? null
      : parseStorage(packagingSchema, input.packaging, { id: 'storagePackagingInvalid' });
  if (packaging !== null && !workspace.video) throw new AppFault({ id: 'storagePackagingVideoRequired' });
  const identity = await containedPath(workspace.brand.path, 'brand_identity');
  const documents = await Promise.all(
    input.documents.map(async (document) => {
      if (!workspace.documents.some((target) => target.path === document.path))
        throw new AppFault({ id: 'storageDocumentReadOnly' });
      return { ...document, path: await containedPath(workspace.brand.path, document.path) };
    }),
  );
  const configPath = config === null ? null : await containedPath(identity, 'brand_config.yml');
  const packagingPath =
    packaging === null || !workspace.video
      ? null
      : await containedPath(workspace.video.path, 'video_packaging.yml');
  const imagePath =
    config?.image && isAbsolute(config.image)
      ? await containedPath(identity, `brand_icon${extname(config.image).toLowerCase()}`)
      : null;
  await mutation.run({
    key: JSON.stringify(input),
    repositories,
    paths: [
      ...documents.map((document) => document.path),
      ...[configPath, packagingPath, imagePath].filter((path) => path !== null),
    ],
    commit: input.commit,
    mutate: async (receipt) => {
      for (const document of documents) await atomicWrite(document.path, document.content, receipt);
      if (config !== null) {
        config.image = await saveBrandImage(identity, config.image, receipt);
        await writeYaml(identity, 'brand_config.yml', config, receipt);
      }
      if (packaging !== null && workspace.video)
        await writeYaml(workspace.video.path, 'video_packaging.yml', packaging, receipt);
    },
  });
}
