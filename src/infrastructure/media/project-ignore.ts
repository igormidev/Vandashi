import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';

const generated = [
  '.thumbnails/',
  'renders/',
  '.cache/',
  '.transcode-cache/',
  '.waveform-cache/',
  '.hyperframes/backup/',
  '.hyperframes/cache/',
];

/** Keep authored Studio manifests tracked while excluding only known generated output. */
export async function ensureProjectIgnore(projectPath: string): Promise<void> {
  const file = await open(
    join(projectPath, '.gitignore'),
    constants.O_RDWR | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW,
    0o644,
  );
  try {
    const source = await file.readFile('utf8');
    const existing = new Set(source.split(/\r?\n/u).map((line) => line.trim().replace(/^\//u, '')));
    const missing = generated.filter((pattern) => !existing.has(pattern));
    if (!missing.length) return;
    await file.write(
      `${source.endsWith('\n') || !source ? '' : '\n'}\n# Generated Hyperframes output\n${missing.map((pattern) => `/${pattern}`).join('\n')}\n`,
    );
  } finally {
    await file.close();
  }
}
