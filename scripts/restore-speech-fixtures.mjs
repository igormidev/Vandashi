import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, URL, URLSearchParams } from 'node:url';
import { parseArgs } from 'node:util';

const fixtureDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../tests/fixtures/speech');
const manifest = JSON.parse(await readFile(join(fixtureDirectory, 'manifest.json'), 'utf8'));
const { values } = parseArgs({
  options: { download: { type: 'boolean', default: false }, output: { type: 'string' } },
});
const directory = values.output ? resolve(values.output) : fixtureDirectory;
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function download(fixture) {
  const query = new URLSearchParams({
    dataset: manifest.dataset,
    config: fixture.config,
    split: 'train',
    revision: manifest.revision,
  });
  const response = await globalThis.fetch(`https://datasets-server.huggingface.co/first-rows?${query}`, {
    signal: globalThis.AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Dataset metadata download failed: ${response.status}`);
  const metadata = await response.json();
  const row = metadata.rows.find((entry) => entry.row_idx === fixture.row)?.row;
  const address = row?.audio?.[0]?.src;
  if (row?.path !== fixture.path || typeof address !== 'string') throw new Error('Fixture row has changed.');
  const url = new URL(address);
  if (
    url.origin !== 'https://datasets-server.huggingface.co' ||
    !url.pathname.includes(`/--/${manifest.revision}/--/`)
  )
    throw new Error('The dataset server is no longer serving the pinned revision.');
  const audio = await globalThis.fetch(url, { signal: globalThis.AbortSignal.timeout(30_000) });
  if (!audio.ok || !audio.body) throw new Error(`Speech download failed: ${audio.status}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of audio.body) {
    size += chunk.byteLength;
    if (size > fixture.bytes) throw new Error(`Unexpected speech size: ${fixture.file}`);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

try {
  for (const fixture of manifest.fixtures) {
    if (!/^[a-z]+\.wav$/.test(fixture.file)) throw new Error('Invalid fixture filename.');
    const bytes = values.download ? await download(fixture) : await readFile(join(directory, fixture.file));
    if (bytes.length !== fixture.bytes || hash(bytes) !== fixture.sha256)
      throw new Error(`Speech checksum/size mismatch: ${fixture.file}`);
    if (values.download) {
      await mkdir(directory, { recursive: true });
      const target = join(directory, fixture.file);
      const temporary = `${target}.${process.pid}.partial`;
      try {
        await writeFile(temporary, bytes, { flag: 'wx' });
        await rename(temporary, target);
      } finally {
        await rm(temporary, { force: true });
      }
    }
    process.stdout.write(`Verified ${fixture.file}: ${fixture.bytes} bytes, ${fixture.sha256}\n`);
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
