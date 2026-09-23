import 'i18next';
import type { englishResources } from './resources';

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof englishResources.translation;
      // The AppMessage discriminated union already checks these parameters at the producer.
      messages: { [Key in keyof typeof englishResources.messages]: string };
    };
    strictKeyChecks: true;
  }
}
