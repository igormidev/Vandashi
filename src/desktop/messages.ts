import { normalizeLocale } from '../domain/locales';
import { appMessageEnglish } from '../domain/messages';
import { nativeMessagesEn, type NativeMessages } from '../domain/native-messages';
import { nativeMessageCatalogs } from '../domain/native-translations/catalogs';
export { nativeMessagesEn } from '../domain/native-messages';
export type { NativeMessageId, NativeMessages } from '../domain/native-messages';

/** Pure and synchronous: callers pass their cached saved locale, never a renderer translation instance. */
export function nativeMessages(locale: unknown): NativeMessages {
  return nativeMessageCatalogs[normalizeLocale(locale)];
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
