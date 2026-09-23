import type { Locale } from '../locales';
import { nativeMessagesEn, type NativeMessages } from '../native-messages';
import ja from './ja.json' with { type: 'json' };
import de from './de.json' with { type: 'json' };
import ko from './ko.json' with { type: 'json' };
import fr from './fr.json' with { type: 'json' };
import es from './es.json' with { type: 'json' };
import ptBR from './pt-BR.json' with { type: 'json' };
import it from './it.json' with { type: 'json' };

export const nativeMessageCatalogs: Record<Locale, NativeMessages> = {
  en: nativeMessagesEn,
  ja,
  de,
  ko,
  fr,
  es,
  'pt-BR': ptBR,
  it,
};
