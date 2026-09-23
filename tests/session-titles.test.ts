import { createInstance } from 'i18next';
import { expect, it } from 'vitest';
import { tasteFiles } from '../src/domain/defaults';
import { resources } from '../src/renderer/locales/catalogs';
import { tasteLabels } from '../src/renderer/locales/taste-labels';
import { sessionTitle } from '../src/renderer/features/chat/session-title';

const scope = { brandId: 'brand-one', videoId: null, clipId: null };

it('resolves known app labels from stable topics after switching languages without rewriting history', async () => {
  const i18n = createInstance();
  await i18n.init({ resources, lng: 'en', fallbackLng: 'en' });
  const session = { topic: 'brand', title: 'Brand attributes', scope };
  expect(sessionTitle(session, i18n.t)).toBe('Brand attributes');
  await i18n.changeLanguage('ja');
  expect(sessionTitle(session, i18n.t)).toBe(resources.ja.translation.brandAttributes);
  expect(session.title).toBe('Brand attributes');
  for (const file of tasteFiles)
    expect(sessionTitle({ ...session, topic: `taste:${file}` }, i18n.t)).toBe(
      resources.ja.translation[tasteLabels[file]],
    );
  expect(sessionTitle({ ...session, topic: 'assets' }, i18n.t)).toBe(resources.ja.translation.sharedAssets);
  expect(sessionTitle({ ...session, topic: 'assets', scope: { ...scope, videoId: 'video' } }, i18n.t)).toBe(
    resources.ja.translation.assets,
  );
  expect(sessionTitle({ ...session, topic: 'repair:skill' }, i18n.t)).toBe(
    resources.ja.messages.mediaSkillLabel,
  );
  expect(sessionTitle({ ...session, topic: 'publish:youtube:clip-one' }, i18n.t)).toBe('YouTube');
  await i18n.changeLanguage('en');
  expect(sessionTitle(session, i18n.t)).toBe('Brand attributes');
});

it.each([
  'clip',
  'asset:image-id',
  'taste:MY_GUIDE.md',
  'repair:custom',
  'publish:custom',
  'custom',
  '__proto__',
  'constructor',
])('preserves user-derived and unknown historical titles for %s', async (topic) => {
  const i18n = createInstance();
  await i18n.init({ resources, lng: 'ja', fallbackLng: 'en' });
  const title = 'My 台本 / 한국어 / {{title}}';
  expect(sessionTitle({ topic, title, scope }, i18n.t)).toBe(title);
});
