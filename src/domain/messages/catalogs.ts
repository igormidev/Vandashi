import type { Locale } from '../locales';
import { appMessagesEn, type AppMessageId } from '../messages';
import ja from './translations/ja.json' with { type: 'json' };
import de from './translations/de.json' with { type: 'json' };
import ko from './translations/ko.json' with { type: 'json' };
import fr from './translations/fr.json' with { type: 'json' };
import es from './translations/es.json' with { type: 'json' };
import ptBR from './translations/pt-BR.json' with { type: 'json' };
import it from './translations/it.json' with { type: 'json' };

export type AppMessageCatalog = Readonly<Record<AppMessageId, string>>;

/** Diagnostics remain data: host and renderer share IDs without sharing UI code. */
export const appMessageCatalogs = {
  en: appMessagesEn,
  ja,
  de,
  ko,
  fr,
  es,
  'pt-BR': ptBR,
  it,
} satisfies Record<Locale, AppMessageCatalog>;
