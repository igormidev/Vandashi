import { Extension, type Range } from '@tiptap/core';
import Suggestion, { exitSuggestion, type SuggestionProps } from '@tiptap/suggestion';
import { PluginKey, TextSelection, type EditorState } from '@tiptap/pm/state';
import { promptText } from './mention-document';

export const commandKey = new PluginKey<{ active: boolean }>('composerCommands');
export const slashCommandKey = new PluginKey<{ active: boolean }>('composerSlashCommands');
export function commandSuggestionActive(state: EditorState): boolean {
  return !!(commandKey.getState(state)?.active || slashCommandKey.getState(state)?.active);
}
export interface CommandSuggestion {
  query: string;
  preview: (replacement: string) => string | null;
  apply: (replacement: string) => string | null;
  close: () => void;
  focus: () => void;
}
export interface CommandSuggestionController {
  show: (suggestion: CommandSuggestion | null) => void;
}
export function commandReplacement(
  state: EditorState,
  range: Range,
  query: string,
  replacement: string,
  trigger: '$' | '/' = '$',
) {
  if (
    !Number.isInteger(range.from) ||
    !Number.isInteger(range.to) ||
    range.from < 1 ||
    range.from >= range.to ||
    range.to > state.doc.content.size ||
    (trigger === '/' && (range.from !== 1 || /[\s\\/]/u.test(query))) ||
    !state.selection.empty ||
    state.selection.head !== range.to ||
    state.doc.textBetween(range.from, range.to) !== trigger + query
  )
    return null;
  const nextCharacter = state.doc.textBetween(range.to, Math.min(range.to + 1, state.doc.content.size));
  const existingSeparator = replacement.endsWith(' ') && nextCharacter === ' ';
  const text = existingSeparator ? replacement.slice(0, -1) : replacement;
  const transaction = state.tr.insertText(text, range.from, range.to);
  if (existingSeparator)
    transaction.setSelection(TextSelection.create(transaction.doc, range.from + text.length + 1));
  return transaction;
}
export function createCommandSuggestionController(show: CommandSuggestionController['show']) {
  let callback = show;
  return {
    show: (suggestion: CommandSuggestion | null) => {
      callback(suggestion);
    },
    update: (next: CommandSuggestionController['show']) => {
      callback = next;
    },
  };
}

/** Keep suggestions bound to the current editor range, rather than rewriting a whole stored draft. */
export function commandSuggestion(controller: CommandSuggestionController) {
  return Extension.create({
    name: 'composerCommands',
    addProseMirrorPlugins() {
      let active: SuggestionProps | null = null;
      return (
        [
          { char: '$', key: commandKey },
          { char: '/', key: slashCommandKey },
        ] as const
      ).map(({ char, key }) =>
        Suggestion({
          editor: this.editor,
          pluginKey: key,
          char,
          allowSpaces: false,
          allow: ({ range }) => char !== '/' || range.from === 1,
          items: () => [],
          render: () => {
            let current: SuggestionProps | null = null;
            const show = (props: SuggestionProps) => {
              current = props;
              active = props;
              const document = props.editor.state.doc;
              const transaction = (replacement: string) => {
                if (
                  current !== props ||
                  active !== props ||
                  !props.editor.isEditable ||
                  props.editor.view.composing ||
                  props.editor.state.doc !== document
                )
                  return null;
                return commandReplacement(props.editor.state, props.range, props.query, replacement, char);
              };
              controller.show({
                query: props.query,
                preview: (replacement) => {
                  const next = transaction(replacement);
                  return next ? promptText(next.doc) : null;
                },
                apply: (replacement) => {
                  const next = transaction(replacement);
                  if (!next) return null;
                  props.editor.view.dispatch(next.scrollIntoView());
                  exitSuggestion(props.editor.view, key);
                  props.editor.view.focus();
                  return promptText(next.doc);
                },
                close: () => {
                  exitSuggestion(props.editor.view, key);
                },
                focus: () => {
                  props.editor.view.focus();
                },
              });
            };
            return {
              onStart: show,
              onUpdate: show,
              onExit: () => {
                if (active === current) {
                  active = null;
                  controller.show(null);
                }
                current = null;
              },
            };
          },
        }),
      );
    },
  });
}
