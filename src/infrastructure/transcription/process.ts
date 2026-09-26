import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { AppFault } from '../../domain/diagnostics';
import { terminateProcess } from '../media/runtime';

/** A cancelled operation owns its child until close, including descendant shutdown on Windows. */
export async function runTranscriptionProcess(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv,
  signal: AbortSignal,
  onLine?: (line: string) => void,
): Promise<string> {
  signal.throwIfAborted();
  const child = spawn(command, args, {
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let failure: unknown;
  let output = '';
  let pending = '';
  let stderr = '';
  const decoder = new StringDecoder('utf8');
  const errors = new StringDecoder('utf8');
  const abort = (): void => {
    failure = new AppFault({ id: 'appTranscriptionCancelled' });
    void terminateProcess(child);
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    return await new Promise<string>((resolve, reject) => {
      child.stdout.on('data', (chunk: Buffer) => {
        try {
          const text = decoder.write(chunk);
          if (onLine) {
            pending += text;
            if (pending.length > 32_000_000) throw new AppFault({ id: 'appTranscriptionFailed' });
            let index: number;
            while ((index = pending.indexOf('\n')) >= 0) {
              const line = pending.slice(0, index);
              pending = pending.slice(index + 1);
              if (line.trim()) onLine(line);
            }
          } else output = (output + text).slice(-32_000);
        } catch (error) {
          failure = error;
          void terminateProcess(child);
        }
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr = (stderr + errors.write(chunk)).slice(-16_000);
      });
      child.once('error', (error) => {
        failure = error;
      });
      child.once('close', (code) => {
        const tail = decoder.end();
        if (onLine) pending += tail;
        else output = (output + tail).slice(-32_000);
        stderr = (stderr + errors.end()).slice(-16_000);
        if (failure)
          reject(failure instanceof Error ? failure : new AppFault({ id: 'appTranscriptionFailed' }));
        else if (code !== 0) reject(new AppFault({ id: 'appTranscriptionFailed' }, stderr));
        else if (pending.trim()) reject(new AppFault({ id: 'appTranscriptionFailed' }));
        else resolve(output);
      });
      if (signal.aborted) abort();
    });
  } finally {
    signal.removeEventListener('abort', abort);
    await terminateProcess(child);
  }
}
