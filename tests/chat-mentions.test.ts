import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { fileMention } from '../src/renderer/features/chat/mention-extension';
import { promptDocument, promptText, referenceText } from '../src/renderer/features/chat/mention-document';
import {
  matchingReferences,
  mentionReferences,
  type MentionReference,
} from '../src/renderer/features/chat/mention-references';
import type { Workspace } from '../src/domain/models';
import { emptyPackaging } from '../src/domain/defaults';

const logo: MentionReference = {
  name: 'Logo [primary]',
  path: '/Users/Test Brand/image (1)>final.png',
  kind: 'logo',
};
const config: MentionReference = {
  name: 'brand_config.yml',
  path: '/brand/brand_identity/brand_config.yml',
  kind: 'config',
};
const schema = getSchema([
  StarterKit,
  fileMention({ references: () => [logo, config], show: () => undefined }),
]);

describe('atomic mention documents', () => {
  it('round-trips absolute paths, special characters, blank lines, and typed text without leaking markup into the chip label', () => {
    const text = `Compare ${referenceText(logo)} with ${referenceText(config)}.\n\nThen revise it.\n`;
    const doc = schema.nodeFromJSON(promptDocument(text, [logo, config]));
    expect(promptText(doc)).toBe(text);
    const node = doc.firstChild?.child(1);
    expect(node?.isAtom).toBe(true);
    expect(node?.attrs.name).toBe(logo.name);
    expect(node?.attrs.path).toBe(logo.path);
  });
  it('preserves legacy saved mentions and resolves their current file type', () => {
    const doc = schema.nodeFromJSON(
      promptDocument('Use @[brand_config.yml](/brand/brand_identity/brand_config.yml)', [config]),
    );
    expect(doc.firstChild?.lastChild?.attrs.kind).toBe('config');
    expect(promptText(doc)).toBe(`Use ${referenceText(config)}`);
    expect(promptText(schema.nodeFromJSON(promptDocument('Just @unfinished and [ordinary](text)', [])))).toBe(
      'Just @unfinished and [ordinary](text)',
    );
  });
  it('finds asset filenames as well as human titles without matching unrelated full directory paths', () => {
    expect(matchingReferences([logo, config], 'primary')).toEqual([logo]);
    expect(matchingReferences([logo, config], 'image final')).toEqual([logo]);
    expect(matchingReferences([logo, config], 'Users')).toEqual([]);
  });
});

describe('conversation reference scope', () => {
  const workspace: Workspace = {
    scope: { brandId: 'brand', videoId: null, clipId: null },
    brand: {
      id: 'brand',
      name: 'Brand',
      path: '/brand',
      lastOpened: '',
      config: { name: 'Brand', description: '', image: 'logo.png', platforms: {} },
    },
    video: null,
    documents: [
      {
        name: 'VISUAL_IDENTITY_TASTE.md',
        path: '/brand/brand_identity/VISUAL_IDENTITY_TASTE.md',
        content: '',
        kind: 'taste',
      },
    ],
    assets: [
      {
        id: 'audio',
        path: '/brand/shared_assets/music.mp3',
        relativePath: 'music.mp3',
        title: 'Music',
        description: '',
        tags: [],
        kind: 'audio',
        size: 1,
        hash: '',
        shared: true,
        mediaUrl: '',
      },
    ],
    clips: [],
    launches: [],
    revision: '',
    dirty: false,
  };
  it('includes config, other taste guides and the logo, and offers media only in relevant conversations', () => {
    expect(mentionReferences(workspace, 'brand', 'Brand logo').map((entry) => entry.kind)).toEqual([
      'config',
      'taste',
      'logo',
    ]);
    expect(
      mentionReferences(workspace, 'assets', 'Brand logo').find((entry) => entry.kind === 'audio')?.path,
    ).toBe('/brand/shared_assets/music.mp3');
    expect(
      mentionReferences(workspace, 'brand', 'Brand logo').find((entry) => entry.kind === 'logo')?.path,
    ).toBe('/brand/brand_identity/logo.png');
  });
  it('offers the selected clip files when publishing from the parent workspace', () => {
    const references = mentionReferences(
      {
        ...workspace,
        documents: [
          ...workspace.documents,
          { name: 'script.md', path: '/parent/script.md', content: '', kind: 'script' },
        ],
        clips: [
          {
            id: 'clip',
            parentVideoId: 'parent',
            brandId: 'brand',
            name: 'Excerpt',
            path: '/parent/clips/excerpt',
            ratio: '9:16',
            updatedAt: '',
            renderedPath: null,
            start: 0,
            end: 20,
            packaging: emptyPackaging(),
          },
        ],
      },
      'publish:youtubeShorts:clip',
      'Logo',
    );
    expect(references.find((entry) => entry.kind === 'script')?.path).toBe('/parent/clips/excerpt/script.md');
    expect(references.find((entry) => entry.kind === 'packaging')?.path).toBe(
      '/parent/clips/excerpt/video_packaging.yml',
    );
    expect(references.some((entry) => entry.path === '/parent/script.md')).toBe(false);
  });
});
