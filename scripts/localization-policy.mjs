// i18next 6 uses `mode`, not the removed `markupOnly` option. Check helper modules too.
const options = {
  mode: 'all',
  'should-validate-template': true,
  callees: { exclude: ['t'] },
  'object-properties': { exclude: [] },
  // Punctuation, numeric notation and escaped whitespace carry no translatable prose.
  words: { exclude: [/^[\p{P}\p{S}\d\s]+$/u, /^\\[nrt]$/, /^#[0-9a-f]{3}(?:[0-9a-f]{3}(?:[0-9a-f]{2})?)$/i] },
};
export const localizationRule = ['error', options];

// These are exact protocol/DOM/path identifiers in their owning files, never a blanket
// exemption for string literals, templates, labels, or an entire renderer module.
const machineWords = [
  ['src/renderer/main.tsx', ['root']],
  ['landing/src/main.tsx', ['root']],
  ['src/renderer/app/receipt-toasts.ts', ['receipt:']],
  [
    'src/renderer/features/assets/asset-index.ts',
    [
      'png',
      'jpg',
      'jpeg',
      'gif',
      'svg',
      'webp',
      'avif',
      'bmp',
      'tiff',
      'mp4',
      'mov',
      'webm',
      'mkv',
      'avi',
      'm4v',
      'mp3',
      'wav',
      'ogg',
      'm4a',
      'aac',
      'flac',
      'aiff',
    ],
  ],
  ['src/renderer/features/chat/message-path.ts', ['file:']],
  ['src/renderer/features/chat/session-title.ts', ['taste:', 'repair:', 'publish:']],
  ['src/renderer/features/chat/use-sessions.ts', ['done', 'error']],
  [
    'src/renderer/app/App.tsx',
    ['brand', 'videos', 'sharedAssets', 'packaging', 'creation', 'manual', 'assets', 'clips', 'launch'],
  ],
  [
    'src/renderer/app/navigation-tabs.ts',
    ['brand', 'videos', 'sharedAssets', 'packaging', 'creation', 'manual', 'assets', 'clips', 'launch'],
  ],
  // This invariant is a developer programming error; operational failures use typed AppFaults.
  ['src/renderer/app/store.tsx', ['AppProvider missing', 'done', 'error']],
  ['src/renderer/features/assets/AssetInspector.tsx', ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'asset:']],
  ['src/renderer/features/assets/AssetsPage.tsx', ['assets']],
  ['src/renderer/features/brands/BrandPage.tsx', ['/brand_identity/', 'brand', 'taste:', 'revision']],
  ['src/renderer/features/brands/TasteIcon.tsx', ['.md', 'currentColor']],
  ['src/renderer/features/chat/ChatPane.tsx', ['/brand_identity']],
  ['src/renderer/features/chat/Composer.tsx', ['read', 'edit', 'currentColor']],
  ['src/renderer/features/chat/ModelPicker.tsx', ['currentColor', 'none']],
  [
    'src/renderer/features/chat/RichComposer.tsx',
    [
      'textbox',
      'true',
      'rich-composer',
      'text/plain',
      'aria-disabled',
      'data-placeholder',
      'aria-controls',
      'aria-activedescendant',
    ],
  ],
  ['src/renderer/features/chat/draft-cache.ts', ['vandashi.draft.', 'vandashi.selectedChat.']],
  ['src/renderer/features/chat/mention-document.ts', ['doc', 'text', 'fileMention', 'other', 'paragraph']],
  [
    'src/renderer/features/chat/mention-extension.tsx',
    ['fileMentions', 'fileMention', 'inline', 'other', 'span[data-file-mention]', 'span', 'text'],
  ],
  [
    'src/renderer/features/chat/mention-references.ts',
    [
      '/brand_identity',
      'publish:',
      'brand_config.yml',
      '/brand_config.yml',
      'script.md',
      '/script.md',
      'video_packaging.yml',
      '/video_packaging.yml',
      'index.html',
      '/index.html',
    ],
  ],
  ['src/renderer/features/clips/ClipsPage.tsx', ['packaging:theme', 'clip', 'repair:']],
  ['src/renderer/features/creation/CreationPage.tsx', ['creation']],
  ['src/renderer/features/creation/Preview.tsx', ['preview', 'v=', 'hyperframes-player', 'src', 'controls']],
  ['src/renderer/features/creation/ScriptEditor.tsx', ['creation', 'script.md']],
  ['src/renderer/features/launch/LaunchPage.tsx', ['youtube']],
  ['src/renderer/features/launch/LaunchRow.tsx', ['URL', 'not_started', 'https:', 'http:']],
  ['src/renderer/features/launch/PublishReview.tsx', ['short', 'long', 'youtube']],
  [
    'src/renderer/features/packaging/PackagingPage.tsx',
    [
      'long',
      'short',
      'packaging:theme',
      'packaging:title:',
      'packaging:description:',
      'packaging:tags:',
      'thumbnails',
    ],
  ],
  [
    'src/renderer/features/videos/VideosPage.tsx',
    [
      'youtube',
      'rumble',
      'odysee',
      'youtubeShorts',
      'tiktok',
      'instagram',
      'facebook',
      'videos',
      'thumbnail',
    ],
  ],
  ['src/renderer/features/workspace/Checks.tsx', ['Codex']],
  ['src/renderer/i18n.ts', ['en']],
  ['src/renderer/shared/ui.tsx', ['p', 'strong', 'em', 'br']],
  ['landing/src/App.tsx', ['meta[name="description"]', 'content', 'direction', 'assets', 'clips']],
  ['landing/src/Setup.tsx', ['https://github.com/igormidev/Vandashi']],
  [
    'landing/src/language.ts',
    ['en', 'ja', 'fr', 'es', 'de', 'ko', 'pt-BR', 'it', 'vandashi.site.language', 'lang'],
  ],
];

export const localizationMachineRules = machineWords.map(([path, words]) => ({
  files: [path],
  rules: {
    'i18next/no-literal-string': [
      'error',
      {
        ...options,
        words: {
          exclude: [
            ...options.words.exclude,
            ...words.map((word) => new RegExp(`^${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)),
          ],
        },
      },
    ],
  },
}));
