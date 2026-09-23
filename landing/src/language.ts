export const siteLocales = ['en', 'ja', 'fr', 'es', 'de', 'ko', 'pt-BR', 'it'] as const;
export type SiteLocale = (typeof siteLocales)[number];

const storageKey = 'vandashi.site.language';

/** Match a complete language tag, rather than accepting arbitrary supported prefixes. */
export function matchSiteLocale(input: unknown): SiteLocale | undefined {
  if (typeof input !== 'string' || input.length > 100) return undefined;
  try {
    const { language } = new Intl.Locale(input.trim().replaceAll('_', '-'));
    if (language === 'pt') return 'pt-BR';
    return siteLocales.find((locale) => locale === language);
  } catch {
    return undefined;
  }
}

export function chooseSiteLocale({
  query,
  saved,
  languages,
}: {
  query?: string | null;
  saved?: string | null;
  languages: readonly string[];
}): SiteLocale {
  for (const candidate of [query, saved, ...languages]) {
    const locale = matchSiteLocale(candidate);
    if (locale) return locale;
  }
  return 'en';
}

/** Small injectable browser boundary: denied storage must not disable language selection. */
export interface SiteLanguagePorts {
  readUrl: () => string;
  readSavedLanguage: () => string | null;
  readBrowserLanguages: () => readonly string[];
  writeSavedLanguage: (locale: SiteLocale) => void;
  replaceUrl: (url: string) => void;
}

const browserPorts: SiteLanguagePorts = {
  readUrl: () => window.location.href,
  readSavedLanguage: () => window.localStorage.getItem(storageKey),
  readBrowserLanguages: () => (navigator.languages.length > 0 ? navigator.languages : [navigator.language]),
  writeSavedLanguage: (locale) => {
    window.localStorage.setItem(storageKey, locale);
  },
  replaceUrl: (url) => {
    window.history.replaceState(window.history.state, '', url);
  },
};

function attempt<T>(action: () => T): T | undefined {
  try {
    return action();
  } catch {
    return undefined;
  }
}

export function readSiteLocale(ports: SiteLanguagePorts = browserPorts): SiteLocale {
  return chooseSiteLocale({
    query: attempt(() => new URL(ports.readUrl()).searchParams.get('lang')) ?? null,
    saved: attempt(() => ports.readSavedLanguage()) ?? null,
    languages: attempt(() => ports.readBrowserLanguages()) ?? [],
  });
}

/** The caller applies the chosen language immediately; persistence is best effort. */
export function saveSiteLocale(locale: SiteLocale, ports: SiteLanguagePorts = browserPorts): void {
  attempt(() => {
    ports.writeSavedLanguage(locale);
  });
  attempt(() => {
    const url = new URL(ports.readUrl());
    url.searchParams.set('lang', locale);
    ports.replaceUrl(url.href);
  });
}
