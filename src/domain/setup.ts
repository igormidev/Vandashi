import type { AppMessage } from './messages';

import { setupTarget } from './system-prompts/setup';
export { setupTarget } from './system-prompts/setup';

export function installationMessage(id: string): AppMessage | undefined {
  const target = setupTarget(`setup:${id}`);
  return target ? { id: 'appInstallDependency', params: { name: target.name } } : undefined;
}

export { setupPrompt } from './system-prompts/setup';
