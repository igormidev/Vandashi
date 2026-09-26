import { readFile, writeFile } from 'node:fs/promises';

const read = async (path) => JSON.parse(await readFile(path, 'utf8'));
const write = async (path, data) => writeFile(path, `${JSON.stringify(data, null, 2)}\n`);
const manifest = await read('release.json');
const pkg = await read('package.json');
const lock = await read('package-lock.json');
if (
  !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(manifest.version) ||
  manifest.version !== pkg.version ||
  manifest.version !== lock.version ||
  manifest.version !== lock.packages[''].version ||
  !Array.isArray(manifest.notes) ||
  manifest.notes.length < 1 ||
  manifest.notes.length > 3 ||
  manifest.notes.some((note) => typeof note !== 'string' || !note.trim() || note.length > 160)
)
  throw new Error(
    'Keep release.json, package.json and package-lock.json versions aligned, with 1–3 concise release notes.',
  );

if (process.argv[2] === 'bump') {
  const notes = process.argv.slice(3).map((note) => note.trim());
  if (!notes.length || notes.length > 3 || notes.some((note) => !note || note.length > 160))
    throw new Error('Provide 1–3 release notes of at most 160 characters each.');
  const parts = manifest.version.split('.').map(Number);
  if (parts.some((part) => !Number.isSafeInteger(part)) || !Number.isSafeInteger(parts[2] + 1))
    throw new Error('Version exceeds the supported integer range.');
  parts[2]++;
  const version = parts.join('.');
  await write('release.json', { version, notes });
  await write('package.json', { ...pkg, version });
  lock.version = version;
  lock.packages[''].version = version;
  await write('package-lock.json', lock);
  console.log(`Prepared Vandashi ${version}.`);
} else if (process.argv[2] !== undefined && process.argv[2] !== 'check') {
  throw new Error('Use check or bump followed by concise release notes.');
} else console.log(`Vandashi ${manifest.version}: release version and notes are valid.`);
