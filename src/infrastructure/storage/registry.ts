import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defaultSettings, scopeKey } from '../../domain/defaults';
import type { AppState, ChatSession, Scope, Settings } from '../../domain/models';
import { atomicWrite, errorCode, SerialQueue } from './files';
import { registrySchema, sessionSchema, settingsSchema } from './schemas';
import { z } from 'zod';

export class Registry {
  private readonly queue = new SerialQueue();
  constructor(readonly directory: string) {}

  async state(): Promise<AppState> {
    await mkdir(this.directory, { recursive: true });
    try {
      return registrySchema.parse(JSON.parse(await readFile(join(this.directory, 'registry.json'), 'utf8')));
    } catch (error) {
      if (errorCode(error) !== 'ENOENT')
        throw new Error('The workspace registry cannot be read. Your project files are unchanged.', {
          cause: error,
        });
      return { brands: [], lastBrandId: null, settings: structuredClone(defaultSettings) };
    }
  }

  async update(operation: (state: AppState) => AppState): Promise<void> {
    await this.queue.run(async () => {
      const state = registrySchema.parse(operation(await this.state()));
      await atomicWrite(join(this.directory, 'registry.json'), `${JSON.stringify(state, null, 2)}\n`);
    });
  }

  async settings(settings: Settings): Promise<void> {
    const valid = settingsSchema.parse(settings);
    await this.update((state) => ({ ...state, settings: valid }));
  }

  private async allSessions(): Promise<ChatSession[]> {
    try {
      return z
        .array(sessionSchema)
        .parse(JSON.parse(await readFile(join(this.directory, 'sessions.json'), 'utf8')));
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return [];
      throw error;
    }
  }

  async sessions(scope: Scope): Promise<ChatSession[]> {
    return (await this.allSessions())
      .filter((session) => scopeKey(session.scope) === scopeKey(scope))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getSession(id: string): Promise<ChatSession> {
    const session = (await this.allSessions()).find((item) => item.id === id);
    if (!session) throw new Error('This conversation was not found.');
    return session;
  }

  async saveSession(input: ChatSession): Promise<void> {
    const session = sessionSchema.parse(input);
    await this.queue.run(async () => {
      const items = (await this.allSessions()).filter((item) => item.id !== session.id);
      items.push(session);
      await atomicWrite(join(this.directory, 'sessions.json'), `${JSON.stringify(items, null, 2)}\n`);
    });
  }
}
