import type { JSONContent } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { MentionReference, ReferenceKind } from './mention-references';

const kinds: ReferenceKind[] = [
  'taste',
  'script',
  'config',
  'logo',
  'image',
  'video',
  'audio',
  'other',
  'packaging',
  'composition',
];
export function referenceAttributes(attrs: Record<string, unknown>): MentionReference {
  return {
    name: typeof attrs.name === 'string' ? attrs.name : '',
    path: typeof attrs.path === 'string' ? attrs.path : '',
    kind: kinds.find((kind) => kind === attrs.kind) ?? 'other',
  };
}
export function referenceText(reference: MentionReference): string {
  const label = reference.name.replace(/[\\\]]/g, '\\$&');
  const path = reference.path.replace(/[\\>]/g, '\\$&');
  return `@[${label}](<${path}>)`;
}
const unescape = (text: string) => text.replace(/\\([\\\])>])/g, '$1');

/** Keep the stored draft text portable, but restore references as atomic editor nodes. */
export function promptDocument(text: string, references: MentionReference[]): JSONContent {
  return {
    type: 'doc',
    content: text.split('\n').map((line) => {
      const content: JSONContent[] = [];
      let cursor = 0;
      const tokens = /@\[((?:\\.|[^\]\\])*)\]\((?:<((?:\\.|[^>\\])*)>|((?:\\.|[^)\\])*))\)/g;
      for (const match of line.matchAll(tokens)) {
        if (match.index > cursor) content.push({ type: 'text', text: line.slice(cursor, match.index) });
        const path = unescape(match[2] ?? match[3] ?? '');
        const known = references.find((entry) => entry.path === path);
        content.push({
          type: 'fileMention',
          attrs: { name: unescape(match[1] ?? ''), path, kind: known?.kind ?? 'other' },
        });
        cursor = match.index + match[0].length;
      }
      if (cursor < line.length) content.push({ type: 'text', text: line.slice(cursor) });
      return { type: 'paragraph', content };
    }),
  };
}

export function promptText(document: ProseMirrorNode): string {
  return document.textBetween(0, document.content.size, '\n', (node) =>
    node.type.name === 'fileMention'
      ? referenceText(referenceAttributes(node.attrs))
      : node.type.name === 'hardBreak'
        ? '\n'
        : '',
  );
}
