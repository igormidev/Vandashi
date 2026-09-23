import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { nativeFixture } from './native-sources-fixture';

const roots: string[] = [];
async function fixture() {
  const app = await nativeFixture();
  roots.push(app.root);
  return app;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 3 })));
});

describe('native source release material', () => {
  it('assembles deterministically and verifies actual archived source payloads', async () => {
    const app = await fixture();
    await app.generate('--offline');
    const original = await app.archive();
    expect((await app.verify()).stdout).toContain('Verified 1 native payloads');
    await app.generate('--offline');
    expect(await app.archive()).toEqual(original);
  });
  it('does not substitute a URL for missing source in offline verification', async () => {
    const app = await fixture();
    await rm(join(app.root, 'build/native-source-cache/fixture-source.txt'));
    await expect(app.generate('--offline', '--verify-only')).rejects.toThrow('Offline source missing');
  });
  it('rejects changed cached source bytes', async () => {
    const app = await fixture();
    await app.put('build/native-source-cache/fixture-source.txt', 'Tampered source');
    await expect(app.generate('--offline', '--verify-only')).rejects.toThrow('checksum/size mismatch');
  });
  it('requires source coverage for every declared native component', async () => {
    const app = await fixture();
    app.manifest.componentSets.posix.fixture = '2.0.0';
    await app.put('scripts/native-sources.lock.json', JSON.stringify(app.manifest));
    await expect(app.generate('--check')).rejects.toThrow('Missing native source coverage');
  });
  it('checks installed native versions before claiming manifest coverage', async () => {
    const app = await fixture();
    await app.put('node_modules/@img/sharp-libvips-test/versions.json', JSON.stringify({ fixture: '2.0.0' }));
    await expect(app.generate('--check')).rejects.toThrow('Unreviewed native component');
  });
  it('rejects changed release archive bytes', async () => {
    const app = await fixture();
    await app.generate('--offline');
    await app.put(
      'build/native-sources/vandashi-native-sources-sharp-0.35.4.tar.gz',
      'Not the source archive',
    );
    await expect(app.verify()).rejects.toThrow('archive checksum mismatch');
  });
  it('rejects an archive that no longer matches the application dependency lock', async () => {
    const app = await fixture();
    await app.generate('--offline');
    await app.put(
      'package-lock.json',
      JSON.stringify({ packages: { 'node_modules/sharp': { version: '0.35.5' } } }),
    );
    await expect(app.verify()).rejects.toThrow('Application source lock does not match');
  });
});
