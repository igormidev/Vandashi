import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { CodexTransport } from '../src/infrastructure/codex/transport';
import { loadCapabilities } from '../src/infrastructure/codex/discovery';

it.skipIf(process.env['VANDASHI_CHAT_SKILLS_LIVE'] !== '1')(
  'discovers the real installed enabled Codex skill names without a turn or configuration mutation',
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'vandashi-skills-live-'));
    const client = new CodexTransport();
    try {
      await client.initialize();
      const capabilities = await loadCapabilities(client, directory);
      expect(capabilities.skills.length).toBeGreaterThan(0);
      expect(capabilities.skills.every((skill) => !!skill.path.trim() && !!skill.name.trim())).toBe(true);
      const rediscovered = await loadCapabilities(client, directory);
      expect(rediscovered.skills.every((skill) => !!skill.path.trim() && !!skill.name.trim())).toBe(true);
      expect(rediscovered.skills.some((skill) => skill.name === 'vandashi-create-assets')).toBe(true);
    } finally {
      await client.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
  30_000,
);
