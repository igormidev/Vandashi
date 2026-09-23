import type { AppState, Asset, ChatSession, Commit, ModelInfo, Workspace } from '../../src/domain/models';
import { defaultSettings, platforms } from '../../src/domain/defaults';
import type { Diagnostic } from '../../src/domain/diagnostics';

export interface ChatFixtureOptions {
  clips?: boolean;
  mediaPath?: string;
  portrait?: boolean;
  assets?: Asset[];
  assetImportPath?: string;
  describeFails?: boolean;
  describeFailure?: Diagnostic;
  references?: boolean;
  history?: Commit[];
  commitFails?: boolean;
  commitFailure?: Diagnostic;
  checksFail?: boolean;
  studioDirty?: boolean;
  delayedDiscard?: boolean;
  staleParent?: boolean;
  chatMediaUrls?: Record<string, string>;
  delayedFirstOpen?: boolean;
}

export function chatFixtureData(video: boolean, options: ChatFixtureOptions) {
  const scope = { brandId: 'chat-brand', videoId: video ? 'chat-video' : null, clipId: null };
  const brand = {
    id: scope.brandId,
    name: 'Chat test brand',
    path: '/tmp/chat-test',
    lastOpened: '',
    config: {
      name: 'Chat test brand',
      description: '',
      image: options.references ? 'logo.png' : '',
      platforms: { youtube: { url: 'https://youtube.com/@test', browser: 'Chrome' } },
    },
  };
  const state: AppState = {
    brands: [brand],
    lastBrandId: brand.id,
    settings: { ...defaultSettings, chat: { model: 'test-model', reasoning: 'low', fast: false } },
  };
  const workspace: Workspace = {
    scope,
    brand,
    video: video
      ? {
          id: 'chat-video',
          brandId: brand.id,
          name: 'Chat test video',
          path: '/tmp/chat-test/videos/video',
          ratio: options.portrait ? '9:16' : '16:9',
          origin: 'composition',
          updatedAt: '',
          renderedPath: options.staleParent ? null : '/tmp/chat-test/render.mp4',
          packaging: {
            titles: { long: ['Test title'], short: ['Short title'] },
            descriptions: { long: '', short: '' },
            tags: { long: [], short: [] },
            thumbnails: [],
            theme: '',
          },
        }
      : null,
    documents: [],
    assets: options.assets ?? [],
    clips: [],
    launches: [],
    revision: 'one',
    dirty: false,
  };
  if (options.references)
    workspace.documents = [
      {
        name: 'VISUAL_IDENTITY_TASTE.md',
        path: '/tmp/chat-test/brand_identity/VISUAL_IDENTITY_TASTE.md',
        kind: 'taste',
        content: 'Fixture direction',
      },
      {
        name: 'TITLE_LONG_FORM_VIDEOS_TASTE.md',
        path: '/tmp/chat-test/brand_identity/TITLE_LONG_FORM_VIDEOS_TASTE.md',
        kind: 'taste',
        content: 'Fixture titles',
      },
    ];
  const clip = {
    id: 'clip-one',
    parentVideoId: 'chat-video',
    brandId: brand.id,
    name: 'First excerpt',
    path: '/tmp/chat-test/videos/video/clips/excerpt',
    ratio: '9:16' as const,
    origin: 'composition' as const,
    start: 0,
    end: 20,
    updatedAt: '',
    renderedPath: '/tmp/chat-test/clip.mp4',
    packaging: {
      titles: { long: [], short: ['Clip short title'] },
      descriptions: { long: '', short: 'Clip description' },
      tags: { long: [], short: ['clip'] },
      thumbnails: [],
      theme: '',
    },
  };
  if (options.clips) workspace.clips = [clip];
  const sessions: ChatSession[] = [
    {
      id: 'chat-one',
      scope,
      topic: 'brand',
      title: 'Brand attributes',
      threadId: 'thread-one',
      messages: [
        {
          id: 'history-one',
          role: 'assistant',
          text: 'Saved conversation one',
          turnId: 't1',
          files: [],
          createdAt: '',
        },
      ],
      open: true,
      updatedAt: '',
    },
    {
      id: 'chat-two',
      scope,
      topic: 'taste:TITLE_LONG_FORM_VIDEOS_TASTE.md',
      title: 'Titles · long form',
      threadId: 'thread-two',
      messages: [
        {
          id: 'history-two',
          role: 'assistant',
          text: 'Saved conversation two',
          turnId: 't2',
          files: [],
          createdAt: '',
        },
      ],
      open: true,
      updatedAt: '',
    },
    {
      id: 'chat-publish',
      scope,
      topic: 'publish:youtube',
      title: 'Upload YouTube',
      threadId: null,
      messages: [],
      open: false,
      updatedAt: '',
    },
  ];
  const models: ModelInfo[] = [
    {
      id: 'test-model',
      name: 'Test model',
      description: '',
      reasoning: ['low', 'high'],
      defaultReasoning: 'low',
      fast: true,
      isDefault: true,
    },
  ];
  return {
    state,
    workspace,
    sessions,
    models,
    options,
    clip,
    platforms,
    statuses: ['not_started', 'uploading', 'uploaded', 'failed'] as const,
  };
}
