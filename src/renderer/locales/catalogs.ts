import type { Locale } from '../../domain/locales';
import { appMessageCatalogs } from '../../domain/messages/catalogs';
import { englishResources, type Translation } from './resources';
import ja from './ja.json' with { type: 'json' };
import de from './de.json' with { type: 'json' };
import ko from './ko.json' with { type: 'json' };
import fr from './fr.json' with { type: 'json' };
import es from './es.json' with { type: 'json' };
import ptBR from './pt-BR.json' with { type: 'json' };
import it from './it.json' with { type: 'json' };

export const languageLabels = {
  en: 'languageEnglish',
  ja: 'languageJapanese',
  fr: 'languageFrench',
  es: 'languageSpanish',
  de: 'languageGerman',
  ko: 'languageKorean',
  'pt-BR': 'languagePortuguese',
  it: 'languageItalian',
} as const satisfies Record<Locale, keyof Translation>;

export const interfaceCatalogs = {
  en: englishResources.translation,
  ja,
  de,
  ko,
  fr,
  es,
  'pt-BR': ptBR,
  it,
} satisfies Record<Locale, Translation>;

/** Reviewed numeric counters use the same wording for Romance-language many/other categories. */
function withManyForms(translation: Translation) {
  return {
    ...translation,
    assetCount_many: translation.assetCount_other,
    assetFolderCount_many: translation.assetFolderCount_other,
    assetImportRemaining_many: translation.assetImportRemaining_other,
    clipListCount_many: translation.clipListCount_other,
  };
}

export const resources = {
  en: englishResources,
  ja: { translation: ja, messages: appMessageCatalogs.ja },
  de: { translation: de, messages: appMessageCatalogs.de },
  ko: { translation: ko, messages: appMessageCatalogs.ko },
  fr: { translation: withManyForms(fr), messages: appMessageCatalogs.fr },
  es: { translation: withManyForms(es), messages: appMessageCatalogs.es },
  it: { translation: withManyForms(it), messages: appMessageCatalogs.it },
  'pt-BR': {
    translation: {
      ...withManyForms(ptBR),
      // Brazilian Portuguese uses plural wording after numeric zero in these counters.
      assetCount_zero: ptBR.assetCount_other,
      assetFolderCount_zero: ptBR.assetFolderCount_other,
      assetImportRemaining_zero: ptBR.assetImportRemaining_other,
      clipListCount_zero: ptBR.clipListCount_other,
    },
    messages: appMessageCatalogs['pt-BR'],
  },
};
