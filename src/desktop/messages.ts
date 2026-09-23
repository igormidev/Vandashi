import { defaultLocale, normalizeLocale } from '../domain/locales';
import type { Locale } from '../domain/locales';
import { appMessageEnglish } from '../domain/messages';

/** Native UI source catalog. Translations are added after feature verification. */
export const nativeMessagesEn = {
  closeTitle: 'Unsaved work',
  closeMessage: 'Close Vandashi and discard unsaved work?',
  closeDetail: 'An edit or background operation is still in progress.',
  closeKeep: 'Keep working',
  closeDiscard: 'Close anyway',
  imagesFilter: 'Images',
  videoFilter: 'Video',
} as const;
export type NativeMessageId = keyof typeof nativeMessagesEn;
export type NativeMessages = Readonly<Record<NativeMessageId, string>>;

const resources: Partial<Record<Locale, NativeMessages>> = { [defaultLocale]: nativeMessagesEn };

/** Pure and synchronous: callers pass their cached saved locale, never a renderer translation instance. */
export function nativeMessages(locale: unknown): NativeMessages {
  return resources[normalizeLocale(locale)] ?? nativeMessagesEn;
}

/** English compatibility fallback for persisted recovery notices and older host call sites. */
export const desktopMessages = {
  ...nativeMessagesEn,
  recovery: (name: string, backupPath: string | null) =>
    appMessageEnglish(
      backupPath
        ? { id: 'recoveredDocument', params: { name, path: backupPath } }
        : { id: 'restoredDocument', params: { name } },
    ),
};
