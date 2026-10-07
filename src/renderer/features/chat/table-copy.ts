export type TableFormat = 'plain' | 'markdown' | 'csv';
interface TableNode {
  type: string;
  value?: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: readonly TableNode[];
}
interface TableCell {
  plain: string;
  markdown: string;
}
export interface TableContent {
  rows: TableCell[][];
  alignment: ('left' | 'right' | 'center' | null)[];
}
function text(node: TableNode): string {
  if (node.type === 'text') return node.value ?? '';
  if (node.tagName === 'br') return '\n';
  if (node.tagName === 'img')
    return typeof node.properties?.['alt'] === 'string' ? node.properties['alt'] : '';
  return (node.children ?? []).map(text).join('');
}
function markdown(node: TableNode): string {
  if (node.type === 'text') return (node.value ?? '').replace(/[\\|*_~[\]]/g, '\\$&');
  const contents = (node.children ?? []).map(markdown).join('');
  if (node.tagName === 'br') return '<br>';
  if (node.tagName === 'strong') return `**${contents}**`;
  if (node.tagName === 'em') return `_${contents}_`;
  if (node.tagName === 'del') return `~~${contents}~~`;
  if (node.tagName === 'code') {
    const value = text(node).replace(/\|/g, '\\|');
    const length = (value.match(/`+/g) ?? []).reduce((max, ticks) => Math.max(max, ticks.length), 0) + 1;
    const fence = '`'.repeat(length);
    const padding = /^[ `]|[ `]$/.test(value) ? ' ' : '';
    return `${fence}${padding}${value}${padding}${fence}`;
  }
  const href = node.properties?.['href'];
  if (node.tagName === 'a' && typeof href === 'string' && href)
    return `[${contents}](${href.replace(/ /g, '%20').replace(/\|/g, '%7C').replace(/[()]/g, '\\$&')})`;
  if (node.tagName === 'img') return text(node).replace(/[\\|]/g, '\\$&');
  return contents;
}
function alignment(node: TableNode): TableContent['alignment'][number] {
  const align = node.properties?.['align'];
  if (align === 'left' || align === 'right' || align === 'center') return align;
  const style = node.properties?.['style'];
  const value =
    typeof style === 'object' && style !== null
      ? (style as Record<string, unknown>)['textAlign']
      : typeof style === 'string'
        ? /text-align:\s*(left|right|center)/.exec(style)?.[1]
        : undefined;
  return value === 'left' || value === 'right' || value === 'center' ? value : null;
}
/** Read rendered Markdown's safe syntax tree, preserving semantic text and inline formatting. */
export function readTableContent(node: TableNode | undefined): TableContent {
  const content: TableContent = { rows: [], alignment: [] };
  const visit = (entry: TableNode) => {
    if (entry.tagName === 'tr') {
      const cells = (entry.children ?? []).filter(
        (child) => child.tagName === 'th' || child.tagName === 'td',
      );
      if (!content.rows.length) content.alignment = cells.map(alignment);
      content.rows.push(
        cells.map((cell) => ({ plain: text(cell), markdown: markdown(cell).replace(/\r?\n/g, '<br>') })),
      );
    } else for (const child of entry.children ?? []) visit(child);
  };
  if (node) visit(node);
  return content;
}
/** CSV quotes delimiters, quotes and newlines; plaintext is tab separated for native paste. */
export function serializeTable(content: TableContent, format: TableFormat): string {
  const columns = content.rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (!columns) return '';
  const rows = content.rows.map((row) =>
    Array.from({ length: columns }, (_, index) => row[index] ?? { plain: '', markdown: '' }),
  );
  if (format === 'plain') return rows.map((row) => row.map((cell) => cell.plain).join('\t')).join('\n');
  if (format === 'csv')
    return rows
      .map((row) =>
        row
          .map((cell) => (/[,"\r\n]/.test(cell.plain) ? `"${cell.plain.replace(/"/g, '""')}"` : cell.plain))
          .join(','),
      )
      .join('\r\n');
  const line = (row: TableCell[]) => `| ${row.map((cell) => cell.markdown).join(' | ')} |`;
  const separator = Array.from({ length: columns }, (_, index) =>
    content.alignment[index] === 'left'
      ? ':---'
      : content.alignment[index] === 'right'
        ? '---:'
        : content.alignment[index] === 'center'
          ? ':---:'
          : '---',
  );
  return [line(rows[0] ?? []), `| ${separator.join(' | ')} |`, ...rows.slice(1).map(line)].join('\n');
}
