import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { z } from 'zod';
import { AgentError } from '../../domain/agent';
import { resolveCodexBinary } from './binary';
import { codexLaunch } from './launch';
import { shutdownProcess } from './shutdown';

const envelope = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.object({ code: z.number(), message: z.string() }).optional(),
});
export interface RpcNotification {
  method: string;
  params: unknown;
}
export interface RpcClient {
  request(method: string, params: unknown): Promise<unknown>;
  subscribe(listener: (event: RpcNotification) => void): () => void;
  onFailure(listener: (error: Error) => void): () => void;
  close(): Promise<void>;
}
interface Pending {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: ReturnType<typeof setTimeout>;
}
export class RpcError extends Error {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(message);
    this.name = 'RpcError';
  }
}
export class JsonLineDecoder {
  private buffer = '';
  constructor(private readonly maxBytes = 32 * 1024 * 1024) {}
  push(chunk: string): string[] {
    this.buffer += chunk;
    if (Buffer.byteLength(this.buffer) > this.maxBytes)
      throw new AgentError('protocol', { id: 'codexMessageTooLarge' });
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';
    return lines.filter((line) => line.trim().length > 0);
  }
}
export class CodexTransport implements RpcClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string | number, Pending>();
  private readonly listeners = new Set<(event: RpcNotification) => void>();
  private readonly failures = new Set<(error: Error) => void>();
  private readonly decoder = new JsonLineDecoder();
  private serial = 0;
  private closed = false;
  private stderr = '';
  private readonly processClosed: Promise<void>;
  private shutdown: Promise<void> | null = null;
  constructor(
    binary = resolveCodexBinary(),
    private readonly timeoutMs = 30_000,
  ) {
    const launch = codexLaunch(binary, ['app-server', '--stdio']);
    this.child = spawn(launch.command, launch.args, {
      stdio: 'pipe',
      windowsHide: true,
      detached: process.platform !== 'win32',
      env: launch.environment,
    });
    this.processClosed = new Promise((resolve) => {
      this.child.once('close', () => {
        resolve();
      });
    });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      try {
        for (const line of this.decoder.push(chunk)) this.receive(line);
      } catch (error) {
        this.fail(error instanceof Error ? error : new Error(String(error)));
        void this.close();
      }
    });
    this.child.stderr.on('data', (chunk: string) => {
      this.stderr = (this.stderr + chunk).slice(-4096);
    });
    this.child.on('error', (error) => {
      this.fail(new AgentError('unavailable', { id: 'codexStartFailed' }, error.message));
    });
    this.child.stdin.on('error', (error) => {
      this.fail(error);
    });
    this.child.on('exit', (code) => {
      this.fail(
        new AgentError('unavailable', { id: 'codexExited', params: { code: String(code) } }, this.stderr),
      );
    });
  }
  async initialize(): Promise<unknown> {
    const result = await this.request('initialize', {
      clientInfo: { name: 'vandashi', title: 'Vandashi', version: '0.1.0' },
      capabilities: { experimentalApi: true, requestAttestation: false },
    });
    this.write({ method: 'initialized' });
    return result;
  }
  request(method: string, params: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new AgentError('unavailable', { id: 'codexDisconnected' }));
    const id = ++this.serial;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new AgentError('timeout', { id: 'codexRequestTimeout', params: { method } }));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ id, method, params });
    });
  }
  subscribe(listener: (event: RpcNotification) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  onFailure(listener: (error: Error) => void): () => void {
    this.failures.add(listener);
    return () => this.failures.delete(listener);
  }
  close(): Promise<void> {
    this.fail(new AgentError('unavailable', { id: 'codexConnectionClosed' }));
    this.shutdown ??= shutdownProcess(this.child, this.processClosed);
    return this.shutdown;
  }
  private write(message: unknown): void {
    if (!this.closed) this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }
  private receive(line: string): void {
    const message = envelope.parse(JSON.parse(line));
    if (message.method) {
      const event = { method: message.method, params: message.params };
      if (message.id !== undefined) this.rejectServerRequest(message.id, event);
      else for (const listener of this.listeners) listener(event);
      return;
    }
    if (message.id === undefined) return;
    const request = this.pending.get(message.id);
    if (!request) return;
    this.pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new RpcError(message.error.code, message.error.message));
    else request.resolve(message.result);
  }
  private rejectServerRequest(id: string | number, event: RpcNotification): void {
    if (event.method === 'currentTime/read') {
      this.write({ id, result: { currentTimeAt: Math.floor(Date.now() / 1000) } });
      return;
    }
    if (event.method === 'item/tool/requestUserInput') {
      this.write({ id, result: { answers: {} } });
    } else if (
      event.method === 'item/commandExecution/requestApproval' ||
      event.method === 'item/fileChange/requestApproval'
    ) {
      this.write({ id, result: { decision: 'decline' } });
    } else {
      this.write({
        id,
        error: {
          code: -32601,
          message: 'This request is not supported by Vandashi. Ask the user in the conversation instead.',
        },
      });
    }
    for (const listener of this.listeners) listener({ method: 'vandashi/request-declined', params: event });
  }
  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
    for (const listener of this.failures) listener(error);
  }
}
