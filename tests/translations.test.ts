import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { createInstance } from 'i18next';
import { describe, expect, it } from 'vitest';
import { availableLocales, normalizeLocale } from '../src/domain/locales';
import { appMessagesEn } from '../src/domain/messages';
import { appMessageCatalogs } from '../src/domain/messages/catalogs';
import { nativeMessagesEn } from '../src/domain/native-messages';
import { nativeMessageCatalogs } from '../src/domain/native-translations/catalogs';
import { nativeMessages } from '../src/desktop/messages';
import { interfaceCatalogs, languageLabels, resources } from '../src/renderer/locales/catalogs';
import { englishResources } from '../src/renderer/locales/resources';
import { diagnosticText } from '../src/renderer/app/diagnostics';
import i18n from '../src/renderer/i18n';

const tokens = (text: string) => [...text.matchAll(/\{\{[^}]+\}\}/g)].map(([token]) => token).sort();

describe('reviewed language catalogs', () => {
  it.each(availableLocales)('%s has complete keys, parameters, and native dialogs', (locale) => {
    for (const [source, translated] of [
      [englishResources.translation, interfaceCatalogs[locale]],
      [appMessagesEn, appMessageCatalogs[locale]],
      [nativeMessagesEn, nativeMessageCatalogs[locale]],
    ]) {
      expect(translated).toBeDefined();
      expect(Object.keys(translated ?? {}).sort()).toEqual(Object.keys(source ?? {}).sort());
      for (const [key, value] of Object.entries(translated ?? {})) {
        expect(value.trim(), `${locale}:${key}`).not.toBe('');
        expect(tokens(value), `${locale}:${key}`).toEqual(
          tokens((source as Record<string, string>)[key] ?? ''),
        );
      }
    }
    for (const key of Object.values(languageLabels))
      expect(interfaceCatalogs[locale][key]).toBe(englishResources.translation[key]);
    expect(nativeMessages(locale)).toEqual(nativeMessageCatalogs[locale]);
  });

  it.each(availableLocales.filter((locale) => locale !== 'en'))(
    '%s JSON does not silently overwrite duplicate keys',
    async (locale) => {
      for (const directory of [
        'src/renderer/locales',
        'src/domain/messages/translations',
        'src/domain/native-translations',
      ]) {
        const path = `${directory}/${locale}.json`;
        const source = await readFile(path, 'utf8');
        expect(() => JSON.parse(source) as unknown, path).not.toThrow();
        const parsed = ts.parseJsonText(path, source);
        const statement = parsed.statements[0];
        if (!statement || !ts.isExpressionStatement(statement)) throw new Error(path);
        const object = statement.expression;
        if (!ts.isObjectLiteralExpression(object)) throw new Error(path);
        const keys = object.properties.map((property) => property.name?.getText(parsed));
        expect(new Set(keys).size, path).toBe(keys.length);
      }
    },
  );

  it.each(availableLocales)('%s resolves all counter categories without English fallback', async (lng) => {
    const translator = createInstance();
    await translator.init({ resources, lng, fallbackLng: 'en', interpolation: { escapeValue: false } });
    for (const base of ['assetCount', 'assetFolderCount', 'assetImportRemaining', 'clipListCount'] as const)
      for (const count of [0, 1, 2, 11, 101, 1_000_000]) {
        const suffix =
          new Intl.PluralRules(lng).select(count) === 'one' && !(lng === 'pt-BR' && count === 0)
            ? 'one'
            : 'other';
        const expected = interfaceCatalogs[lng][`${base}_${suffix}`].replace('{{count}}', String(count));
        expect(translator.t(base, { count }), `${lng}:${base}:${String(count)}`).toBe(expected);
      }
    const rawName = '<tag> 台本 & 한국어 {{count}}';
    expect(translator.t('chatInspectImage', { name: rawName })).toContain(rawName);
  });

  it('normalizes saved regional variants and falls back to English for unsupported languages', async () => {
    const translator = createInstance();
    await translator.init({ resources, lng: normalizeLocale('ko-KR'), fallbackLng: 'en' });
    expect(translator.t('settings')).toBe(interfaceCatalogs.ko.settings);
    await translator.changeLanguage(normalizeLocale('zh-CN'));
    expect(translator.t('settings')).toBe(englishResources.translation.settings);
    expect(nativeMessages('ja-JP')).toEqual(nativeMessageCatalogs.ja);
    expect(nativeMessages('unknown')).toEqual(nativeMessagesEn);
  });

  it('changes app-owned diagnostics while preserving user text and external provider details', async () => {
    const raw = 'Provider: literal {{name}} <b>台本</b> & 한국어';
    const path = '/Users/台本/{{name}}';
    try {
      for (const locale of availableLocales) {
        await i18n.changeLanguage(locale);
        expect(diagnosticText({ kind: 'external', text: raw })).toBe(raw);
        const translated = diagnosticText({
          kind: 'app',
          message: { id: 'recoveredDocument', params: { name: raw, path } },
          externalDetail: raw,
        });
        expect(translated).toContain(path);
        expect(translated).toContain(raw);
        expect(translated.endsWith(`\n${raw}`)).toBe(true);
        if (locale !== 'en') expect(translated).not.toContain('Recovered ');
      }
    } finally {
      await i18n.changeLanguage('en');
    }
  });
});
