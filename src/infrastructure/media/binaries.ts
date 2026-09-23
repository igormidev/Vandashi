import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

type BinaryName = 'ffmpeg' | 'ffprobe';

/** Finder and desktop launchers omit shell PATH entries; keep explicit overrides authoritative. */
export function resolveMediaBinary(
  name: BinaryName,
  environment: NodeJS.ProcessEnv,
  platform = process.platform,
): string {
  const configured =
    environment[`HYPERFRAMES_${name.toUpperCase()}_PATH`]?.trim() ||
    environment[`${name.toUpperCase()}_PATH`]?.trim();
  if (configured) return configured;
  const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === 'path');
  const inherited = pathKey ? environment[pathKey] : undefined;
  const directories = [
    ...(inherited?.split(platform === 'win32' ? ';' : delimiter) ?? []),
    ...(platform === 'win32' ? [] : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/snap/bin']),
  ];
  for (const directory of new Set(directories.filter(Boolean))) {
    const candidate = join(directory, `${name}${platform === 'win32' ? '.exe' : ''}`);
    try {
      accessSync(candidate, platform === 'win32' ? constants.F_OK : constants.X_OK);
      return candidate;
    } catch {
      /* Try the next executable directory. */
    }
  }
  return name;
}
