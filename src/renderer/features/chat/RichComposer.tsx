import { useEffect, useId, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Slice } from '@tiptap/pm/model';
import StarterKit from '@tiptap/starter-kit';
import { useTranslation } from 'react-i18next';
import type { MentionReference } from './mention-references';
import { createMentionController, fileMention, mentionKey, type MentionMenu } from './mention-extension';
import { promptDocument, promptText, referenceText, referenceAttributes } from './mention-document';
import { ReferenceIcon } from './ReferenceIcon';

interface Props {
  value: string;
  references: MentionReference[];
  disabled: boolean;
  placeholder: string;
  label?: string;
  focusKey?: number;
  onChange: (text: string) => void;
  onSend?: () => void;
  onHistory?: (direction: 'older' | 'newer') => boolean;
  onPasteFiles?: (files: File[]) => void;
  onCommandKeyDown?: (event: KeyboardEvent) => boolean;
  commandMenu?: { id: string; activeId: string | null } | null;
}
export function RichComposer({
  value,
  references,
  disabled,
  placeholder,
  label,
  focusKey = 0,
  onChange,
  onSend,
  onHistory,
  onPasteFiles,
  onCommandKeyDown,
  commandMenu,
}: Props) {
  const { t } = useTranslation();
  const id = useId();
  const focused = useRef(0);
  const [menu, setMenu] = useState<MentionMenu | null>(null);
  const [controller] = useState(() => createMentionController(references, setMenu));
  useEffect(() => {
    controller.update(references);
  }, [controller, references]);
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        listItem: false,
        listKeymap: false,
        link: false,
        orderedList: false,
        strike: false,
        underline: false,
        trailingNode: false,
      }),
      fileMention(controller),
    ],
    content: promptDocument(value, references),
    editable: !disabled,
    onUpdate: ({ editor: current }) => {
      onChange(promptText(current.state.doc));
    },
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': label ?? t('chat'),
        'aria-multiline': 'true',
        'data-placeholder': placeholder,
        class: 'rich-composer',
      },
      handleKeyDown: (view, event) => {
        if (
          !event.isComposing &&
          !view.composing &&
          !mentionKey.getState(view.state)?.active &&
          onCommandKeyDown?.(event)
        )
          return true;
        if (
          onHistory &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          !event.isComposing &&
          !view.composing &&
          !mentionKey.getState(view.state)?.active &&
          view.state.selection.empty &&
          ((event.key === 'ArrowUp' && view.state.selection.head === 1) ||
            (event.key === 'ArrowDown' && view.state.selection.head === view.state.doc.content.size - 1)) &&
          onHistory(event.key === 'ArrowUp' ? 'older' : 'newer')
        ) {
          event.preventDefault();
          return true;
        }
        if (!onSend || event.key !== 'Enter' || event.shiftKey || event.isComposing || view.composing)
          return false;
        if (mentionKey.getState(view.state)?.active) return false;
        event.preventDefault();
        onSend();
        return true;
      },
      clipboardTextSerializer: (slice) =>
        slice.content.textBetween(0, slice.content.size, '\n', (node) =>
          node.type.name === 'fileMention'
            ? referenceText(referenceAttributes(node.attrs))
            : node.type.name === 'hardBreak'
              ? '\n'
              : '',
        ),
      // Paste text through the same parser as restored drafts; arbitrary HTML never supplies chip attributes.
      handlePaste: (view, event) => {
        if (disabled) return true;
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length && onPasteFiles) {
          onPasteFiles(files);
          return true;
        }
        const text = event.clipboardData?.getData('text/plain');
        if (!text) return false;
        const parsed = view.state.schema.nodeFromJSON(promptDocument(text, references));
        view.dispatch(view.state.tr.replaceSelection(new Slice(parsed.content, 1, 1)));
        return true;
      },
    },
  });
  useEffect(() => {
    if (promptText(editor.state.doc) !== value)
      editor.commands.setContent(promptDocument(value, references), { emitUpdate: false });
  }, [editor, value, references]);
  useEffect(() => {
    editor.setEditable(!disabled, false);
  }, [editor, disabled]);
  useEffect(() => {
    if (!disabled && focusKey > focused.current) {
      focused.current = focusKey;
      editor.commands.focus('end');
    }
  }, [editor, disabled, focusKey]);
  useEffect(() => {
    editor.view.dom.setAttribute('aria-disabled', String(disabled));
    editor.view.dom.setAttribute('data-placeholder', placeholder);
    editor.view.dom.setAttribute('aria-controls', commandMenu?.id ?? id);
    if (menu?.items.length)
      editor.view.dom.setAttribute('aria-activedescendant', `${id}-${String(menu.selected)}`);
    else if (commandMenu?.activeId)
      editor.view.dom.setAttribute('aria-activedescendant', commandMenu.activeId);
    else editor.view.dom.removeAttribute('aria-activedescendant');
  }, [editor, disabled, placeholder, id, menu, commandMenu]);
  return (
    <>
      {menu && !disabled && (
        <div className="mentions" id={id} role="listbox" aria-label={t('references')}>
          {menu.items.length ? (
            menu.items.map((item, index) => (
              <button
                type="button"
                role="option"
                aria-selected={index === menu.selected}
                id={`${id}-${String(index)}`}
                tabIndex={-1}
                key={item.path}
                className={`kind-${item.kind}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  menu.choose(item);
                }}
              >
                <ReferenceIcon reference={item} />
                <span>{item.name}</span>
              </button>
            ))
          ) : (
            <div className="mention-empty">{t('chatNoReferences')}</div>
          )}
        </div>
      )}
      <EditorContent editor={editor} />
    </>
  );
}
