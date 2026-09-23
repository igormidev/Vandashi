import { Node } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import Suggestion, { exitSuggestion, type SuggestionProps } from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import type { MentionReference } from './mention-references';
import { matchingReferences } from './mention-references';
import { referenceAttributes, referenceText } from './mention-document';
import { ReferenceIcon } from './ReferenceIcon';

export const mentionKey = new PluginKey<{ active: boolean }>('fileMentions');
export interface MentionMenu {
  items: MentionReference[];
  selected: number;
  choose: (item: MentionReference) => void;
}
export interface MentionController {
  references: () => MentionReference[];
  show: (menu: MentionMenu | null) => void;
}

function MentionChip({ node }: NodeViewProps) {
  const reference = referenceAttributes(node.attrs);
  return (
    <NodeViewWrapper
      as="span"
      contentEditable={false}
      className={`file-mention kind-${reference.kind}`}
      title={reference.path}
    >
      <ReferenceIcon reference={reference} />
      <span>{reference.name}</span>
    </NodeViewWrapper>
  );
}

export function createMentionController(initial: MentionReference[], show: MentionController['show']) {
  let references = initial;
  return {
    references: () => references,
    show,
    update: (value: MentionReference[]) => {
      references = value;
    },
  };
}

export function fileMention(controller: MentionController) {
  return Node.create({
    name: 'fileMention',
    group: 'inline',
    inline: true,
    atom: true,
    selectable: true,
    addAttributes() {
      return { name: { default: '' }, path: { default: '' }, kind: { default: 'other' } };
    },
    parseHTML() {
      return [{ tag: 'span[data-file-mention]' }];
    },
    renderHTML({ node }) {
      const reference = referenceAttributes(node.attrs);
      return [
        'span',
        { 'data-file-mention': '', name: reference.name, path: reference.path, kind: reference.kind },
        reference.name,
      ];
    },
    renderText({ node }) {
      return referenceText(referenceAttributes(node.attrs));
    },
    addNodeView() {
      return ReactNodeViewRenderer(MentionChip);
    },
    addProseMirrorPlugins() {
      return [
        Suggestion<MentionReference, MentionReference>({
          editor: this.editor,
          pluginKey: mentionKey,
          char: '@',
          allowSpaces: true,
          items: ({ query }) => matchingReferences(controller.references(), query),
          command: ({ editor, range, props }) => {
            editor
              .chain()
              .focus()
              .insertContentAt(range, [
                { type: 'fileMention', attrs: props },
                { type: 'text', text: ' ' },
              ])
              .run();
          },
          render: () => {
            let current: SuggestionProps<MentionReference, MentionReference> | null = null;
            let selected = 0;
            const show = () => {
              if (current) controller.show({ items: current.items, selected, choose: current.command });
            };
            return {
              onStart: (props) => {
                current = props;
                selected = 0;
                show();
              },
              onUpdate: (props) => {
                current = props;
                selected = 0;
                show();
              },
              onExit: () => {
                current = null;
                controller.show(null);
              },
              onKeyDown: ({ event, view }) => {
                if (event.isComposing || view.composing || !current) return false;
                if (event.key === 'Escape') {
                  exitSuggestion(view, mentionKey);
                  return true;
                }
                if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                  selected =
                    (selected + (event.key === 'ArrowDown' ? 1 : -1) + current.items.length) %
                    (current.items.length || 1);
                  show();
                  return true;
                }
                if ((event.key === 'Enter' && !event.shiftKey) || event.key === 'Tab') {
                  const item = current.items[selected];
                  if (item) current.command(item);
                  return !!item;
                }
                return false;
              },
            };
          },
        }),
      ];
    },
  });
}
