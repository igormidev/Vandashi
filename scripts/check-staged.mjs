import { createHash } from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

const git = (cwd, args, env = process.env) =>
  execFileSync('git', ['-C', cwd, ...args], { env, encoding: 'utf8' }).trimEnd();
const root = git(process.cwd(), ['rev-parse', '--show-toplevel']);
const indexPath = resolve(root, git(root, ['rev-parse', '--git-path', 'index']));
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));
let temporary;
let child;
let interrupted = false;
function interrupt(signal) {
  interrupted = true;
  if (!child?.pid) return;
  try {
    if (process.platform === 'win32')
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    else process.kill(-child.pid, signal ?? 'SIGTERM');
  } catch (error) {
    if (error.code !== 'ESRCH') console.error(error.message);
  }
}
process.on('SIGINT', interrupt);
process.on('SIGTERM', interrupt);

async function command(program, args, cwd, env) {
  if (interrupted) throw new Error('Staged checks interrupted.');
  await new Promise((accept, reject) => {
    child = spawn(program, args, {
      cwd,
      env,
      stdio: 'inherit',
      detached: process.platform !== 'win32',
      shell: process.platform === 'win32' && program.endsWith('.cmd'),
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      child = undefined;
      if (code === 0 && !signal && !interrupted) accept();
      else reject(new Error(`Staged checks failed (${signal ?? String(code)}).`));
    });
  });
}

async function verifyInstall(tree) {
  // Reusing the installed runtime is safe only with the same staged install inputs.
  // Hook code must match too, so an unstaged helper cannot silently change this gate.
  for (const path of [
    'package.json',
    'package-lock.json',
    '.githooks/pre-commit',
    'scripts/check-staged.mjs',
  ]) {
    const staged = execFileSync('git', ['-C', root, 'show', `${tree}:${path}`]);
    if (!staged.equals(await readFile(join(root, path))))
      throw new Error(`Stage ${path} before checking the commit; its working copy differs from the index.`);
  }
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  const installed = JSON.parse(await readFile(join(root, 'node_modules/.package-lock.json'), 'utf8'));
  if (!lock.packages || !installed.packages)
    throw new Error('Run npm ci to create a current dependency installation.');
  for (const [path, entry] of Object.entries(installed.packages)) {
    const expected = lock.packages[path];
    if (!expected || ['version', 'resolved', 'integrity', 'link'].some((key) => expected[key] !== entry[key]))
      throw new Error(`Run npm ci: installed ${path} does not match the staged lockfile.`);
  }
  // Detect missing, invalid and extraneous packages, including manually changed package versions.
  execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['ls', '--all', '--json'], {
    cwd: root,
    env: cleanEnv,
    stdio: 'pipe',
    shell: process.platform === 'win32',
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function check() {
  temporary = await mkdtemp(join(tmpdir(), 'vandashi-staged-'));
  const originalIndex = await readFile(indexPath);
  const checkoutEnv = { ...process.env, GIT_INDEX_FILE: join(temporary, 'index') };
  await writeFile(checkoutEnv.GIT_INDEX_FILE, originalIndex);
  // write-tree updates the index cache, so use only our private copy.
  const tree = git(root, ['write-tree'], checkoutEnv);
  await verifyInstall(tree);
  const snapshot = join(temporary, 'checkout');
  await mkdir(snapshot);
  const entries = git(root, ['ls-tree', '-rz', tree]).split('\0').filter(Boolean);
  if (entries.some((entry) => entry.startsWith('160000 ')))
    throw new Error('Staged submodules cannot be verified by this source gate.');
  git(root, ['read-tree', tree], checkoutEnv);
  git(
    root,
    [
      '-c',
      'core.autocrlf=false',
      '-c',
      'core.symlinks=true',
      'checkout-index',
      '--all',
      `--prefix=${snapshot}${sep}`,
    ],
    checkoutEnv,
  );
  // Keep internal symlinks as symlinks, but never check bytes outside the immutable snapshot.
  const canonicalSnapshot = await realpath(snapshot);
  for (const entry of entries.filter((entry) => entry.startsWith('120000 '))) {
    const path = entry.slice(entry.indexOf('\t') + 1);
    const target = relative(canonicalSnapshot, await realpath(join(snapshot, path)));
    if (isAbsolute(target) || target === '..' || target.startsWith(`..${sep}`))
      throw new Error(`Staged symlink escapes the source snapshot: ${path}`);
  }
  // Checkout filters must never silently substitute other bytes for the staged source.
  const algorithm = git(root, ['rev-parse', '--show-object-format']);
  for (const entry of entries.filter((entry) => /^100(644|755) /.test(entry))) {
    const separator = entry.indexOf('\t');
    const path = entry.slice(separator + 1);
    const object = entry.slice(0, separator).split(' ')[2];
    const bytes = await readFile(join(snapshot, path));
    const actual = createHash(algorithm).update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (actual !== object) throw new Error(`Checkout filter changed staged bytes: ${path}`);
  }
  await symlink(
    resolve(root, 'node_modules'),
    join(snapshot, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await command(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'check'], snapshot, {
    ...cleanEnv,
    PWD: snapshot,
    INIT_CWD: snapshot,
  });
  if (!(await readFile(indexPath)).equals(originalIndex))
    throw new Error('The index changed during checks. Review the staged changes and retry the commit.');
}

try {
  await check();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  // The checkout is exclusively ours; neither the original index nor working tree was modified.
  if (temporary) await rm(temporary, { recursive: true, force: true });
  process.off('SIGINT', interrupt);
  process.off('SIGTERM', interrupt);
}
