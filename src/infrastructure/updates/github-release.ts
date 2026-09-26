import { z } from 'zod';
import { AppFault } from '../../domain/diagnostics';
import type { UpdateRelease } from '../../domain/updates';
import { newerVersion } from '../../domain/updates';

export const UPDATE_REPOSITORY = 'igormidev/Vandashi';
const github = `https://github.com/${UPDATE_REPOSITORY}/releases/download/`;
const version = z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u);
const assetSchema = z.object({
  name: z
    .string()
    .regex(/^Vandashi-[a-zA-Z0-9.-]+$/u)
    .max(180),
  size: z
    .number()
    .int()
    .positive()
    .max(8 * 1024 ** 3),
  sha512: z.string().regex(/^[A-Za-z0-9+/]{86}==$/u),
});
const manifestSchema = z
  .object({
    version,
    notes: z.array(z.string().trim().min(1).max(160)).min(1).max(3),
    assets: z.record(z.string(), assetSchema),
  })
  .strict();
const releaseSchema = z.object({
  tag_name: z.string(),
  draft: z.boolean(),
  prerelease: z.boolean(),
  assets: z
    .array(z.object({ name: z.string(), size: z.number(), browser_download_url: z.string() }))
    .max(100),
});
export interface ReleaseArtifact extends UpdateRelease {
  asset: z.infer<typeof assetSchema>;
  artifacts: Record<string, z.infer<typeof assetSchema>>;
  url: string;
  feed: string;
}
export type UpdateFetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Redirects are restricted too: a compromised response cannot turn the updater into a local fetcher. */
export async function githubFetch(
  url: string,
  init: RequestInit = {},
  request: UpdateFetch = fetch,
): Promise<Response> {
  let next = url;
  for (let count = 0; count < 6; count++) {
    const parsed = new URL(next);
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      ![
        'api.github.com',
        'github.com',
        'release-assets.githubusercontent.com',
        'objects.githubusercontent.com',
      ].includes(parsed.hostname)
    )
      throw new AppFault({ id: 'updateInvalid' });
    const response = await request(next, { ...init, redirect: 'manual' });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const target = response.headers.get('location');
      await response.body?.cancel();
      if (!target) throw new AppFault({ id: 'updateInvalid' });
      next = new URL(target, next).href;
      continue;
    }
    return response;
  }
  throw new AppFault({ id: 'updateInvalid' });
}
async function json(url: string, request: UpdateFetch): Promise<unknown> {
  const response = await githubFetch(
    url,
    { signal: AbortSignal.timeout(30_000), headers: { Accept: 'application/json' } },
    request,
  );
  if (!response.ok) throw new AppFault({ id: 'updateCheckFailed' }, `HTTP ${String(response.status)}`);
  const reader = response.body?.getReader();
  if (!reader) throw new AppFault({ id: 'updateInvalid' });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1_000_000) throw new AppFault({ id: 'updateInvalid' });
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } finally {
    await reader.cancel();
  }
}
export async function latestArtifact(
  current: string,
  target: string,
  request: UpdateFetch = fetch,
): Promise<ReleaseArtifact | null> {
  try {
    const release = releaseSchema.parse(
      await json(`https://api.github.com/repos/${UPDATE_REPOSITORY}/releases/latest`, request),
    );
    const latest = release.tag_name.replace(/^v/u, '');
    version.parse(latest);
    if (release.draft || release.prerelease || release.tag_name !== `v${latest}`)
      throw new AppFault({ id: 'updateInvalid' });
    if (!newerVersion(latest, current)) return null;
    const feed = `${github}v${latest}/`;
    const manifestAsset = release.assets.find((asset) => asset.name === 'update.json');
    if (!manifestAsset || manifestAsset.browser_download_url !== `${feed}update.json`)
      throw new AppFault({ id: 'updateInvalid' });
    const manifest = manifestSchema.parse(await json(manifestAsset.browser_download_url, request));
    if (manifest.version !== latest) throw new AppFault({ id: 'updateInvalid' });
    const asset = manifest.assets[target];
    if (!asset) throw new AppFault({ id: 'updatePlatformUnavailable' });
    const published = release.assets.find((item) => item.name === asset.name);
    const url = `${feed}${asset.name}`;
    if (
      !published ||
      published.size !== asset.size ||
      published.browser_download_url !== url ||
      !asset.name.includes(`-${latest}-`)
    )
      throw new AppFault({ id: 'updateInvalid' });
    return { version: latest, notes: manifest.notes, asset, artifacts: manifest.assets, url, feed };
  } catch (error) {
    if (error instanceof AppFault) throw error;
    throw new AppFault({ id: 'updateCheckFailed' }, error instanceof Error ? error.message : String(error));
  }
}
