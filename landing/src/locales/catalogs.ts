import en from './en.json' with { type: 'json' };
import ja from './ja.json' with { type: 'json' };
import fr from './fr.json' with { type: 'json' };
import es from './es.json' with { type: 'json' };
import de from './de.json' with { type: 'json' };
import ko from './ko.json' with { type: 'json' };
import ptBR from './pt-BR.json' with { type: 'json' };
import it from './it.json' with { type: 'json' };
import type { SiteLocale } from '../language';

export type SiteCopy = Readonly<Record<keyof typeof en, string>>;
export const catalogs: Readonly<Record<SiteLocale, SiteCopy>> = { en, ja, fr, es, de, ko, 'pt-BR': ptBR, it };
export const languageNames: Readonly<Record<SiteLocale, string>> = {
  en: 'English',
  ja: '日本語',
  fr: 'Français',
  es: 'Español',
  de: 'Deutsch',
  ko: '한국어',
  'pt-BR': 'Português (Brasil)',
  it: 'Italiano',
};
export function siteCopy(locale: SiteLocale): SiteCopy {
  return catalogs[locale];
}
