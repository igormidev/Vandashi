import type { ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { StudioInfo } from '../../domain/models';
import { launchCli, terminateProcess, type MediaRuntime } from './runtime';

const lifecycleSchema = z.object({
  schemaVersion: z.literal(1),
  operation: z.literal('start'),
  ok: z.literal(true),
  result: z.object({
    projectName: z.string().min(1),
    projectDir: z.string(),
    host: z.literal('127.0.0.1'),
    port: z.number().int().min(1).max(65535),
    ready: z.literal(true),
  }),
});

export interface StudioProcess {
  info: StudioInfo;
  baseUrl: string;
  projectId: string;
  child: ChildProcess;
}

/** URLs are reconstructed from validated loopback state, never trusted from stdout. */
export function parseStudioReady(line: string, expectedProject: string): Omit<StudioProcess, 'child'> | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  const parsed = lifecycleSchema.safeParse(value);
  if (!parsed.success) return null;
  const result = parsed.data.result;
  if (resolve(result.projectDir) !== resolve(expectedProject))
    throw new Error('Hyperframes opened a different project.');
  if (
    /[\\/:]/.test(result.projectName) ||
    Array.from(result.projectName).some((character) => character.charCodeAt(0) < 32) ||
    result.projectName === '.' ||
    result.projectName === '..'
  )
    throw new Error('Hyperframes returned an invalid project identifier.');
  const baseUrl = `http://127.0.0.1:${String(result.port)}`;
  const projectId = encodeURIComponent(result.projectName);
  return {
    baseUrl,
    projectId,
    info: {
      url: `${baseUrl}/#project/${projectId}`,
      previewUrl: `${baseUrl}/api/projects/${projectId}/preview`,
      projectPath: resolve(expectedProject),
    },
  };
}

async function availablePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((error) => {
        if (error) reject(error);
        else if (address === null || typeof address === 'string')
          reject(new Error('Unable to allocate a Studio port.'));
        else resolvePort(address.port);
      });
    });
  });
}

export async function startStudioProcess(runtime: MediaRuntime, projectPath: string): Promise<StudioProcess> {
  const port = await availablePort();
  const child = launchCli(runtime, [
    'preview',
    resolve(projectPath),
    '--foreground',
    '--force-new',
    '--no-open',
    '--json',
    '--port',
    String(port),
  ]);
  try {
    return await new Promise<StudioProcess>((resolveStudio, reject) => {
      let pending = '';
      let diagnostics = '';
      const timer = setTimeout(() => {
        reject(new Error(`Hyperframes Studio did not become ready. ${diagnostics}`.trim()));
      }, runtime.startupTimeoutMs);
      child.stderr?.on('data', (chunk: Buffer) => {
        diagnostics = (diagnostics + chunk.toString()).slice(-2_000);
      });
      child.stdout?.on('data', (chunk: Buffer) => {
        pending += chunk.toString();
        if (pending.length > 1_000_000) {
          clearTimeout(timer);
          reject(new Error('Hyperframes returned an oversized startup response.'));
          return;
        }
        const lines = pending.split('\n');
        pending = lines.pop() ?? '';
        for (const line of lines) {
          try {
            const result = parseStudioReady(line, projectPath);
            if (result !== null) {
              clearTimeout(timer);
              resolveStudio({ ...result, child });
            }
          } catch (error) {
            clearTimeout(timer);
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        }
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        reject(new Error(diagnostics.trim() || `Hyperframes Studio exited (${String(code)}).`));
      });
    });
  } catch (error) {
    await terminateProcess(child);
    throw error;
  }
}
