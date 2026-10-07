import type { BundledLanguage } from 'shiki/bundle/web';

export interface CodeToken {
  text: string;
  color?: string;
}
const cache = new Map<string, Promise<CodeToken[][] | null>>();
/** Bundled grammars use Shiki's WASM engine; tokens render as React text, never raw HTML. */
export function highlightCode(source: string, language: string): Promise<CodeToken[][] | null> {
  if (!language || source.length > 64 * 1024) return Promise.resolve(null);
  const key = `${language}\n${source}`;
  const known = cache.get(key);
  if (known) return known;
  const task = import('shiki/bundle/web')
    .then(async (module) => {
      if (!Object.hasOwn(module.bundledLanguages, language)) return null;
      const result = await module.codeToTokens(source, {
        lang: language as BundledLanguage,
        theme: 'github-dark',
      });
      return result.tokens.map((line) =>
        line.map((token) => ({
          text: token.content,
          ...(token.color && /^#[\da-f]{3,8}$/i.test(token.color) ? { color: token.color } : {}),
        })),
      );
    })
    .catch(() => null);
  cache.set(key, task);
  if (cache.size > 32) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return task;
}
