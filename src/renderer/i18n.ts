import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { en } from './locales/en';
import { assetsEn } from './locales/assets-en';
import { clipsEn } from './locales/clips-en';
import { chatEn } from './locales/chat-en';
import { launchEn } from './locales/launch-en';
import { appMessagesEn } from '../domain/messages';
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: { ...en, ...assetsEn, ...clipsEn, ...chatEn, ...launchEn }, messages: appMessagesEn },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});
export default i18n;
