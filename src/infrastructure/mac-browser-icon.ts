import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { mkdtemp, open, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, extname, isAbsolute, join, relative, sep } from 'node:path';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const contained = (root: string, path: string) => {
  const child = relative(root, path);
  return child !== '..' && !child.startsWith(`..${sep}`) && !isAbsolute(child);
};

async function resourceBytes(bundle: string, file: string): Promise<Buffer | null> {
  const root = await realpath(bundle);
  const resources = await realpath(join(root, 'Contents/Resources'));
  const path = await realpath(join(resources, file));
  if (!contained(root, resources) || !contained(resources, path)) return null;
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size < 1 || before.size > 8_000_000) return null;
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) return null;
      offset += bytesRead;
    }
    const after = await handle.stat();
    const current = await stat(path);
    if (
      (['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'] as const).some(
        (key) => before[key] !== after[key] || before[key] !== current[key],
      ) ||
      (await realpath(join(root, 'Contents/Resources', file))) !== path
    )
      return null;
    return bytes;
  } finally {
    await handle.close();
  }
}

async function convertIcon(input: string, output: string): Promise<void> {
  await execute('/usr/bin/sips', ['-s', 'format', 'png', '-Z', '64', input, '--out', output], {
    timeout: 3000,
    maxBuffer: 64_000,
  });
}

/** Read the app's declared image, not the generic .app MIME-type icon. */
export async function macBrowserIcon(
  bundle: string,
  declaredFile: unknown,
  convert = convertIcon,
): Promise<string | null> {
  if (typeof declaredFile !== 'string' || !declaredFile || basename(declaredFile) !== declaredFile)
    return null;
  let temporary: string | undefined;
  try {
    const file = extname(declaredFile) ? declaredFile : `${declaredFile}.icns`;
    const bytes = await resourceBytes(bundle, file);
    if (!bytes) return null;
    temporary = await mkdtemp(join(tmpdir(), 'vandashi-browser-icon-'));
    const input = join(temporary, 'input.icns');
    const output = join(temporary, 'icon.png');
    await writeFile(input, bytes);
    await convert(input, output);
    const metadata = await stat(output);
    if (!metadata.isFile() || metadata.size < 24 || metadata.size > 64_000) return null;
    const png = await readFile(output);
    if (
      !png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      png.readUInt32BE(16) < 1 ||
      png.readUInt32BE(16) > 64 ||
      png.readUInt32BE(20) < 1 ||
      png.readUInt32BE(20) > 64
    )
      return null;
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch {
    return null;
  } finally {
    if (temporary) await rm(temporary, { recursive: true, force: true });
  }
}
