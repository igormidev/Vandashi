import { en } from './en';
import { assetsEn } from './assets-en';
import { clipsEn } from './clips-en';
import { chatEn } from './chat-en';
import { launchEn } from './launch-en';
import { appMessagesEn } from '../../domain/messages';

export const englishResources = {
  translation: { ...en, ...assetsEn, ...clipsEn, ...chatEn, ...launchEn },
  messages: appMessagesEn,
} as const;

export type Translation = Readonly<Record<keyof typeof englishResources.translation, string>>;
