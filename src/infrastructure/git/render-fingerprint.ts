import { createHash } from 'node:crypto';
import { basename, extname, posix } from 'node:path';

const packaging = new Set(['.vandashi.yml', 'video_packaging.yml', 'launch.yml']);
const sourceExtensions = new Set([
  '.html',
  '.htm',
  '.css',
  '.js',
  '.mjs',
  '.cjs',
  '.jsx',
  '.ts',
  '.tsx',
  '.json',
  '.svg',
  '.yaml',
  '.yml',
  '.toml',
]);
const scriptExtensions = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx']);
// Pinned GSAP 3.15.0 is animation infrastructure, not project-specific resource resolution.
// A modified or upgraded library is deliberately treated as unknown until reviewed again.
const animationLibraries = new Set(['92bb9a96476f983d212a2bc4f54c889039c1696dd4461d40a736860938570fbb']);

function literals(value: string): boolean {
  try {
    JSON.parse(`[${value.replace(/([{,]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":')}]`);
    return true;
  } catch {
    return false;
  }
}

/** Only literal GSAP timeline operations are confidently free of dynamic media dependencies. */
function staticAnimation(script: string): boolean {
  if (/[`\\]/.test(script)) return false;
  const code = script
    .replace(/'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"/g, '""')
    .replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');
  const timelines = new Set<string>();
  for (const statement of code
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)) {
    const declaration = /^(?:const|let|var)\s+(\w+)\s*=\s*gsap\.timeline\((.*)\)$/s.exec(statement);
    if (declaration && literals(declaration[2] ?? '')) {
      timelines.add(declaration[1] ?? '');
      continue;
    }
    const animation = /^(\w+)\.(?:to|from|fromTo|set)\((.*)\)$/s.exec(statement);
    if (animation && timelines.has(animation[1] ?? '') && literals(animation[2] ?? '')) continue;
    if (/^window\.__timelines\s*=\s*(?:window\.__timelines\s*\|\|\s*)?\{\s*\}$/.test(statement)) continue;
    const registration = /^window\.__timelines\.\w+\s*=\s*(\w+)$/.exec(statement);
    if (registration && timelines.has(registration[1] ?? '')) continue;
    return false;
  }
  return true;
}

function decoded(value: string): string {
  return value
    .replace(/(?:%[\da-f]{2})+/gi, (sequence) => {
      try {
        return decodeURIComponent(sequence);
      } catch {
        return sequence;
      }
    })
    .toLowerCase();
}

/** Release artwork is independent only when every render source can be classified safely. */
export async function renderFingerprint(
  entries: string[],
  read: (path: string) => Promise<string>,
): Promise<string> {
  const records = entries
    .filter(Boolean)
    .map((entry) => ({ entry, path: entry.slice(entry.indexOf('\t') + 1) }));
  const source = records.filter(({ path }) => !packaging.has(path));
  const thumbnails = source.filter(({ path }) => path.startsWith('thumbnails/'));
  if (!thumbnails.length) return digest(source.map(({ entry }) => entry));
  const names = thumbnails.map(({ path }) => decoded(basename(path)));
  let dependent = false;
  for (const { entry, path } of source) {
    if (path.startsWith('thumbnails/') || path.endsWith('.vandashi.json')) continue;
    if (entry.startsWith('120000 ') || extname(path) === '.wasm') {
      dependent = true;
      break;
    }
    const extension = extname(path).toLowerCase();
    if (!sourceExtensions.has(extension)) continue;
    const text = await read(path);
    if (text.length > 2_000_000) {
      dependent = true;
      break;
    }
    const normalized = decoded(text);
    if (normalized.includes('thumbnails') || names.some((name) => normalized.includes(name))) {
      dependent = true;
      break;
    }
    if (animationLibraries.has(createHash('sha256').update(text).digest('hex'))) continue;
    if (scriptExtensions.has(extension) && !staticAnimation(text)) {
      dependent = true;
      break;
    }
    if (extension === '.css' && /\\/.test(text)) {
      dependent = true;
      break;
    }
    if (extension === '.html' || extension === '.htm' || extension === '.svg') {
      if (/\bon\w+\s*=|javascript\s*:|&#|\\|<(?:iframe|object|embed)\b/i.test(text)) {
        dependent = true;
        break;
      }
      const scripts = [...text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
      if ((text.match(/<script\b/gi)?.length ?? 0) !== scripts.length) {
        dependent = true;
        break;
      }
      for (const match of scripts) {
        const attributes = match[1] ?? '';
        if (/\bhref\s*=/i.test(attributes)) {
          dependent = true;
          break;
        }
        const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attributes)?.[1];
        const target =
          src && posix.normalize(src.startsWith('/') ? src.slice(1) : posix.join(posix.dirname(path), src));
        if (
          (/\bsrc\s*=/i.test(attributes) && !src) ||
          (src &&
            (!records.some((record) => record.path === target) ||
              !scriptExtensions.has(extname(target ?? '').toLowerCase()) ||
              /^(?:https?:)?\/\//i.test(src)))
        ) {
          dependent = true;
          break;
        }
        if (!staticAnimation(match[2] ?? '')) {
          dependent = true;
          break;
        }
      }
      if (dependent) break;
    }
  }
  return digest(
    source.filter(({ path }) => dependent || !path.startsWith('thumbnails/')).map(({ entry }) => entry),
  );
}
function digest(entries: string[]): string {
  return createHash('sha256').update(entries.join('\0')).digest('hex');
}
