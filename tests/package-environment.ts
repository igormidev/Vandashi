import { accessSync, constants } from 'node:fs';
import { delimiter, dirname, join, win32 } from 'node:path';
import { resolveMediaBinary } from '../src/infrastructure/media/binaries';

/** Keep OS services and Git, while excluding developer Node/npm installations from the child PATH. */
export function minimalDesktopEnvironment(
  source: NodeJS.ProcessEnv,
  git: string,
  platform = process.platform,
): Record<string, string> {
  const environment = Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' &&
        !['path', 'electron_run_as_node', 'electron_renderer_url', 'node_path'].includes(
          entry[0].toLowerCase(),
        ),
    ),
  );
  if (platform === 'win32') {
    const key = Object.keys(environment).find((entry) => entry.toLowerCase() === 'systemroot');
    const windows = key ? environment[key] : undefined;
    if (!windows) throw new Error('Windows packaged tests require SystemRoot.');
    environment['PATH'] = [win32.dirname(git), win32.join(windows, 'System32'), windows].join(';');
  } else environment['PATH'] = [dirname(git), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
  return environment;
}

export function packagedEnvironment(source = process.env): Record<string, string> {
  let git = source['VANDASHI_SMOKE_GIT_PATH'];
  if (!git) {
    const key = Object.keys(source).find((entry) => entry.toLowerCase() === 'path');
    for (const directory of (key ? (source[key] ?? '') : '').split(delimiter)) {
      const candidate = join(directory, process.platform === 'win32' ? 'git.exe' : 'git');
      try {
        accessSync(candidate, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
        git = candidate;
        break;
      } catch {
        // Resolve before reducing PATH; the application itself still discovers Git normally.
      }
    }
  }
  if (!git) throw new Error('Git is required for the packaged media smoke.');
  return {
    ...minimalDesktopEnvironment(source, git),
    HYPERFRAMES_FFMPEG_PATH: resolveMediaBinary('ffmpeg', source),
    HYPERFRAMES_FFPROBE_PATH: resolveMediaBinary('ffprobe', source),
  };
}
