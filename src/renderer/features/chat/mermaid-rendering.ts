import DOMPurify from 'dompurify';

const cache = new Map<string, { promise: Promise<string | null>; settled: boolean }>();
let queue: Promise<unknown> = Promise.resolve();
let sequence = 0;
const remoteCss = /url\(\s*(?!['"]?#)[^)]*\)/gi;
export function diagramSourceSafe(source: string): boolean {
  // Mermaid lays out temporary DOM before returning SVG. Reject resource-bearing
  // constructs before that work so final sanitization cannot come too late.
  return (
    source.length <= 64 * 1024 &&
    !/\b(?:img|image)\s*:/i.test(source) &&
    !/<(?:img|image|iframe|object|embed)\b/i.test(source) &&
    !/\b(?:classDef|style|linkStyle)\b[^;\n]*\\/i.test(source) &&
    !/url\(\s*(?!['"]?#)[^)]*\)/i.test(source) &&
    !/@import\b/i.test(source)
  );
}
export function sanitizeDiagram(svg: string): string {
  const purifier = DOMPurify(window);
  purifier.addHook('uponSanitizeElement', (node, data) => {
    if (data.tagName === 'style' && node.textContent)
      node.textContent = node.textContent.replace(remoteCss, 'none').replace(/@import\s+[^;]+;?/gi, '');
  });
  purifier.addHook('uponSanitizeAttribute', (_node, data) => {
    if (data.attrName === 'style') data.attrValue = data.attrValue.replace(remoteCss, 'none');
  });
  return purifier.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_ATTR: ['href', 'xlink:href', 'src', 'srcset'],
    FORBID_TAGS: ['a', 'img', 'image', 'script', 'foreignObject', 'animate', 'set'],
  });
}
async function renderDiagram(source: string): Promise<string | null> {
  if (!diagramSourceSafe(source)) return null;
  const id = `vandashi-diagram-${String(++sequence)}`;
  try {
    const module = await import('mermaid');
    module.default.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      maxTextSize: 64 * 1024,
      maxEdges: 500,
      secure: [
        'secure',
        'securityLevel',
        'startOnLoad',
        'maxTextSize',
        'maxEdges',
        'suppressErrorRendering',
        'htmlLabels',
        'themeCSS',
      ],
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      theme: 'dark',
    });
    const result = await module.default.render(id, source);
    return sanitizeDiagram(result.svg);
  } catch {
    return null;
  } finally {
    document.getElementById(`d${id}`)?.remove();
  }
}
/** StrictMode reuses pending renders; Mermaid's mutable global configuration renders serially. */
export function diagramPromise(source: string): Promise<string | null> {
  const known = cache.get(source);
  if (known) return known.promise;
  const task = queue.then(() => renderDiagram(source));
  queue = task;
  const entry = { promise: task, settled: false };
  cache.set(source, entry);
  void task.then(() => {
    entry.settled = true;
    for (const [key, cached] of cache) {
      if (cache.size <= 32) break;
      if (cached.settled) cache.delete(key);
    }
  });
  return task;
}
