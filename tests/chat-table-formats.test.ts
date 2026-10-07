import { describe, expect, it } from 'vitest';
import { readTableContent, serializeTable } from '../src/renderer/features/chat/table-copy';

const text = (value: string) => ({ type: 'text', value });
const element = (
  tagName: string,
  children: ReturnType<typeof text>[] = [],
  properties: Record<string, unknown> = {},
) => ({ type: 'element', tagName, children, properties });

describe('Rendered chat table copying', () => {
  it('preserves complete semantic cells in native plain text and quotes CSV delimiters, quotes and embedded lines', () => {
    const table = {
      type: 'element',
      tagName: 'table',
      children: [
        {
          type: 'element',
          tagName: 'tr',
          children: [element('th', [text('Name')]), element('th', [text('Note')])],
        },
        {
          type: 'element',
          tagName: 'tr',
          children: [element('td', [text('Brand, main')]), element('td', [text('A "quoted" note\nCafé')])],
        },
      ],
    };
    const content = readTableContent(table);
    expect(serializeTable(content, 'plain')).toBe('Name\tNote\nBrand, main\tA "quoted" note\nCafé');
    expect(serializeTable(content, 'csv')).toBe('Name,Note\r\n"Brand, main","A ""quoted"" note\nCafé"');
  });

  it('retains Markdown formatting, alignment and escaped pipes while selecting safe inline-code fences', () => {
    const table = {
      type: 'element',
      tagName: 'table',
      children: [
        {
          type: 'element',
          tagName: 'tr',
          children: [
            element('th', [text('Name')], { align: 'left' }),
            element('th', [text('Note')], { style: { textAlign: 'right' } }),
          ],
        },
        {
          type: 'element',
          tagName: 'tr',
          children: [
            { type: 'element', tagName: 'td', children: [element('strong', [text('Brand, main')])] },
            { type: 'element', tagName: 'td', children: [text('A "quoted" | detail')] },
          ],
        },
        {
          type: 'element',
          tagName: 'tr',
          children: [
            { type: 'element', tagName: 'td', children: [element('code', [text('`tick`')])] },
            { type: 'element', tagName: 'td', children: [element('em', [text('Café')])] },
          ],
        },
      ],
    };
    expect(serializeTable(readTableContent(table), 'markdown')).toBe(
      '| Name | Note |\n| :--- | ---: |\n| **Brand, main** | A "quoted" \\| detail |\n| `` `tick` `` | _Café_ |',
    );
  });

  it('handles wrapped table sections, links and line breaks without interpreting provider HTML or invoking native access', () => {
    const table = {
      type: 'element',
      tagName: 'table',
      children: [
        {
          type: 'element',
          tagName: 'thead',
          children: [{ type: 'element', tagName: 'tr', children: [element('th', [text('Guide')])] }],
        },
        {
          type: 'element',
          tagName: 'tbody',
          children: [
            {
              type: 'element',
              tagName: 'tr',
              children: [
                {
                  type: 'element',
                  tagName: 'td',
                  children: [
                    element('a', [text('Read guide')], { href: '/guide (draft).md' }),
                    element('br'),
                    text('<script>literal</script>'),
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const content = readTableContent(table);
    expect(serializeTable(content, 'plain')).toBe('Guide\nRead guide\n<script>literal</script>');
    expect(serializeTable(content, 'markdown')).toBe(
      '| Guide |\n| --- |\n| [Read guide](/guide%20\\(draft\\).md)<br><script>literal</script> |',
    );
  });

  it('pads ragged rows consistently and treats absent tables as empty rather than fabricating cells', () => {
    const content = {
      rows: [
        [
          { plain: 'A', markdown: 'A' },
          { plain: 'B', markdown: 'B' },
        ],
        [{ plain: 'Only', markdown: 'Only' }],
      ],
      alignment: [],
    };
    expect(serializeTable(content, 'csv')).toBe('A,B\r\nOnly,');
    expect(serializeTable(content, 'markdown')).toBe('| A | B |\n| --- | --- |\n| Only |  |');
    expect(serializeTable(readTableContent(undefined), 'plain')).toBe('');
  });
});
