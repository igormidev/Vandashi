import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { parseArgs } from 'node:util';

const sourceLauncher = fileURLToPath(new URL('../build/AppRun', import.meta.url));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function regularExecutable(path) {
  const file = await lstat(path);
  if (!file.isFile()) throw new Error(`Packaged executable must be a regular file: ${path}`);
  if (!(file.mode & 0o111)) throw new Error(`Packaged file must be executable: ${path}`);
}

export async function verifyLinuxPackage(directory, launcherSource = sourceLauncher) {
  const appDir = resolve(directory);
  const launcher = join(appDir, 'AppRun');
  const executable = join(appDir, 'vandashi');
  const desktop = join(appDir, 'vandashi.desktop');
  await regularExecutable(launcher);
  const [actualLauncher, expectedLauncher] = await Promise.all([
    readFile(launcher),
    readFile(launcherSource),
  ]);
  if (!actualLauncher.equals(expectedLauncher))
    throw new Error('Packaged AppImage launcher differs from the reviewed build/AppRun source.');
  const desktopInfo = await lstat(desktop);
  if (!desktopInfo.isFile()) throw new Error('Packaged desktop entry must be a regular file.');
  const desktopBytes = await readFile(desktop);
  let section = '';
  let desktopSections = 0;
  const commands = [];
  for (const line of desktopBytes.toString('utf8').split(/\r?\n/)) {
    if (line.startsWith('[')) {
      section = line;
      if (section === '[Desktop Entry]') desktopSections++;
    }
    if (line.startsWith('Exec=')) {
      if (section !== '[Desktop Entry]') throw new Error('Unexpected packaged desktop action.');
      commands.push(line.slice('Exec='.length));
    }
  }
  if (desktopSections !== 1 || commands.length !== 1 || commands[0] !== 'AppRun %U')
    throw new Error('Packaged desktop entry must invoke exactly AppRun %U without extra arguments.');
  await regularExecutable(executable);
  return {
    appDir,
    launcher,
    executable,
    desktop,
    desktopExec: commands[0],
    launcherSha256: sha256(actualLauncher),
    desktopSha256: sha256(desktopBytes),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const { values } = parseArgs({ options: { appdir: { type: 'string' } } });
    if (!values.appdir) throw new Error('Pass --appdir with the extracted AppImage directory.');
    process.stdout.write(`${JSON.stringify(await verifyLinuxPackage(values.appdir), null, 2)}\n`);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
