import { accessSync, constants } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { AgentError } from '../../domain/agent';

function executable(candidate: string): boolean {
  try {
    accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
export function windowsNativeCandidates(directory: string, architecture: string): string[] {
  const target = architecture === 'arm64' ? 'aarch64-pc-windows-msvc' : 'x86_64-pc-windows-msvc';
  const packageName = architecture === 'arm64' ? 'codex-win32-arm64' : 'codex-win32-x64';
  const roots = [
    join(directory, 'node_modules', '@openai', packageName),
    join(directory, 'node_modules', '@openai', 'codex', 'node_modules', '@openai', packageName),
    join(directory, 'node_modules', '@openai', 'codex'),
  ];
  return [
    join(directory, 'codex.exe'),
    ...roots.flatMap((root) => [
      join(root, 'vendor', target, 'bin', 'codex.exe'),
      join(root, 'vendor', target, 'codex', 'codex.exe'),
    ]),
  ];
}
export function resolveCodexBinary(): string {
  const configured = process.env['VANDASHI_CODEX_PATH'];
  if (configured && !/\.(cmd|bat)$/i.test(configured)) return configured;
  const paths = (process.env['PATH'] ?? '').split(delimiter).filter(Boolean);
  if (process.platform === 'win32') {
    const appData = process.env['APPDATA'];
    const localData = process.env['LOCALAPPDATA'];
    const directories = [
      ...(configured ? [dirname(configured)] : []),
      ...paths,
      ...(appData ? [join(appData, 'npm')] : []),
      ...(localData ? [join(localData, 'Microsoft', 'WinGet', 'Links')] : []),
    ];
    for (const directory of directories)
      for (const candidate of windowsNativeCandidates(directory, process.arch))
        if (executable(candidate)) return candidate;
    if (configured)
      throw new AgentError(
        'unavailable',
        'Set VANDASHI_CODEX_PATH to the native codex.exe executable, not a command shell wrapper.',
      );
    return 'codex.exe';
  }
  const candidates = [
    ...paths.map((directory) => join(directory, 'codex')),
    '/opt/homebrew/bin/codex',
    '/usr/local/bin/codex',
    join(homedir(), '.local/bin/codex'),
  ];
  return candidates.find(executable) ?? 'codex';
}
