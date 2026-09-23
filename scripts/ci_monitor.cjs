#!/usr/bin/env node
async function main() {
  const { spawnSync } = await import('node:child_process');
  const { readFileSync } = await import('node:fs');

  const [command, ...args] = process.argv.slice(2);
  function gh(values, capture = false) {
    const result = spawnSync('gh', values, { encoding: 'utf8', stdio: capture ? 'pipe' : 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error(capture ? result.stderr.trim() : `GitHub CLI exited with status ${result.status}`);
    return capture ? result.stdout : '';
  }
  try {
    switch (command) {
      case '--help':
      case undefined:
        console.log(
          'Usage: node scripts/ci_monitor.cjs <command>\n  check-actions [workflow-file]  Verify action references against live GitHub releases\n  runs [--branch name]           List recent workflow runs\n  watch <run-id>                 Watch a run until completion\n  view <run-id>                  Show run jobs and conclusion\n  log-failed <run-id>            Show failed job logs\n  download <run-id> [--dir path] Download build/test artifacts\n  dispatch <workflow> [args]     Start a workflow',
        );
        break;
      case 'check-actions': {
        const source = args[0] ? readFileSync(args[0], 'utf8') : '';
        const actions = [
          ...new Set(
            source
              ? [...source.matchAll(/uses:\s*([\w-]+\/[\w-]+)@/g)].map((match) => match[1])
              : ['actions/checkout', 'actions/setup-node', 'actions/upload-artifact'],
          ),
        ];
        for (const action of actions) {
          const release = JSON.parse(gh(['api', `repos/${action}/releases/latest`], true));
          const commit = JSON.parse(gh(['api', `repos/${action}/commits/${release.tag_name}`], true));
          console.log(`${action}@${commit.sha} # ${release.tag_name}`);
        }
        break;
      }
      case 'runs':
        gh(['run', 'list', ...args]);
        break;
      case 'watch':
        gh(['run', 'watch', ...args, '--exit-status']);
        break;
      case 'view':
        gh(['run', 'view', ...args]);
        break;
      case 'log-failed':
        gh(['run', 'view', ...args, '--log-failed']);
        break;
      case 'download':
        gh(['run', 'download', ...args]);
        break;
      case 'dispatch':
        gh(['workflow', 'run', ...args]);
        break;
      default:
        throw new Error(`Unknown command: ${command}. Use --help.`);
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
void main();
