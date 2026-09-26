import { createHash } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  githubFetch,
  latestArtifact,
  type ReleaseArtifact,
  type UpdateFetch,
} from '../src/infrastructure/updates/github-release';
import { InstallerDownload } from '../src/infrastructure/updates/installer-download';

const bytes = Buffer.from('A verified release installer.');
const artifact: ReleaseArtifact = {
  version: '0.2.0',
  notes: ['A release.'],
  feed: 'https://github.com/igormidev/Vandashi/releases/download/v0.2.0/',
  artifacts: {},
  url: 'https://github.com/igormidev/Vandashi/releases/download/v0.2.0/Vandashi-0.2.0-mac-arm64.dmg',
  asset: {
    name: 'Vandashi-0.2.0-mac-arm64.dmg',
    size: bytes.length,
    sha512: createHash('sha512').update(bytes).digest('base64'),
  },
};
artifact.artifacts = { 'darwin-arm64-dmg': artifact.asset };
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'vandashi-update-test-'));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const response = () => new Response(bytes);
it('verifies bytes, reports real progress, reuses only a verified cache, and detects later tampering', async () => {
  const request = vi.fn(() => Promise.resolve(response()));
  const download = new InstallerDownload(directory, request);
  const progress: number[] = [];
  await download.download(artifact, (value) => {
    progress.push(value);
  });
  const path = await download.verifiedPath(artifact.version);
  expect(await readFile(path)).toEqual(bytes);
  expect(progress.at(-1)).toBe(100);
  const restarted = new InstallerDownload(directory, request);
  await expect(restarted.verifiedPath(artifact.version)).rejects.toThrow();
  await restarted.download(artifact, () => undefined);
  expect(request).toHaveBeenCalledTimes(1);
  await writeFile(path, Buffer.alloc(bytes.length));
  await expect(download.verifiedPath(artifact.version)).rejects.toThrow();
  await restarted.download(artifact, () => undefined);
  expect(request).toHaveBeenCalledTimes(2);
});
it.each([Buffer.from('short'), Buffer.alloc(bytes.length), Buffer.alloc(bytes.length + 1)])(
  'rejects corrupted or incomplete bytes without leaving a ready installer',
  async (bad) => {
    const download = new InstallerDownload(directory, () => Promise.resolve(new Response(bad)));
    await expect(download.download(artifact, () => undefined)).rejects.toThrow();
    await expect(download.verifiedPath(artifact.version)).rejects.toThrow();
    expect(await readdir(directory)).toEqual([]);
  },
);
it('cleans interrupted downloads and can retry', async () => {
  const request = vi
    .fn<UpdateFetch>()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(response());
  const download = new InstallerDownload(directory, request);
  await expect(download.download(artifact, () => undefined)).rejects.toThrow();
  expect(await readdir(directory)).toEqual([]);
  await download.download(artifact, () => undefined);
  expect(await download.verifiedPath(artifact.version)).toBe(join(directory, artifact.asset.name));
});
it('rejects untrusted redirect targets before requesting them', async () => {
  const request = vi.fn(() =>
    Promise.resolve(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } })),
  );
  await expect(githubFetch(artifact.url, {}, request)).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(1);
});
function releaseRequest(change: (manifest: Record<string, unknown>) => void = () => undefined): UpdateFetch {
  const manifest: Record<string, unknown> = {
    version: artifact.version,
    notes: artifact.notes,
    assets: { 'darwin-arm64-dmg': artifact.asset },
  };
  change(manifest);
  return vi.fn<UpdateFetch>((url) =>
    Promise.resolve(
      new Response(
        JSON.stringify(
          url.includes('api.github.com')
            ? {
                tag_name: 'v0.2.0',
                draft: false,
                prerelease: false,
                assets: [
                  { name: 'update.json', size: 300, browser_download_url: `${artifact.feed}update.json` },
                  {
                    name: artifact.asset.name,
                    size: artifact.asset.size,
                    browser_download_url: artifact.url,
                  },
                ],
              }
            : manifest,
        ),
      ),
    ),
  );
}
it('advertises only an exact published release and matching platform artifact', async () => {
  expect(await latestArtifact('0.1.2', 'darwin-arm64-dmg', releaseRequest())).toEqual(artifact);
  expect(await latestArtifact('0.2.0', 'darwin-arm64-dmg', releaseRequest())).toBeNull();
  await expect(latestArtifact('0.1.2', 'darwin-x64-dmg', releaseRequest())).rejects.toThrow();
  await expect(
    latestArtifact(
      '0.1.2',
      'darwin-arm64-dmg',
      releaseRequest((value) => {
        value.version = '0.3.0';
      }),
    ),
  ).rejects.toThrow();
});
it('reports absent releases, API limits and malformed manifests as failures, never no-update success', async () => {
  for (const status of [404, 403, 429, 500])
    await expect(
      latestArtifact('0.1.2', 'darwin-arm64-dmg', () => Promise.resolve(new Response(null, { status }))),
    ).rejects.toThrow();
  await expect(
    latestArtifact(
      '0.1.2',
      'darwin-arm64-dmg',
      releaseRequest((value) => {
        value.assets = {};
      }),
    ),
  ).rejects.toThrow();
});
it.each(['Vandashi-0.2.0-../installer.dmg', 'Vandashi-0.2.0-..\\installer.dmg', 'Vandashi-0.2.0-%2f.dmg'])(
  'rejects unsafe artifact filenames anywhere in a release: %s',
  async (name) => {
    await expect(
      latestArtifact(
        '0.1.2',
        'darwin-arm64-dmg',
        releaseRequest((value) => {
          value.assets = {
            ...artifact.artifacts,
            'linux-x64-AppImage': { ...artifact.asset, name },
          };
        }),
      ),
    ).rejects.toThrow();
  },
);
