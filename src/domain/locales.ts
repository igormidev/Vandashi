/** Canonical application languages shared by settings, IPC, and translation catalogs. */
export const supportedLocales = ['en', 'ja', 'fr', 'es', 'de', 'ko', 'pt-BR', 'it'] as const;
export type Locale = (typeof supportedLocales)[number];
export const defaultLocale: Locale = 'en';
/** Every supported language has a reviewed source catalog. */
export const availableLocales = supportedLocales;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && supportedLocales.some((locale) => locale === value);
}

/** Region variants select the available language family; Portuguese resolves to Brazilian Portuguese. */
export function normalizeLocale(value: unknown): Locale {
  if (typeof value !== 'string' || value.length > 100) return defaultLocale;
  try {
    const locale = new Intl.Locale(value.trim().replaceAll('_', '-'));
    if (isLocale(locale.baseName)) return locale.baseName;
    if (locale.language === 'pt') return 'pt-BR';
    return isLocale(locale.language) ? locale.language : defaultLocale;
  } catch {
    return defaultLocale;
  }
}
