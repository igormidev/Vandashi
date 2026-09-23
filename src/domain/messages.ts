import { coreMessagesEn } from './messages/core-en';
import { applicationMessagesEn } from './messages/application-en';
import { codexMessagesEn } from './messages/codex-en';
import { storageMessagesEn } from './messages/storage-en';
import { desktopMessagesEn } from './messages/desktop-en';
import { mediaMessagesEn } from './messages/media-en';

/** App-authored messages remain distinct from raw agent output and user content. */
export const appMessagesEn = {
  ...applicationMessagesEn,
  ...codexMessagesEn,
  ...storageMessagesEn,
  ...desktopMessagesEn,
  ...mediaMessagesEn,
  ...coreMessagesEn,
} as const;

type Placeholders<Text extends string> = Text extends `${string}{{${infer Key}}}${infer Rest}`
  ? Key | Placeholders<Rest>
  : never;
export type AppMessageId = keyof typeof appMessagesEn;
export type AppMessage = {
  [Id in AppMessageId]: [Placeholders<(typeof appMessagesEn)[Id]>] extends [never]
    ? { id: Id }
    : { id: Id; params: Record<Placeholders<(typeof appMessagesEn)[Id]>, string | number> };
}[AppMessageId];

/** This English fallback is for logs and persisted history, not the selected UI language. */
export function appMessageEnglish(message: AppMessage): string {
  const template: string = appMessagesEn[message.id];
  return template.replace(/\{\{(\w+)\}\}/g, (_match: string, key: string) => {
    const params = 'params' in message ? (message.params as Record<string, string | number>) : {};
    return String(params[key] ?? '');
  });
}
