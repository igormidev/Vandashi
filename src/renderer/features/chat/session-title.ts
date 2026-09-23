import type { TFunction } from 'i18next';
import { platforms } from '../../../domain/defaults';
import type { ChatSession } from '../../../domain/models';
import type { AppMessageId } from '../../../domain/messages';
import type { Translation } from '../../locales/resources';
import { tasteLabelKey } from '../../locales/taste-labels';

const labels: Readonly<Record<string, keyof Translation>> = {
  brand: 'brandAttributes',
  creation: 'creation',
  thumbnails: 'thumbnail',
  'packaging:theme': 'theme',
  'packaging:title:long': 'titleLong',
  'packaging:title:short': 'titleShort',
  'packaging:description:long': 'descriptionLong',
  'packaging:description:short': 'descriptionShort',
  'packaging:tags:long': 'tagsLong',
  'packaging:tags:short': 'tagsShort',
};
const repairs: Readonly<Record<string, AppMessageId>> = {
  'media-nodejs': 'mediaNodeLabel',
  'media-ffmpeg': 'mediaFfmpegLabel',
  'media-ffprobe': 'mediaFfprobeLabel',
  'media-chrome': 'mediaChromeLabel',
  'media-environment': 'mediaEnvironmentLabel',
  hyperframes: 'mediaHyperframesLabel',
  skill: 'mediaSkillLabel',
};

/** Known app-owned topics are labels; asset/clip names and unknown historical titles are content. */
export function sessionTitle(session: Pick<ChatSession, 'topic' | 'title' | 'scope'>, t: TFunction): string {
  const topic = session.topic;
  const key = Object.hasOwn(labels, topic) ? labels[topic] : undefined;
  if (key) return t(key);
  if (topic === 'assets') return t(session.scope.videoId === null ? 'sharedAssets' : 'assets');
  if (topic.startsWith('taste:')) {
    const taste = tasteLabelKey(topic.slice('taste:'.length));
    if (taste) return t(taste);
  }
  if (topic.startsWith('repair:')) {
    const repair = topic.slice('repair:'.length);
    const id = Object.hasOwn(repairs, repair) ? repairs[repair] : undefined;
    if (id) return t(id, { ns: 'messages' });
    if (repair === 'Git' || repair === 'Codex') return repair;
  }
  if (topic.startsWith('publish:')) {
    const platform = platforms.find((candidate) => candidate === topic.split(':')[1]);
    if (platform) return t(platform);
  }
  return session.title;
}
