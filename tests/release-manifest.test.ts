import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';

it('requires every platform artifact and rejects native metadata that describes different bytes', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vandashi-release-'));
  const script = pathToFileURL(resolve('scripts/release-manifest.mjs')).href;
  const run = () =>
    promisify(execFile)(process.execPath, [
      '--input-type=module',
      '-e',
      `const {releaseManifest} = await import(${JSON.stringify(script)}); console.log(JSON.stringify(await releaseManifest(process.argv[1], {version:'0.2.0',notes:['Small improvement.']})));`,
      directory,
    ]);
  const bytes = Buffer.from('test installer bytes');
  const sha512 = createHash('sha512').update(bytes).digest('base64');
  // These are the actual filename conventions from the three-platform release build.
  const names = [
    'mac-arm64.dmg',
    'mac-arm64.zip',
    'win-x64.exe',
    'linux-x86_64.AppImage',
    'linux-amd64.deb',
  ].map((suffix) => `Vandashi-0.2.0-${suffix}`);
  try {
    for (const name of names) await writeFile(join(directory, name), bytes);
    for (const [metadata, indexes] of [
      ['latest.yml', [2]],
      ['latest-mac.yml', [0, 1]],
      ['latest-linux.yml', [3, 4]],
    ] as const)
      await writeFile(
        join(directory, metadata),
        JSON.stringify({
          version: '0.2.0',
          files: indexes.map((index) => ({ url: names[index], size: bytes.length, sha512 })),
        }),
      );
    const result = JSON.parse((await run()).stdout) as { assets: Record<string, unknown> };
    expect(Object.keys(result.assets)).toHaveLength(5);
    expect(result.assets['linux-x64-AppImage']).toMatchObject({
      name: 'Vandashi-0.2.0-linux-x86_64.AppImage',
    });
    expect(result.assets['linux-x64-deb']).toMatchObject({ name: 'Vandashi-0.2.0-linux-amd64.deb' });
    await writeFile(join(directory, 'Vandashi-0.2.0-mac-arm64.dmg'), 'changed');
    await expect(run()).rejects.toThrow('checksum');
    await rm(join(directory, 'Vandashi-0.2.0-mac-arm64.dmg'));
    await expect(run()).rejects.toThrow('Exactly one verified installer');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
