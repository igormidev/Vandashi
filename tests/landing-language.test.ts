import { describe, expect, it, vi } from 'vitest';
import { chooseSiteLocale, matchSiteLocale, readSiteLocale, saveSiteLocale } from '../landing/src/language';
import type { SiteLanguagePorts } from '../landing/src/language';

describe('landing language selection', () => {
  it.each([
    ['en-GB', 'en'],
    ['ja-JP', 'ja'],
    ['fr-CA', 'fr'],
    ['es-419', 'es'],
    ['de-CH', 'de'],
    ['ko-KR', 'ko'],
    ['it-CH', 'it'],
    ['pt', 'pt-BR'],
    ['pt-PT', 'pt-BR'],
    [' PT_br ', 'pt-BR'],
    ['EN-latn-US-u-ca-gregory', 'en'],
  ])('resolves the supported language family for %s', (input, expected) => {
    expect(matchSiteLocale(input)).toBe(expected);
  });

  it.each([
    undefined,
    null,
    123,
    {},
    ['ja'],
    '',
    ' ',
    'nl-NL',
    'zh-Hant-TW',
    'english',
    'français',
    'en-US,fr;q=0.9',
    'ja--JP',
    'pt--BR',
    'en-💥',
    'ko-<script>',
    'it-IT-IT',
    'de DE',
    'en-' + 'a'.repeat(100),
  ])('ignores unsupported or malformed preference %#', (input) => {
    expect(matchSiteLocale(input)).toBeUndefined();
  });

  it('prioritizes a valid shared URL over a saved preference and the device', () => {
    expect(chooseSiteLocale({ query: 'ja-JP', saved: 'fr', languages: ['de-CH', 'es-MX'] })).toBe('ja');
    expect(chooseSiteLocale({ query: 'en', saved: 'fr', languages: ['de'] })).toBe('en');
  });

  it('ignores invalid higher-priority values without hiding the saved choice', () => {
    expect(chooseSiteLocale({ query: 'es--MX', saved: 'it-IT', languages: ['ko'] })).toBe('it');
    expect(chooseSiteLocale({ query: 'ar', saved: 'pt-PT', languages: ['de'] })).toBe('pt-BR');
  });

  it('walks browser preferences in order rather than falling back at the first unsupported entry', () => {
    expect(
      chooseSiteLocale({ query: '', saved: 'invalid', languages: ['zh-TW', 'xx--YY', 'fr-CA', 'ja'] }),
    ).toBe('fr');
    expect(chooseSiteLocale({ languages: ['ar', 'en-GB', 'ja'] })).toBe('en');
  });

  it('falls back to English only when no supplied preference is supported', () => {
    expect(chooseSiteLocale({ query: 'zh', saved: 'nl', languages: ['ar', 'ru'] })).toBe('en');
    expect(chooseSiteLocale({ query: null, saved: null, languages: [] })).toBe('en');
  });
});

function browser(overrides: Partial<SiteLanguagePorts> = {}): SiteLanguagePorts {
  return {
    readUrl: () => 'https://igormidev.github.io/Vandashi/?campaign=studio#workflow',
    readSavedLanguage: () => 'fr',
    readBrowserLanguages: () => ['de-DE'],
    writeSavedLanguage: vi.fn(),
    replaceUrl: vi.fn(),
    ...overrides,
  };
}

function denied(): never {
  throw new Error('Browser capability denied');
}

describe('landing browser language boundary', () => {
  it('reads the lang query independently of other URL data', () => {
    const ports = browser({
      readUrl: () => 'https://igormidev.github.io/Vandashi/?campaign=de&lang=pt-PT#ja',
    });
    expect(readSiteLocale(ports)).toBe('pt-BR');
    expect(readSiteLocale(browser())).toBe('fr');
  });

  it('keeps URL selection and device detection available when storage cannot be read', () => {
    expect(
      readSiteLocale(browser({ readUrl: () => 'https://example.com/?lang=ja', readSavedLanguage: denied })),
    ).toBe('ja');
    expect(readSiteLocale(browser({ readSavedLanguage: denied }))).toBe('de');
  });

  it('recovers independently from absent browser globals and invalid URLs', () => {
    expect(readSiteLocale(browser({ readUrl: denied, readBrowserLanguages: denied }))).toBe('fr');
    expect(readSiteLocale(browser({ readUrl: () => 'invalid', readSavedLanguage: denied }))).toBe('de');
    expect(
      readSiteLocale(browser({ readUrl: denied, readSavedLanguage: denied, readBrowserLanguages: denied })),
    ).toBe('en');
  });

  it('updates the selected language without losing the Pages path, query values or fragment', () => {
    const ports = browser({
      readUrl: () =>
        'https://igormidev.github.io/Vandashi/?campaign=a%20b&filter=one&lang=fr&filter=two&lang=de#workflow',
    });
    saveSiteLocale('ko', ports);
    expect(ports.writeSavedLanguage).toHaveBeenCalledExactlyOnceWith('ko');
    expect(ports.replaceUrl).toHaveBeenCalledTimes(1);
    const replaced = vi.mocked(ports.replaceUrl).mock.calls[0]?.[0];
    expect(replaced).toBeDefined();
    const url = new URL(replaced ?? '');
    expect(url.origin).toBe('https://igormidev.github.io');
    expect(url.pathname).toBe('/Vandashi/');
    expect(url.hash).toBe('#workflow');
    expect(url.searchParams.get('campaign')).toBe('a b');
    expect(url.searchParams.getAll('filter')).toEqual(['one', 'two']);
    expect(url.searchParams.getAll('lang')).toEqual(['ko']);
  });

  it('can reload a manual choice through its URL when storage is denied', () => {
    let currentUrl = 'https://igormidev.github.io/Vandashi/#install';
    const ports = browser({
      readUrl: () => currentUrl,
      replaceUrl: (url) => {
        currentUrl = url;
      },
      readSavedLanguage: denied,
      writeSavedLanguage: denied,
    });
    expect(() => {
      saveSiteLocale('it', ports);
    }).not.toThrow();
    expect(readSiteLocale(ports)).toBe('it');
    expect(new URL(currentUrl).hash).toBe('#install');
  });

  it('saves a preference even when browser history cannot be changed', () => {
    const ports = browser({ replaceUrl: denied });
    expect(() => {
      saveSiteLocale('es', ports);
    }).not.toThrow();
    expect(ports.writeSavedLanguage).toHaveBeenCalledExactlyOnceWith('es');
  });

  it('does not block the active UI when neither persistence mechanism is available', () => {
    expect(() => {
      saveSiteLocale('ja', browser({ writeSavedLanguage: denied, replaceUrl: denied }));
    }).not.toThrow();
  });
});
