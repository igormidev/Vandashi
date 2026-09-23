import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
import { CodexAgent } from '../src/infrastructure/codex/client';

const threadId = process.env['VANDASHI_CODEX_IMAGE_THREAD'];
it.skipIf(!threadId)(
  'restores a real completed Codex image capability without running inference',
  async () => {
    if (!threadId) throw new Error('Choose an existing Codex image-generation conversation.');
    const agent = new CodexAgent();
    try {
      const history = await agent.readThread(threadId);
      const images = history.messages.flatMap((message) => message.generatedImages ?? []);
      expect(images.length).toBeGreaterThan(0);
      let verified = 0;
      for (const path of images) {
        const allowed = await agent.generatedImage(path);
        if (!allowed) continue;
        expect((await readFile(allowed)).subarray(0, 8)).toEqual(
          Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        );
        verified++;
      }
      expect(verified).toBeGreaterThan(0);
    } finally {
      agent.dispose();
    }
  },
  30_000,
);
