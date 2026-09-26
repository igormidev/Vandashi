import { spawnSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

const { version } = JSON.parse(await readFile('release.json', 'utf8'));
if (!/^\d+\.\d+\.\d+$/.test(version) || !/^[a-f\d]{40}$/.test(process.env.GITHUB_SHA ?? ''))
  throw new Error('Invalid verified release identity.');
const directory = 'release-artifacts';
const tag = `v${version}`;
function gh(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'Release command failed.');
  return result.stdout;
}
// Existing lightweight or annotated tags must identify the exact verified checkout.
const refs = JSON.parse(gh(['api', `repos/${process.env.GITHUB_REPOSITORY}/git/matching-refs/tags/${tag}`]));
let tagged = refs.find((ref) => ref.ref === `refs/tags/${tag}`)?.object;
for (let depth = 0; tagged?.type === 'tag' && depth < 5; depth++)
  tagged = JSON.parse(gh(['api', `repos/${process.env.GITHUB_REPOSITORY}/git/tags/${tagged.sha}`])).object;
if (tagged && (tagged.type !== 'commit' || tagged.sha !== process.env.GITHUB_SHA))
  throw new Error('The version tag does not identify this verified source commit.');
// A published version is immutable. Reruns may only resume the draft for this exact source commit.
const listing = JSON.parse(gh(['api', `repos/${process.env.GITHUB_REPOSITORY}/releases?per_page=100`]));
const existing = listing.find((release) => release.tag_name === tag);
if (existing && (!existing.draft || existing.target_commitish !== process.env.GITHUB_SHA))
  throw new Error('This version already exists; bump the version instead of replacing a published release.');
if (!existing)
  gh([
    'release',
    'create',
    tag,
    '--draft',
    '--target',
    process.env.GITHUB_SHA,
    '--title',
    `Vandashi ${version}`,
    '--notes-file',
    join(directory, 'release-notes.md'),
  ]);
const assets = [];
for (const name of await readdir(directory, { recursive: true })) {
  const path = join(directory, name);
  if ((await stat(path)).isFile() && name !== 'release-notes.md') assets.push(path);
}
if (!assets.some((path) => path.endsWith('update.json')) || !assets.some((path) => path.endsWith('.tar.gz')))
  throw new Error('Verified update metadata and corresponding native sources are required.');
for (const asset of assets) gh(['release', 'upload', tag, asset, '--clobber']);
gh(['release', 'edit', tag, '--draft=false', '--latest']);
console.log(`Published the complete verified release ${tag}.`);
