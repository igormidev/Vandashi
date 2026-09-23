import { lstat, realpath } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import type { ChatMessage } from '../../domain/models';

interface Artifact {
  home: string;
  threadId: string;
  itemId: string;
}

/** Only the adapter's completed provider items may register an artifact, never renderer Markdown. */
export class CodexImageArtifacts {
  private readonly known = new Map<string, Artifact>();

  observe(home: string | undefined, threadId: string, message: ChatMessage): void {
    if (
      !home ||
      !isAbsolute(home) ||
      message.role !== 'tool' ||
      !/^[A-Za-z0-9_-]+$/.test(threadId) ||
      !/^[A-Za-z0-9_-]+$/.test(message.id)
    )
      return;
    const expected = join(home, 'generated_images', threadId, `${message.id}.png`);
    for (const path of message.generatedImages ?? [])
      if (isAbsolute(path) && resolve(path) === expected)
        this.known.set(path, { home, threadId, itemId: message.id });
  }

  async resolve(path: string): Promise<string | null> {
    const artifact = this.known.get(path);
    if (!artifact) return null;
    try {
      const homeStat = await lstat(artifact.home);
      if (homeStat.isSymbolicLink() || !homeStat.isDirectory()) return null;
      const home = await realpath(artifact.home);
      let current = home;
      const parts = ['generated_images', artifact.threadId, `${artifact.itemId}.png`];
      for (const [index, part] of parts.entries()) {
        current = join(current, part);
        const metadata = await lstat(current);
        if (
          metadata.isSymbolicLink() ||
          (index === parts.length - 1 ? !metadata.isFile() : !metadata.isDirectory())
        )
          return null;
      }
      if ((await realpath(current)) !== current) return null;
      // The media URL uses the canonical path, which may differ across /var or /tmp system aliases.
      this.known.set(current, artifact);
      return current;
    } catch {
      return null;
    }
  }
}
