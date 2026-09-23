import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

const resultSchema = z.object({
  summary: z.object({
    violations: z.array(z.object({ from: z.string(), rule: z.object({ name: z.string() }) })),
  }),
});
let root = '';
let violations: z.infer<typeof resultSchema>['summary']['violations'] = [];
const disallowed = [
  ['domain', 'node:fs/promises'],
  ['domain', 'child_process'],
  ['domain', 'electron'],
  ['application', 'node:fs'],
  ['application', 'child_process'],
  ['application', 'electron'],
  ['application', 'exiftool-vendored'],
  ['renderer', 'node:fs'],
  ['renderer', 'electron'],
  ['renderer', 'hyperframes'],
  ['renderer', 'exiftool-vendored'],
  ['renderer', '@huggingface/transformers'],
  ['renderer', 'electron-vite'],
  ['landing', 'electron'],
  ['landing', 'node:fs'],
  ['landing', '../../src/renderer/view'],
] as const;
const allowed = [
  ['domain', './model'],
  ['application', '../domain/model'],
  ['application', 'node:path'],
  ['renderer', '../domain/model'],
  ['renderer', 'react'],
  ['renderer', '@hyperframes/player'],
  ['infrastructure', 'node:fs'],
  ['infrastructure', 'electron'],
  ['landing', 'react'],
] as const;
function sourcePath(layer: string, name: string) {
  return layer === 'landing' ? `landing/src/${name}.ts` : `src/${layer}/${name}.ts`;
}
async function file(path: string, text: string) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'vandashi-architecture-policy-'));
  await file('.dependency-cruiser.cjs', await readFile('.dependency-cruiser.cjs', 'utf8'));
  await file(
    'tsconfig.json',
    JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'Bundler' } }),
  );
  // Small real packages make bare-import resolution exercise the production rules, independently
  // of machine-specific node_modules symlinks and optional dependencies.
  const packages = [
    'electron',
    'hyperframes',
    'exiftool-vendored',
    '@huggingface/transformers',
    'electron-vite',
    'react',
    '@hyperframes/player',
  ];
  await file(
    'package.json',
    JSON.stringify({ dependencies: Object.fromEntries(packages.map((name) => [name, '1.0.0'])) }),
  );
  for (const name of packages) {
    await file(`node_modules/${name}/package.json`, JSON.stringify({ name, main: 'index.js' }));
    await file(`node_modules/${name}/index.js`, 'export const value = 1;');
  }
  await rename(join(root, 'node_modules'), join(root, 'installed-runtime'));
  await symlink(
    join(root, 'installed-runtime'),
    join(root, 'node_modules'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  await file('src/domain/model.ts', 'export const value = 1;');
  await file('src/renderer/view.ts', 'export const value = 1;');
  for (const [index, [layer, dependency]] of disallowed.entries())
    await file(sourcePath(layer, `invalid-${String(index)}`), `import '${dependency}';`);
  for (const [index, [layer, dependency]] of allowed.entries())
    await file(sourcePath(layer, `valid-${String(index)}`), `import '${dependency}';`);
  const run = spawnSync(
    process.execPath,
    [
      resolve('node_modules/dependency-cruiser/bin/dependency-cruise.mjs'),
      'src',
      'landing/src',
      '--config',
      '.dependency-cruiser.cjs',
      '--output-type',
      'json',
    ],
    { cwd: root, encoding: 'utf8' },
  );
  expect(run.error).toBeUndefined();
  expect(run.stderr).toBe('');
  violations = resultSchema.parse(JSON.parse(run.stdout)).summary.violations;
  expect(violations.filter((violation) => violation.rule.name === 'no-unresolved')).toEqual([]);
});
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe('production architecture import policy', () => {
  it.each(disallowed.map(([layer, dependency], index) => ({ layer, dependency, index })))(
    'rejects $layer access to $dependency',
    ({ layer, index }) => {
      expect(
        violations.filter((violation) => violation.from === sourcePath(layer, `invalid-${String(index)}`)),
      ).not.toHaveLength(0);
    },
  );
  it.each(allowed.map(([layer, dependency], index) => ({ layer, dependency, index })))(
    'permits $layer access to $dependency',
    ({ layer, index }) => {
      expect(
        violations.filter((violation) => violation.from === sourcePath(layer, `valid-${String(index)}`)),
      ).toHaveLength(0);
    },
  );
});
