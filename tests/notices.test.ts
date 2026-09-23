import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const run = promisify(execFile);
const roots: string[] = [];
const originalLicense = 'MIT License\r\n\r\nCopyright (c) Fixture Author\r\n';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'vandashi-notices-'));
  roots.push(root);
  async function put(file: string, text: string) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), text);
  }
  await mkdir(join(root, 'scripts'));
  await cp('scripts/generate-notices.mjs', join(root, 'scripts/generate-notices.mjs'));
  await put(
    'package-lock.json',
    JSON.stringify({ packages: { 'node_modules/example': { version: '1.0.0' } } }),
  );
  await put('third-party/sources.json', JSON.stringify({ extras: [], packages: {} }));
  await put('node_modules/example/package.json', JSON.stringify({ name: 'example', version: '1.0.0' }));
  await put('node_modules/example/LICENSE', originalLicense);
  await put('node_modules/electron/LICENSE', 'Electron fixture license\n');
  await put('node_modules/electron/dist/LICENSES.chromium.html', '<html>Chromium fixture notices</html>');
  return {
    put,
    root,
    generate: () => run(process.execPath, ['scripts/generate-notices.mjs'], { cwd: root }),
    output: () => readFile(join(root, 'build/THIRD_PARTY_LICENSES.txt')),
  };
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('distribution license notices', () => {
  it('preserves original text bytes and produces deterministic output', async () => {
    const app = await fixture();
    await app.generate();
    const first = await app.output();
    expect(first.includes(Buffer.from(originalLicense))).toBe(true);
    expect(first.toString()).toContain('example@1.0.0');
    await app.generate();
    expect(await app.output()).toEqual(first);
  });

  it('fails an unreviewed package without license text', async () => {
    const app = await fixture();
    await rm(join(app.root, 'node_modules/example/LICENSE'));
    await expect(app.generate()).rejects.toThrow('Missing license text/source record for example@1.0.0');
  });

  it('verifies supplemental source bytes rather than accepting a changed attribution', async () => {
    const app = await fixture();
    const record = {
      file: 'third-party/upstream.txt',
      source: 'https://example.test/source-at-exact-revision/LICENSE',
      sha256: createHash('sha256').update(originalLicense).digest('hex'),
    };
    await app.put('third-party/upstream.txt', originalLicense);
    await app.put('third-party/sources.json', JSON.stringify({ extras: [record], packages: {} }));
    await app.generate();
    await app.put('third-party/upstream.txt', 'Changed copyright holder');
    await expect(app.generate()).rejects.toThrow('Supplemental notice changed');
  });

  it('rejects installed dependency drift from the lockfile', async () => {
    const app = await fixture();
    await app.put('node_modules/example/package.json', JSON.stringify({ name: 'example', version: '2.0.0' }));
    await expect(app.generate()).rejects.toThrow('Lockfile version mismatch');
  });
});
