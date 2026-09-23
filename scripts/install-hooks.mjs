import { execFileSync } from 'node:child_process';
try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks']);
} catch {
  /* Source archives may have no .git directory. */
}
