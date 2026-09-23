import { closeSync, openSync, readSync } from 'node:fs';
import { delimiter, dirname, isAbsolute } from 'node:path';

// Electron provides a supported Node runtime even when Finder's PATH omits npm's Node binary.
// Clear Electron's private launch switch before the vendor launcher spawns Codex or its tools.
const bootstrap = `delete process.env.ELECTRON_RUN_AS_NODE;
const { pathToFileURL } = await import('node:url');
await import(pathToFileURL(process.argv[1]).href);`;

function usesNode(binary: string): boolean {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(binary, 'r');
    const header = Buffer.alloc(512);
    const length = readSync(descriptor, header, 0, header.length, 0);
    return /^#![^\r\n]*(?:\/|\s)node(?:\s|$)/u.test(header.toString('utf8', 0, length).split('\n')[0] ?? '');
  } catch {
    return false;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

interface CodexLaunch {
  command: string;
  args: string[];
  environment: NodeJS.ProcessEnv;
}

export function codexLaunch(
  binary: string,
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
  nodePath = process.execPath,
): CodexLaunch {
  const existing = (environment['PATH'] ?? '').split(delimiter).filter(Boolean);
  const extra =
    process.platform === 'win32' ? [] : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'];
  const env = {
    ...environment,
    PATH: [...new Set([...existing, ...(isAbsolute(binary) ? [dirname(binary)] : []), ...extra])].join(
      delimiter,
    ),
  };
  if (!usesNode(binary)) return { command: binary, args, environment: env };
  return {
    command: nodePath,
    args: ['--input-type=module', '--eval', bootstrap, binary, ...args],
    environment: { ...env, ELECTRON_RUN_AS_NODE: '1' },
  };
}
