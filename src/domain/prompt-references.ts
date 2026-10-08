export interface PromptPathToken {
  start: number;
  end: number;
  value: string;
}

/** Source offsets preserve the whole document, including its Markdown and quoted paths. */
export function promptPathTokens(text: string): PromptPathToken[] {
  const result: PromptPathToken[] = [];
  const blocked = [...text.matchAll(/\b[a-z][a-z\d+.-]*:[^\s)\]>"]+/giu)]
    .filter((match) => !/^[A-Za-z]:[/\\]/u.test(match[0]))
    .map((match) => ({ start: match.index, end: match.index + match[0].length }));
  const add = (start: number, source: string, value = source) => {
    if (blocked.some((entry) => start < entry.end && start + source.length > entry.start)) return;
    if (!value || (/^(?:[a-z]+:|#)/iu.test(value) && !/^[A-Za-z]:[/\\]/u.test(value))) return;
    if (/[<>\n\r\0]/u.test(value)) return;
    if (result.some((entry) => start < entry.end && start + source.length > entry.start)) return;
    result.push({ start, end: start + source.length, value });
  };
  for (const match of text.matchAll(/"(?:[^"\\\n]|\\.)*"/gu)) {
    try {
      const value: unknown = JSON.parse(match[0]);
      if (typeof value === 'string' && /^(?:\/|[A-Za-z]:[/\\])/u.test(value))
        add(match.index + 1, match[0].slice(1, -1), value);
    } catch {
      /* Malformed quotations are ordinary document content. */
    }
  }
  for (const match of text.matchAll(/\]\((?:<([^>\n]+)>|([^\s)]+))(?:\s+"[^"\n]*")?\)/gu)) {
    const value = match[1] ?? match[2];
    if (value) {
      try {
        const decoded = decodeURIComponent(value.split('#')[0] ?? '');
        add(match.index + match[0].indexOf(value), value, decoded);
      } catch {
        blocked.push({ start: match.index, end: match.index + match[0].length });
        /* Invalid local URL encoding is not a file grant. */
      }
    }
  }
  for (const match of text.matchAll(/`([^`\n]+)`/gu)) {
    const value = match[1];
    if (
      value &&
      /\.(?:md|markdown|txt|ya?ml|json|toml|html|tsx?|jsx?|css|svg|png|jpe?g|webp|mp4|mov|mp3|wav)$/iu.test(
        value,
      )
    )
      add(match.index + 1, value);
  }
  for (const match of text.matchAll(
    /(?:(?:[A-Za-z]:)?[/\\]|\.\.?[/\\])?(?:[\p{L}\p{N}_@.-]+[/\\])*[\p{L}\p{N}_-]+\.(?:md|markdown|txt|ya?ml|json|toml)\b/giu,
  ))
    add(match.index, match[0]);
  return result.sort((a, b) => a.start - b.start);
}
