import { execFile } from 'node:child_process';
import { access, appendFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const execute = promisify(execFile);
// Match the Chrome revision managed by pinned Hyperframes 0.8.64.
export const browserBuild = '152.0.7977.30';

export async function packagedExecutable(directory, platform = process.platform) {
  const matches = [];
  for (const item of await readdir(directory, { withFileTypes: true })) {
    if (!item.isDirectory()) continue;
    if (platform === 'darwin' && /^mac(?:-|$)/.test(item.name)) {
      const app = join(directory, item.name, 'Vandashi.app', 'Contents', 'MacOS', 'Vandashi');
      if (await exists(app)) matches.push(app);
    } else if (platform === 'win32' && /^win(?:-[\w]+)?-unpacked$/.test(item.name)) {
      const app = join(directory, item.name, 'Vandashi.exe');
      if (await exists(app)) matches.push(app);
    } else if (platform === 'linux' && /^linux(?:-[\w]+)?-unpacked$/.test(item.name)) {
      const app = join(directory, item.name, 'vandashi');
      if (await exists(app)) matches.push(app);
    }
  }
  if (matches.length !== 1)
    throw new Error(`Expected one ${platform} unpacked app in ${directory}; found ${matches.length}.`);
  return resolve(matches[0]);
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function executable(name, environment = process.env) {
  const key = Object.keys(environment).find((entry) => entry.toLowerCase() === 'path');
  for (const directory of (environment[key] ?? '').split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
    try {
      await access(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      return resolve(candidate);
    } catch {
      // The next PATH directory may contain the installed executable.
    }
  }
  throw new Error(`Required packaged test tool is missing: ${name}`);
}

export function environmentLines(environment) {
  return Object.entries(environment)
    .map(([name, value]) => {
      if (!/^[A-Z][A-Z_]+$/.test(name) || /[\r\n]/.test(value))
        throw new Error('Unsafe GitHub environment-file value.');
      return `${name}=${value}\n`;
    })
    .join('');
}

async function main() {
  const { values } = parseArgs({
    options: {
      release: { type: 'string', default: 'release' },
      app: { type: 'string' },
      browser: { type: 'string' },
      'environment-file': { type: 'string', default: process.env.GITHUB_ENV },
    },
  });
  const release = resolve(values.release);
  const app = values.app ? resolve(values.app) : await packagedExecutable(release);
  await access(app);
  const tools = Object.fromEntries(
    await Promise.all(['git', 'ffmpeg', 'ffprobe'].map(async (name) => [name, await executable(name)])),
  );
  const cache = join(release, 'smoke-cache');
  let browser = values.browser ? resolve(values.browser) : undefined;
  if (!browser) {
    const require = createRequire(import.meta.url);
    const vendor = dirname(require.resolve('hyperframes/package.json'));
    const runtime = await readFile(join(vendor, 'dist', 'renderSetupWorker.js'), 'utf8');
    if (!runtime.includes(`var CHROME_VERSION = "${browserBuild}"`))
      throw new Error('Review the packaged test browser pin after the Hyperframes upgrade.');
    const browsers = await import(pathToFileURL(require.resolve('@puppeteer/browsers')).href);
    const installed = await browsers.install({
      browser: browsers.Browser.CHROMEHEADLESSSHELL,
      buildId: browserBuild,
      cacheDir: join(cache, 'browser'),
    });
    browser = installed.executablePath;
  }
  await access(browser);
  const versions = {};
  for (const [name, path] of Object.entries({ ...tools, browser })) {
    const { stdout } = await execute(path, [name.startsWith('ff') ? '-version' : '--version'], {
      timeout: 15_000,
      windowsHide: true,
    });
    versions[name] = stdout.trim().split(/\r?\n/)[0];
  }
  const environment = {
    VANDASHI_REQUIRE_PACKAGED_SMOKE: '1',
    VANDASHI_PACKAGED_APP: app,
    VANDASHI_SPEECH_MODEL_CACHE: join(cache, 'models'),
    VANDASHI_SMOKE_GIT_PATH: tools.git,
    VANDASHI_PACKAGE_AGENT_SMOKE: '0',
    HYPERFRAMES_FFMPEG_PATH: tools.ffmpeg,
    HYPERFRAMES_FFPROBE_PATH: tools.ffprobe,
    HYPERFRAMES_BROWSER_PATH: browser,
  };
  await mkdir('test-results', { recursive: true });
  if (values['environment-file']) await appendFile(values['environment-file'], environmentLines(environment));
  process.stdout.write(`${JSON.stringify({ environment, versions }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
