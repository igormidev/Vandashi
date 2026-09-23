import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const launcher = resolve('build/AppRun');
const verifier = resolve('scripts/verify-linux-package.mjs');
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
let root = '';
let appDir = '';
let report = '';

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'vandashi-linux-launcher-'));
  appDir = join(root, 'App Dir with spaces');
  report = join(root, 'received.json');
  await mkdir(appDir);
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function prepareAppDir() {
  await copyFile(launcher, join(appDir, 'AppRun'));
  await chmod(join(appDir, 'AppRun'), 0o755);
  await writeFile(
    join(appDir, 'probe.mjs'),
    `import { writeFileSync } from 'node:fs';
writeFileSync(process.env.TEST_REPORT, JSON.stringify({ args: process.argv.slice(2), env: process.env }));
process.exit(Number(process.env.TEST_EXIT || 0));`,
  );
  await writeFile(
    join(appDir, 'vandashi'),
    `#!/bin/sh\nexec ${quote(process.execPath)} ${quote(join(appDir, 'probe.mjs'))} "$@"\n`,
    { mode: 0o755 },
  );
  await writeFile(
    join(appDir, 'vandashi.desktop'),
    '[Desktop Entry]\nName=Vandashi\nExec=AppRun %U\nTerminal=false\nType=Application\n',
  );
}

async function received() {
  return JSON.parse(await readFile(report, 'utf8')) as {
    args: string[];
    env: Record<string, string>;
  };
}

function verify() {
  return spawnSync(process.execPath, [verifier, '--appdir', appDir], {
    encoding: 'utf8',
    timeout: 5000,
  });
}

describe.skipIf(process.platform === 'win32')('Linux AppImage launcher', () => {
  it.each(['missing', 'failing'] as const)(
    'preserves arguments and AppImage environment when unshare is %s',
    async (unshare) => {
      await prepareAppDir();
      const tools = join(root, 'tools');
      await mkdir(tools);
      const probed = join(root, 'namespace-probed');
      if (unshare === 'failing')
        await writeFile(join(tools, 'unshare'), `#!/bin/sh\n: > ${quote(probed)}\nexit 1\n`, {
          mode: 0o755,
        });
      const args = ['--profile=workspace with spaces', 'file:///a b/日本語.svg', '', '$(not-a-command)', '*'];
      const result = spawnSync(join(appDir, 'AppRun'), args, {
        encoding: 'utf8',
        timeout: 5000,
        env: {
          APPDIR: appDir,
          APPIMAGE: join(root, 'Vandashi with spaces.AppImage'),
          OWD: root,
          ARGV0: './Vandashi with spaces.AppImage',
          PATH: tools,
          XDG_DATA_DIRS: '/existing/share',
          LD_LIBRARY_PATH: '/existing/libraries',
          GSETTINGS_SCHEMA_DIR: '/existing/schemas',
          TEST_REPORT: report,
        },
      });
      expect(result.status, result.stderr).toBe(0);
      expect(await received()).toMatchObject({
        args,
        env: {
          APPDIR: appDir,
          APPIMAGE: join(root, 'Vandashi with spaces.AppImage'),
          OWD: root,
          ARGV0: './Vandashi with spaces.AppImage',
          PATH: `${appDir}:${appDir}/usr/sbin:${tools}`,
          XDG_DATA_DIRS: `${appDir}/usr/share/:/existing/share:/usr/share/gnome:/usr/local/share/:/usr/share/`,
          LD_LIBRARY_PATH: `${appDir}/usr/lib:/existing/libraries`,
          GSETTINGS_SCHEMA_DIR: `${appDir}/usr/share/glib-2.0/schemas:/existing/schemas`,
        },
      });
      await expect(readFile(probed)).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('locates an extracted AppDir through a launcher symlink and preserves native failure', async () => {
    await prepareAppDir();
    const link = join(root, 'Launcher with spaces');
    await symlink(join(appDir, 'AppRun'), link);
    const result = spawnSync(link, [], {
      encoding: 'utf8',
      timeout: 5000,
      env: { PATH: '/usr/bin:/bin', TEST_REPORT: report, TEST_EXIT: '37' },
    });
    expect(result.status, result.stderr).toBe(37);
    expect(await received()).toMatchObject({ args: [], env: { APPDIR: await realpath(appDir) } });
  });

  it('does not silently succeed when the packaged executable is absent', async () => {
    await prepareAppDir();
    await rm(join(appDir, 'vandashi'));
    const result = spawnSync(join(appDir, 'AppRun'), [], {
      encoding: 'utf8',
      timeout: 5000,
      env: { APPDIR: appDir },
    });
    expect(result.status, result.stderr).not.toBe(0);
    expect(result.stderr).toContain(join(appDir, 'vandashi'));
    await expect(readFile(report)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.each(['copy', 'USE_HARD_LINKS', 'VITEST'] as const)(
    'the installed builder replaces its launcher or fails closed in %s mode',
    async (mode) => {
      await prepareAppDir();
      const stage = join(root, 'builder stage');
      await mkdir(stage);
      await writeFile(join(stage, 'AppRun'), '#!/bin/sh\nexec vandashi --no-sandbox\n', { mode: 0o755 });
      const env = { ...process.env };
      delete env.USE_HARD_LINKS;
      delete env.VITEST;
      if (mode !== 'copy') env[mode] = 'true';
      const result = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import { createRequire } from 'node:module';
const { copyDir } = createRequire(import.meta.url)('builder-util');
await copyDir(process.argv[1], process.argv[2]);`,
          appDir,
          stage,
        ],
        { env, encoding: 'utf8', timeout: 5000 },
      );
      if (mode === 'copy') {
        expect(result.status, result.stderr).toBe(0);
        expect(await readFile(join(stage, 'AppRun'))).toEqual(await readFile(launcher));
      } else {
        expect(result.status).not.toBe(0);
        expect(result.stderr).toContain('EEXIST');
      }
      expect(await readFile(join(appDir, 'AppRun'))).toEqual(await readFile(launcher));
    },
  );
});

describe.skipIf(process.platform === 'win32')('extracted AppImage verification', () => {
  it('accepts the owned executable launcher and clean desktop entry, recording their hashes', async () => {
    await prepareAppDir();
    const result = verify();
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      appDir,
      launcher: join(appDir, 'AppRun'),
      executable: join(appDir, 'vandashi'),
      desktopExec: 'AppRun %U',
      launcherSha256: createHash('sha256')
        .update(await readFile(launcher))
        .digest('hex'),
    });
  });

  it.each([
    [
      'desktop sandbox override',
      'vandashi.desktop',
      '[Desktop Entry]\nExec=AppRun --no-sandbox %U\n',
      'desktop',
    ],
    ['replaced launcher', 'AppRun', '#!/bin/sh\nexec "$APPDIR/vandashi" --no-sandbox "$@"\n', 'launcher'],
    [
      'duplicate desktop command',
      'vandashi.desktop',
      '[Desktop Entry]\nExec=AppRun %U\nExec=other %U\n',
      'desktop',
    ],
  ])('rejects %s', async (_name, path, content, message) => {
    await prepareAppDir();
    await writeFile(join(appDir, path), content);
    const result = verify();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(message);
    expect(result.stdout).toBe('');
  });

  it('rejects a non-executable launcher instead of claiming its source identity is enough', async () => {
    await prepareAppDir();
    await chmod(join(appDir, 'AppRun'), 0o644);
    const result = verify();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('executable');
  });

  it('rejects launcher indirection outside the extracted artifact', async () => {
    await prepareAppDir();
    await rm(join(appDir, 'AppRun'));
    await symlink(launcher, join(appDir, 'AppRun'));
    const result = verify();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('regular file');
  });
});
