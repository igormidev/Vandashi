import { describe, expect, it } from 'vitest';
import { createInstance } from 'i18next';
import { en } from '../src/renderer/locales/en';
import { assetsEn } from '../src/renderer/locales/assets-en';
import { clipsEn } from '../src/renderer/locales/clips-en';
import { chatEn } from '../src/renderer/locales/chat-en';
import { launchEn } from '../src/renderer/locales/launch-en';
import { englishResources } from '../src/renderer/locales/resources';
import { coreMessagesEn } from '../src/domain/messages/core-en';
import { applicationMessagesEn } from '../src/domain/messages/application-en';
import { codexMessagesEn } from '../src/domain/messages/codex-en';
import { storageMessagesEn } from '../src/domain/messages/storage-en';
import { desktopMessagesEn } from '../src/domain/messages/desktop-en';
import { mediaMessagesEn } from '../src/domain/messages/media-en';

describe('English source catalogs', () => {
  it.each([
    ['interface', [en, assetsEn, clipsEn, chatEn, launchEn]],
    [
      'diagnostics',
      [
        coreMessagesEn,
        applicationMessagesEn,
        codexMessagesEn,
        storageMessagesEn,
        desktopMessagesEn,
        mediaMessagesEn,
      ],
    ],
  ] as const)('does not silently overwrite duplicate %s keys', (_name, catalogs) => {
    const keys = catalogs.flatMap((catalog) => Object.keys(catalog));
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([]);
  });

  it('formats zero, one, and multiple assets and clips and falls back to English', async () => {
    const translator = createInstance();
    await translator.init({ resources: { en: englishResources }, lng: 'ja', fallbackLng: 'en' });
    expect([0, 1, 2].map((count) => translator.t('assetCount', { count }))).toEqual([
      '0 assets',
      '1 asset',
      '2 assets',
    ]);
    expect([0, 1, 2].map((count) => translator.t('clipListCount', { count }))).toEqual([
      '0 clips',
      '1 clip',
      '2 clips',
    ]);
    expect(translator.t('chatInspectImage', { name: '台本 & title' })).toContain('台本');
  });
});
