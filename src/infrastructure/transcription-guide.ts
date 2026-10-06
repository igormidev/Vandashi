import { renderSystemPrompt } from '../domain/system-prompts/templates';
import { dirname } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
const powershell = (value: string) => "'" + value.replaceAll("'", "''") + "'";

/** App-owned instructions stay outside user repositories and are refreshed with each app release. */
export async function writeTranscriptionGuide(input: {
  path: string;
  executable: string;
  cli: string;
  cache: string;
  worker: string;
}): Promise<void> {
  const args = [
    input.executable,
    input.cli,
    '--cache',
    input.cache,
    '--worker',
    input.worker,
    '--profile',
    dirname(input.cache),
    '--offline',
  ];
  const command =
    process.platform === 'win32'
      ? "$env:ELECTRON_RUN_AS_NODE='1'; & " + args.map(powershell).join(' ')
      : 'ELECTRON_RUN_AS_NODE=1 ' + args.map(quote).join(' ');
  await mkdir(dirname(input.path), { recursive: true });
  await writeFile(input.path, renderSystemPrompt('transcription-7', { command }), { mode: 0o600 });
}
