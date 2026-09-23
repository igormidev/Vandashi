import type { Workspace } from '../../../domain/models';

export type ReferenceKind =
  | 'taste'
  | 'script'
  | 'config'
  | 'logo'
  | 'image'
  | 'video'
  | 'audio'
  | 'other'
  | 'packaging'
  | 'composition';
export interface MentionReference {
  name: string;
  path: string;
  kind: ReferenceKind;
}

export function mentionReferences(
  workspace: Workspace,
  topic: string,
  logoLabel: string,
): MentionReference[] {
  const identity = `${workspace.brand.path}/brand_identity`;
  const publishedClipId = topic.startsWith('publish:') ? topic.split(':')[2] : undefined;
  const clip = workspace.clips.find((entry) => entry.id === publishedClipId);
  const video = clip ?? workspace.video;
  const references: MentionReference[] = [
    { name: 'brand_config.yml', path: `${identity}/brand_config.yml`, kind: 'config' },
    ...workspace.documents
      .filter((entry) => !clip || entry.kind !== 'script')
      .map(({ name, path, kind }) => ({ name, path, kind })),
  ];
  if (clip) references.push({ name: 'script.md', path: `${clip.path}/script.md`, kind: 'script' });
  const logo = workspace.brand.config.image;
  if (logo)
    references.push({
      name: logoLabel,
      path: /^(?:[A-Za-z]:[\\/]|\/)/.test(logo) ? logo : `${identity}/${logo}`,
      kind: 'logo',
    });
  if (video) {
    references.push({
      name: 'video_packaging.yml',
      path: `${video.path}/video_packaging.yml`,
      kind: 'packaging',
    });
    if (/^(?:creation|clip|chapters|publish:)/.test(topic))
      references.push({
        name: 'index.html',
        path: `${video.path}/index.html`,
        kind: 'composition',
      });
  }
  const media = /^(?:assets|asset:|creation|clip|publish:)/.test(topic);
  const images = /^(?:brand|taste:|thumbnails)/.test(topic);
  references.push(
    ...workspace.assets
      .filter((asset) => media || (images && asset.kind === 'image'))
      .map((asset) => ({ name: asset.title || asset.relativePath, path: asset.path, kind: asset.kind })),
  );
  return references.filter(
    (entry, index) => references.findIndex((other) => other.path === entry.path) === index,
  );
}

export function matchingReferences(references: MentionReference[], query: string): MentionReference[] {
  const words = query.toLocaleLowerCase().trim().split(/\s+/);
  return references
    .filter((entry) =>
      words.every((word) =>
        `${entry.name} ${entry.path.split(/[\\/]/).at(-1) ?? ''}`.toLocaleLowerCase().includes(word),
      ),
    )
    .slice(0, 10);
}
