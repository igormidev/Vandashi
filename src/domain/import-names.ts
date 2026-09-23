import { defaultImportedClipName, defaultImportedVideoName } from './defaults';

const encoder = new TextEncoder();
const deviceName = /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³]|conin\$|conout\$)(?:\.|$)/iu;

/** Bound both Windows UTF-16 names and common Unix byte limits without splitting a code point. */
function bounded(value: string, suffix: string): string {
  let result = '';
  let bytes = encoder.encode(suffix).length;
  for (const character of value) {
    const size = encoder.encode(character).length;
    if (result.length + character.length + suffix.length > 100 || bytes + size > 200) break;
    result += character;
    bytes += size;
  }
  return result.replace(/[. ]+$/u, '') + suffix;
}

function portable(value: string, fallback: string, suffix = ''): string {
  let name = value
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\p{Cc}]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .replace(/^[. ]+|[. ]+$/gu, '');
  if (!name) name = fallback;
  if (deviceName.test(name)) name = `_${name}`;
  return bounded(name, suffix);
}

export function importedClipName(sourcePath: string): string {
  const filename = sourcePath.split(/[\\/]/u).at(-1) ?? '';
  return portable(filename.replace(/\.[^.]*$/u, ''), defaultImportedClipName);
}

/** The media copy may need a portable filename even when its original name is valid on this OS. */
export function importedMediaFilename(filename: string): string {
  const extension = filename.match(/\.[^.]+$/u)?.[0] ?? '';
  return portable(filename.slice(0, filename.length - extension.length), defaultImportedVideoName, extension);
}

export function numberedImportName(base: string, ordinal: number): string {
  return portable(base, defaultImportedClipName, ordinal === 1 ? '' : ` (${String(ordinal)})`);
}
