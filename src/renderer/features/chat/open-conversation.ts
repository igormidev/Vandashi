import type { DesktopApi, OpenedChat } from '../../../domain/api';
import type { Scope } from '../../../domain/models';
import { scopeKey } from '../../../domain/defaults';

const pending = new WeakMap<DesktopApi, Map<string, Promise<OpenedChat>>>();
/** React StrictMode may repeat effects while the first IPC request is still active. */
export function openConversation(
  api: DesktopApi,
  input: { scope: Scope; topic: string; title: string },
): Promise<OpenedChat> {
  const key = `${scopeKey(input.scope)}:${input.topic}`;
  let requests = pending.get(api);
  if (!requests) {
    requests = new Map();
    pending.set(api, requests);
  }
  const existing = requests.get(key);
  if (existing) return existing;
  const target = requests;
  const request = api.openChat(input).finally(() => {
    target.delete(key);
  });
  target.set(key, request);
  return request;
}
