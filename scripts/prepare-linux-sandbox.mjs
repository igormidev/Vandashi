import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdtemp, readFile, realpath, rm, stat, writeFile } from 'node:fs/promises';
import { join, posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const restrictionPath = '/proc/sys/kernel/apparmor_restrict_unprivileged_userns';

function requireHostedRunner({ platform, environment, uid }) {
  if (
    platform !== 'linux' ||
    !Number.isInteger(uid) ||
    uid <= 0 ||
    environment.GITHUB_ACTIONS !== 'true' ||
    environment.RUNNER_ENVIRONMENT !== 'github-hosted' ||
    environment.RUNNER_OS !== 'Linux' ||
    !/^\d+$/.test(environment.GITHUB_RUN_ID ?? '')
  )
    throw new Error('Sandbox preparation requires a non-root GitHub-hosted Linux runner.');
}

function exactPath(value) {
  if (
    typeof value !== 'string' ||
    !/^\/[\p{L}\p{N}._/ -]+$/u.test(value) ||
    value === '/' ||
    posix.normalize(value) !== value ||
    value.endsWith('/')
  )
    throw new Error('An exact canonical absolute path without policy syntax is required.');
  return value;
}

function within(root, file) {
  const relative = posix.relative(root, file);
  return relative !== '' && relative !== '..' && !relative.startsWith('../') && !posix.isAbsolute(relative);
}

/** Pure decision/profile generation; never reads or changes host policy. */
export function linuxSandboxPlan({
  platform,
  environment,
  uid,
  restriction,
  osRelease,
  executable,
  workspace,
  temporaryDirectory,
}) {
  requireHostedRunner({ platform, environment, uid });
  exactPath(executable);
  exactPath(workspace);
  exactPath(temporaryDirectory);
  if (
    !['electron', 'vandashi'].includes(posix.basename(executable)) ||
    (!within(workspace, executable) && !within(temporaryDirectory, executable))
  )
    throw new Error('The executable path must identify Electron or Vandashi inside this CI job.');
  const value = restriction === null ? '0' : restriction.trim();
  if (value !== '0' && value !== '1') throw new Error('Unrecognized AppArmor namespace restriction value.');
  if (value === '0') return { status: 'not-required', executable };
  if (!/^ID=(?:ubuntu|"ubuntu")$/m.test(osRelease ?? ''))
    throw new Error('Restricted namespace preparation is supported only on Ubuntu runners.');
  const hash = createHash('sha256').update(executable).digest('hex').slice(0, 24);
  const profileName = `vandashi-ci-${environment.GITHUB_RUN_ID}-${hash}`;
  // Ubuntu 24.04's documented per-executable permission keeps Chromium's own sandbox enabled:
  // https://discourse.ubuntu.com/t/ubuntu-24-04-lts-noble-numbat-release-notes/39890
  const profile = `abi <abi/4.0>,\nprofile ${profileName} "${executable}" flags=(unconfined) {\n  userns,\n}\n`;
  return { status: 'required', executable, profileName, profile };
}

async function main() {
  const context = { platform: process.platform, environment: process.env, uid: process.getuid?.() };
  // Refuse local/self-hosted invocations before any privileged command or temporary policy write.
  requireHostedRunner(context);
  if (process.argv.length !== 3)
    throw new Error('Usage: node scripts/prepare-linux-sandbox.mjs <executable>');
  const workspace = await realpath(exactPath(process.env.GITHUB_WORKSPACE));
  const temporaryDirectory = await realpath(exactPath(process.env.RUNNER_TEMP));
  const executable = await realpath(resolve(process.argv[2]));
  const restriction = await readFile(restrictionPath, 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return null;
    throw error;
  });
  const osRelease = await readFile('/etc/os-release', 'utf8');
  const plan = linuxSandboxPlan({
    ...context,
    restriction,
    osRelease,
    executable,
    workspace,
    temporaryDirectory,
  });
  if (!(await stat(executable)).isFile()) throw new Error('The sandbox target must be a regular executable.');
  await access(executable, constants.X_OK);
  if (plan.status === 'not-required') {
    process.stdout.write(`${JSON.stringify(plan)}\n`);
    return;
  }
  const directory = await mkdtemp(join(temporaryDirectory, 'vandashi-apparmor-'));
  try {
    const profilePath = join(directory, 'profile');
    await writeFile(profilePath, plan.profile, { flag: 'wx', mode: 0o600 });
    // No /etc profile, cache, sysctl or persistent host changes. Only this ephemeral job's exact path.
    await execute(
      '/usr/bin/sudo',
      ['-n', '/usr/sbin/apparmor_parser', '--replace', '--skip-cache', profilePath],
      {
        timeout: 30_000,
      },
    );
    process.stdout.write(
      `${JSON.stringify({ status: 'loaded', executable, profileName: plan.profileName })}\n`,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  await main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
