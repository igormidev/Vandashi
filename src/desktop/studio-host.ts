import { AppFault, DiagnosticError, parseDiagnostic } from '../domain/diagnostics';
import { webFrameMain, type WebContents, type WebFrameMain } from 'electron';
import { desktopUrl } from './request-errors';

function studioUrl(value: string): URL {
  const url = desktopUrl(value, { id: 'desktopStudioLocationInvalid' });
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.pathname !== '/' ||
    url.username ||
    url.password ||
    !/^#project\/[a-zA-Z0-9_%.-]+(?:\?[^#]*)?$/u.test(url.hash)
  )
    throw new AppFault({ id: 'desktopStudioLocationInvalid' });
  return url;
}

export function matchesStudioFrame(expected: string, actual: string, directChild: boolean): boolean {
  if (!directChild) return false;
  try {
    const allowed = studioUrl(expected);
    const candidate = studioUrl(actual);
    return allowed.origin === candidate.origin && allowed.hash.split('?')[0] === candidate.hash.split('?')[0];
  } catch {
    return false;
  }
}

/** Private host bridge. No Node or IPC authority is exposed to the vendor frame. */
export class DesktopStudioHost {
  private expected = '';
  constructor(
    private readonly contents: WebContents,
    private readonly installScript: string,
    private readonly flushScript: string,
  ) {
    contents.on('did-frame-finish-load', (_event, main, processId, routingId) => {
      if (main) return;
      const frame = webFrameMain.fromId(processId, routingId);
      if (frame && this.matches(frame)) void this.install(frame).catch(() => undefined);
    });
  }

  private matches(frame: WebFrameMain): boolean {
    return matchesStudioFrame(this.expected, frame.url, frame.parent === this.contents.mainFrame);
  }

  private async install(frame: WebFrameMain): Promise<void> {
    await frame.executeJavaScript(this.installScript);
  }

  async prepareStudio(value: string): Promise<void> {
    studioUrl(value);
    this.expected = value;
    for (const frame of this.contents.mainFrame.frames) if (this.matches(frame)) await this.install(frame);
  }

  async flushStudio(value: string): Promise<void> {
    if (value !== this.expected) throw new AppFault({ id: 'desktopStudioChanged' });
    const frames = this.contents.mainFrame.frames.filter((frame) => this.matches(frame));
    if (frames.length !== 1) throw new AppFault({ id: 'desktopStudioUnavailable' });
    const frame = frames[0];
    if (!frame) throw new AppFault({ id: 'desktopStudioUnavailable' });
    await this.install(frame);
    const result: unknown = await frame.executeJavaScript(this.flushScript);
    if (result && typeof result === 'object' && 'ok' in result) {
      if (result.ok === true && Object.keys(result).length === 1) return;
      if (result.ok === false && 'diagnostic' in result && Object.keys(result).length === 2) {
        const diagnostic = parseDiagnostic(result.diagnostic);
        if (diagnostic) throw new DiagnosticError(diagnostic);
      }
    }
    throw new AppFault({ id: 'invalidDiagnostic' });
  }
}
