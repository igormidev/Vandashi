import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { writeFile, rename, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { URL } from 'node:url';
import { verifyPayload } from './native-source-manifest.mjs';

async function download(entry, destination) {
  const temporary = `${destination}.write-${process.pid}`;
  try {
    const response = await globalThis.fetch(entry.url, {
      signal: globalThis.AbortSignal.timeout(120_000),
    });
    if (!response.ok || !response.body || new URL(response.url).protocol !== 'https:') {
      throw new Error(`Source download failed (${response.status}): ${entry.url}`);
    }
    const chunks = [];
    const hash = createHash('sha256');
    let total = 0;
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > entry.size) throw new Error(`Source response exceeds locked size: ${entry.file}`);
      hash.update(chunk);
      chunks.push(chunk);
    }
    if (total !== entry.size || hash.digest('hex') !== entry.sha256) {
      throw new Error(`Downloaded source checksum/size mismatch: ${entry.file}`);
    }
    await writeFile(temporary, Buffer.concat(chunks), { flag: 'wx' });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function collectSources(manifest, cache, offline) {
  await mkdir(cache, { recursive: true });
  let next = 0;
  let completed = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      for (;;) {
        const entry = manifest.artifacts[next++];
        if (!entry) return;
        const destination = join(cache, entry.file);
        if (!(await verifyPayload(destination, entry))) {
          if (offline) throw new Error(`Offline source missing: ${entry.file}`);
          for (let attempt = 0; ; attempt += 1) {
            try {
              await download(entry, destination);
              break;
            } catch (error) {
              if (attempt >= 2 || /checksum|size/.test(error.message)) throw error;
              await setTimeout(500 * (attempt + 1));
            }
          }
        }
        completed += 1;
        if (completed % 50 === 0 || completed === manifest.artifacts.length) {
          console.log(`Verified native sources: ${completed}/${manifest.artifacts.length}`);
        }
      }
    }),
  );
}
