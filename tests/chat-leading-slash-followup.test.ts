import { Schema } from '@tiptap/pm/model';
import { EditorState, Plugin, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import {
  commandKey,
  commandReplacement,
  commandSuggestionActive,
  slashCommandKey,
} from '../src/renderer/features/chat/command-suggestion';
import { promptText } from '../src/renderer/features/chat/mention-document';

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'inline*', group: 'block' },
    text: { group: 'inline' },
    fileMention: { inline: true, atom: true, group: 'inline', attrs: { name: {}, path: {}, kind: {} } },
  },
});
const stateFor = (text: string, caret: number) => {
  const doc = schema.node('doc', null, [schema.node('paragraph', null, schema.text(text))]);
  return EditorState.create({ doc, selection: TextSelection.create(doc, caret) });
};

describe('leading slash command compatibility', () => {
  it('removes only a reviewed leading mode token while retaining exact remainder, native references and paragraphs', () => {
    const reference = schema.node('fileMention', { name: 'Scene', path: '/native/scene.png', kind: 'image' });
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('/plan Keep  spacing '), reference]),
      schema.node('paragraph', null, schema.text('Second paragraph')),
    ]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 6) });
    const result = commandReplacement(state, { from: 1, to: 6 }, 'plan', '', '/');
    expect(result && promptText(result.doc)).toBe(
      ' Keep  spacing @[Scene](</native/scene.png>)\nSecond paragraph',
    );
    expect(result?.doc.firstChild?.lastChild).toBe(reference);
    expect(result?.selection.head).toBe(1);
    expect(promptText(state.doc)).toBe('/plan Keep  spacing @[Scene](</native/scene.png>)\nSecond paragraph');
  });

  it('rejects slash tokens in paths, later paragraphs and obsolete or invalid selection ranges without changing input', () => {
    const path = stateFor('See /read', 10);
    expect(commandReplacement(path, { from: 5, to: 10 }, 'read', '', '/')).toBeNull();
    const leading = stateFor('/read tail', 6);
    expect(commandReplacement(leading, { from: 1, to: 6 }, 'edit', '', '/')).toBeNull();
    expect(commandReplacement(leading, { from: 1, to: 5 }, 'rea', '', '/')).toBeNull();
    expect(commandReplacement(leading, { from: 0, to: 6 }, 'read', '', '/')).toBeNull();
    expect(commandReplacement(leading, { from: -1, to: 6 }, 'read', '', '/')).toBeNull();
    expect(commandReplacement(leading, { from: 1.5, to: 6 }, 'read', '', '/')).toBeNull();
    const selected = leading.apply(leading.tr.setSelection(TextSelection.create(leading.doc, 1, 6)));
    expect(commandReplacement(selected, { from: 1, to: 6 }, 'read', '', '/')).toBeNull();
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, schema.text('First')),
      schema.node('paragraph', null, schema.text('/read')),
    ]);
    const later = EditorState.create({ doc, selection: TextSelection.create(doc, 13) });
    expect(commandReplacement(later, { from: 8, to: 13 }, 'read', '', '/')).toBeNull();
    const nested = stateFor('/tmp/read', 10);
    expect(commandReplacement(nested, { from: 1, to: 10 }, 'tmp/read', '', '/')).toBeNull();
    expect(promptText(path.doc)).toBe('See /read');
    expect(promptText(leading.doc)).toBe('/read tail');
    expect(promptText(later.doc)).toBe('First\n/read');
    expect(promptText(nested.doc)).toBe('/tmp/read');
  });

  it('keeps dollar replacement as the default and refuses cross-trigger adoption', () => {
    const dollar = stateFor('Keep $read tail', 11);
    const result = commandReplacement(dollar, { from: 6, to: 11 }, 'read', '');
    expect(result && promptText(result.doc)).toBe('Keep  tail');
    const slash = stateFor('/read tail', 6);
    expect(commandReplacement(slash, { from: 1, to: 6 }, 'read', '')).toBeNull();
    expect(commandReplacement(stateFor('$read tail', 6), { from: 1, to: 6 }, 'read', '', '/')).toBeNull();
  });

  it('keeps send and history guards active for either independently keyed command plugin', () => {
    const state = stateFor('/read', 6);
    const plugin = (key: typeof commandKey, active: boolean) =>
      new Plugin({ key, state: { init: () => ({ active }), apply: (_transaction, value) => value } });
    expect(commandSuggestionActive(state)).toBe(false);
    expect(commandSuggestionActive(state.reconfigure({ plugins: [plugin(slashCommandKey, true)] }))).toBe(
      true,
    );
    expect(commandSuggestionActive(state.reconfigure({ plugins: [plugin(commandKey, true)] }))).toBe(true);
    expect(
      commandSuggestionActive(
        state.reconfigure({ plugins: [plugin(commandKey, false), plugin(slashCommandKey, false)] }),
      ),
    ).toBe(false);
    expect(
      commandSuggestionActive(
        state.reconfigure({ plugins: [plugin(commandKey, false), plugin(slashCommandKey, true)] }),
      ),
    ).toBe(true);
  });
});
