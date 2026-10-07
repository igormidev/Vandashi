/** A browser-owned filename cannot carry directories, control characters, or platform device names. */
export function planMarkdownFilename(title: string, fallback: string): string {
  const cleanTitle = (value: string) =>
    value
      .normalize('NFKC')
      .replace(/\.md$/i, '')
      .replace(/[\p{Cc}<>:"/\\|?*]/gu, '_')
      .replace(/^[.\s]+|[.\s]+$/g, '')
      .slice(0, 100)
      .trim();
  const clean = cleanTitle(title) || cleanTitle(fallback);
  const reserved = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean);
  return `${reserved ? '_' : ''}${clean}.md`;
}
