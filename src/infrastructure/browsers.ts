import { execFile } from 'node:child_process';
import { readdir, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { InstalledBrowser } from '../domain/browsers';
import { macBrowserIcon } from './mac-browser-icon';

const execute = promisify(execFile);
const knownNames =
  /^(?:Google Chrome(?: Canary)?|Chromium|Safari|Firefox(?: Developer Edition| Nightly)?|Zen|Zen Browser|Arc|Helium|Brave Browser|Brave|Microsoft Edge(?: Beta| Dev| Canary)?|Opera(?: GX)?|Vivaldi|Orion|Waterfox|LibreWolf|Floorp|Thorium|Yandex|DuckDuckGo|Comet)$/iu;

async function entries(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

/** Inspects application registrations only; never launches a discovered executable. */
export async function discoverBrowsers(
  icon: (path: string) => Promise<string | null>,
  platform = process.platform,
  home = homedir(),
): Promise<InstalledBrowser[]> {
  const found = new Map<string, InstalledBrowser>();
  const add = async (name: string, path: string, bundleIcon?: string | null) => {
    if (!name.trim() || found.has(name.toLocaleLowerCase())) return;
    const canonical = await realpath(path);
    found.set(name.toLocaleLowerCase(), {
      name,
      icon: bundleIcon === undefined ? await icon(canonical).catch(() => null) : bundleIcon,
    });
  };
  if (platform === 'darwin') {
    for (const directory of ['/Applications', '/System/Applications', join(home, 'Applications')]) {
      for (const entry of await entries(directory)) {
        if (!entry.endsWith('.app')) continue;
        const path = join(directory, entry);
        try {
          const { stdout } = await execute(
            '/usr/bin/plutil',
            ['-convert', 'json', '-o', '-', join(path, 'Contents/Info.plist')],
            { timeout: 3000, maxBuffer: 2_000_000 },
          );
          const info: unknown = JSON.parse(stdout);
          if (!info || typeof info !== 'object') continue;
          const data = info as Record<string, unknown>;
          const name = entry.slice(0, -4);
          const registrations = Array.isArray(data.CFBundleURLTypes) ? data.CFBundleURLTypes : [];
          const web = registrations.some((registration: unknown) => {
            if (!registration || typeof registration !== 'object') return false;
            const schemes = (registration as Record<string, unknown>).CFBundleURLSchemes;
            return Array.isArray(schemes) && schemes.includes('http') && schemes.includes('https');
          });
          if (web || knownNames.test(name))
            await add(name, path, await macBrowserIcon(path, data.CFBundleIconFile));
        } catch {
          /* A removed or invalid application is not an installed browser. */
        }
      }
    }
  } else if (platform === 'linux') {
    for (const directory of [
      '/usr/share/applications',
      '/usr/local/share/applications',
      join(home, '.local/share/applications'),
    ]) {
      for (const entry of await entries(directory)) {
        if (!entry.endsWith('.desktop')) continue;
        try {
          const path = join(directory, entry);
          const content = await readFile(path, 'utf8');
          if (/^(?:Hidden|NoDisplay)=true$/mu.test(content)) continue;
          const name = /^Name=(.+)$/mu.exec(content)?.[1];
          if (name && (/^MimeType=.*x-scheme-handler\/https?;/mu.test(content) || knownNames.test(name)))
            await add(name, path);
        } catch {
          /* Ignore stale registrations. */
        }
      }
    }
  } else if (platform === 'win32') {
    // StartMenuInternet covers Chromium derivatives and Firefox without executing them.
    for (const hive of ['HKCU', 'HKLM']) {
      try {
        const { stdout } = await execute(
          'reg.exe',
          ['query', `${hive}\\Software\\Clients\\StartMenuInternet`, '/s'],
          { timeout: 5000, maxBuffer: 2_000_000 },
        );
        const blocks = stdout.split(/\r?\n(?=HKEY_)/u);
        for (const block of blocks) {
          if (!/\\shell\\open\\command\r?\n/u.test(block)) continue;
          const command = /REG_SZ\s+(.+)/u.exec(block)?.[1]?.trim();
          const path = command?.startsWith('"') ? /^"([^"]+)"/u.exec(command)?.[1] : command?.split(/\s/u)[0];
          const key = /StartMenuInternet\\([^\\\r\n]+)/u.exec(block)?.[1];
          if (path && key) await add(key.replace(/\.exe$/iu, ''), path).catch(() => undefined);
        }
      } catch {
        /* No browser registrations in this hive. */
      }
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}
