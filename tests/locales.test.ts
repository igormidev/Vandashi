import { describe, expect, it } from 'vitest';
import { defaultSettings } from '../src/domain/defaults';
import {
  availableLocales,
  defaultLocale,
  isLocale,
  normalizeLocale,
  supportedLocales,
} from '../src/domain/locales';
import { desktopMessages, nativeMessages, nativeMessagesEn } from '../src/desktop/messages';
import { parseInvocation } from '../src/desktop/validation';
import { settingsSchema } from '../src/infrastructure/storage/schemas';
import { nativeMessageCatalogs } from '../src/domain/native-translations/catalogs';

describe('shared locale policy', () => {
  it.each([
    ['en-US', 'en'],
    ['ja-JP', 'ja'],
    ['fr-CA', 'fr'],
    ['es-MX', 'es'],
    ['de-DE', 'de'],
    ['ko-KR', 'ko'],
    ['it-IT', 'it'],
    [' PT_br ', 'pt-BR'],
    ['pt', 'pt-BR'],
    ['pt-PT', 'pt-BR'],
  ])('normalizes %s into the supported %s family', (input, expected) => {
    expect(normalizeLocale(input)).toBe(expected);
  });

  it.each([undefined, null, 123, {}, [], '', 'ar', 'pt--BR', 'en-💥', 'x'.repeat(101)])(
    'uses the English default for malformed or unsupported input %#',
    (input) => {
      expect(normalizeLocale(input)).toBe(defaultLocale);
    },
  );

  it('shares the same canonical IDs between persistence, IPC, and the domain model', () => {
    expect(supportedLocales).toEqual(['en', 'ja', 'fr', 'es', 'de', 'ko', 'pt-BR', 'it']);
    for (const locale of supportedLocales) {
      const settings = { ...defaultSettings, locale };
      expect(isLocale(locale)).toBe(true);
      expect(normalizeLocale(locale)).toBe(locale);
      expect(settingsSchema.parse(settings)).toEqual(settings);
      expect(parseInvocation('settings', [settings])).toEqual({ method: 'settings', args: [settings] });
    }
    expect(isLocale('pt-br')).toBe(false);
    expect(() => settingsSchema.parse({ ...defaultSettings, locale: 'pt-br' })).toThrow();
    expect(() => parseInvocation('settings', [{ ...defaultSettings, locale: 'pt-br' }])).toThrow();
  });
});

describe('synchronous native language selection', () => {
  it('resolves reviewed catalogs from the cached saved locale with an English fallback', () => {
    for (const locale of availableLocales)
      expect(nativeMessages(locale)).toEqual(nativeMessageCatalogs[locale]);
    expect(nativeMessages(undefined)).toEqual(nativeMessagesEn);
    expect(nativeMessages('unsupported')).toEqual(nativeMessagesEn);
    expect(nativeMessages('ja-JP').closeKeep).toBe(nativeMessageCatalogs.ja.closeKeep);
  });

  it('uses the canonical app recovery text without interpreting paths or names as templates', () => {
    expect(desktopMessages.recovery('{{name}}', '/tmp/{{path}}')).toBe(
      'Recovered {{name}} from Git. Your previous text is preserved at /tmp/{{path}}.',
    );
    expect(desktopMessages.recovery('script.md', null)).toBe('Restored the missing script.md from Git.');
  });
});
