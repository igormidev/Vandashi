import { join } from 'node:path';
import { appMessagesEn } from '../domain/messages';
import type { AppMessage } from '../domain/messages';
import type { ChatCheckpoint, ChatMessage, FileChange } from '../domain/models';
import type { GitPort } from '../domain/storage';

export function repositoryHeads(git: GitPort, repositories: string[]): Promise<Record<string, string>> {
  return Promise.all(
    repositories.map(async (repository): Promise<[string, string]> => [
      repository,
      await git.head(repository),
    ]),
  ).then(Object.fromEntries);
}

/** Describes the verified net change, including commits made directly by the agent. */
export async function turnReceipt(git: GitPort, checkpoint: ChatCheckpoint): Promise<ChatMessage> {
  const entries = Object.entries(checkpoint.heads);
  const after = checkpoint.postHeads;
  if (!after || entries.length === 0) throw new Error('The turn has no verified repository checkpoint.');
  const files: FileChange[] = [];
  for (const [repository, before] of entries) {
    const revision = after[repository];
    if (!revision) throw new Error('A repository is missing from the saved turn checkpoint.');
    const changes = await git.diffBetween(repository, before, revision);
    files.push(...changes.map((file) => ({ ...file, path: join(repository, file.path) })));
  }
  for (const [repository] of entries)
    if ((await git.status(repository)).dirty || (await git.head(repository)) !== after[repository])
      throw new Error('The workspace changed while its saved changes were being verified.');
  const appMessage: AppMessage = { id: files.length > 0 ? 'turnSaved' : 'turnUnchanged' };
  return {
    id: `receipt:${checkpoint.threadId}:${checkpoint.turnId}`,
    role: 'tool',
    text: appMessagesEn[appMessage.id],
    appMessage,
    turnId: checkpoint.turnId,
    files,
    createdAt: new Date().toISOString(),
  };
}
