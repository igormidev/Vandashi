import { Schema } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import { describe, expect, it } from 'vitest';
import { commandReplacement } from '../src/renderer/features/chat/command-suggestion';
import { acceptsCommandKey, commandItems } from '../src/renderer/features/chat/composer-command';
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

describe('cursor-owned inline commands', () => {
  it('replaces only the typed skill at a middle caret and avoids adding a second separator', () => {
    const state = stateFor('Keep $hyp after', 10);
    const result = commandReplacement(state, { from: 6, to: 10 }, 'hyp', '$hyperframes ');
    expect(result && promptText(result.doc)).toBe('Keep $hyperframes after');
    expect(result?.selection.head).toBe(19);
    const end = stateFor('Keep $hyp', 10);
    const atEnd = commandReplacement(end, { from: 6, to: 10 }, 'hyp', '$hyperframes ');
    expect(atEnd && promptText(atEnd.doc)).toBe('Keep $hyperframes ');
  });

  it('rejects an obsolete query, selection or expanded text selection without touching the document', () => {
    const state = stateFor('Keep $edit after', 11);
    expect(commandReplacement(state, { from: 6, to: 11 }, 'plan', '')).toBeNull();
    expect(commandReplacement(state, { from: 6, to: 10 }, 'edi', '')).toBeNull();
    const selected = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6, 11)));
    expect(commandReplacement(selected, { from: 6, to: 11 }, 'edit', '')).toBeNull();
    expect(promptText(state.doc)).toBe('Keep $edit after');
  });

  it('keeps adjacent atomic native file references and paragraphs intact when removing a mode command', () => {
    const mention = schema.node('fileMention', { name: 'Scene', path: '/native/scene.png', kind: 'image' });
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [mention, schema.text(' $read after')]),
      schema.node('paragraph', null, schema.text('Keep this second paragraph')),
    ]);
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 8) });
    const result = commandReplacement(state, { from: 3, to: 8 }, 'read', '');
    expect(result && promptText(result.doc)).toBe(
      '@[Scene](</native/scene.png>)  after\nKeep this second paragraph',
    );
    expect(result?.doc.firstChild?.firstChild).toBe(mention);
  });

  it('keeps compact out of local actions and makes a colliding provider skill separately selectable', () => {
    const skills = [
      { name: 'model', description: 'Provider skill with a reserved local command name' },
      { name: 'skill:model', description: 'Another valid provider name equal to the rendered alias' },
      { name: 'hyperframes', description: 'Studio skill' },
    ];
    const choices = commandItems(skills, '', false, true);
    expect(new Set(choices.map((item) => item.key)).size).toBe(choices.length);
    expect(choices.filter((item) => item.command).map((item) => item.id)).toEqual([
      '$plan',
      '$read',
      '$edit',
      '$model',
      '$stash',
      '$restore',
    ]);
    expect(commandItems(skills, 'skill:MODEL', false, true)).toEqual([
      { key: '$model', id: '$skill:model', skill: skills[0] },
      { key: '$skill:model', id: '$skill:model', skill: skills[1] },
    ]);
    expect(commandItems(skills, 'plan', false, false)).toEqual([]);
  });
  it('accepts plain Tab and Enter without selecting when Tab is modified for keyboard navigation', () => {
    const event = { key: 'Tab', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
    expect(acceptsCommandKey(event)).toBe(true);
    for (const modifier of ['shiftKey', 'altKey', 'ctrlKey', 'metaKey'] as const)
      expect(acceptsCommandKey({ ...event, [modifier]: true })).toBe(false);
    expect(acceptsCommandKey({ ...event, key: 'Enter' })).toBe(true);
    expect(acceptsCommandKey({ ...event, key: 'Enter', shiftKey: true })).toBe(false);
  });
});
