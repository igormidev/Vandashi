/** Resolve Markdown file references without granting access or allowing arbitrary URL schemes. */
export function messagePath(value: string, root: string): string | null {
  if (!value || Array.from(value).some((letter) => letter.charCodeAt(0) < 32) || value.startsWith('#'))
    return null;
  try {
    if (value.startsWith('file:')) {
      const url = new URL(value);
      if (url.hostname && url.hostname !== 'localhost') return null;
      const path = decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:\/)/, '$1');
      return path.startsWith('//') || Array.from(path).some((letter) => letter.charCodeAt(0) < 32)
        ? null
        : path;
    }
    const path = decodeURIComponent(value);
    if (path.startsWith('//') || Array.from(path).some((letter) => letter.charCodeAt(0) < 32)) return null;
    if (/^[A-Za-z]:[\\/]/.test(path) || path.startsWith('/')) return path;
    if (/^[A-Za-z][A-Za-z\d+.-]*:/.test(path) || path.startsWith('\\\\')) return null;
    return `${root}/${path}`;
  } catch {
    return null;
  }
}
