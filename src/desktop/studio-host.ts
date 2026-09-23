import { webFrameMain, type WebContents, type WebFrameMain } from 'electron';

function studioUrl(value: string): URL {
  const url = new URL(value);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.pathname !== '/' ||
    url.username ||
    url.password ||
    !/^#project\/[a-zA-Z0-9_%.-]+(?:\?[^#]*)?$/u.test(url.hash)
  )
    throw new Error('Invalid local Studio location.');
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
    if (value !== this.expected) throw new Error('The active editor changed. Reopen it before saving.');
    const frames = this.contents.mainFrame.frames.filter((frame) => this.matches(frame));
    if (frames.length !== 1) throw new Error('The editor is not available. Reopen it before saving.');
    const frame = frames[0];
    if (!frame) throw new Error('The editor is not available.');
    await this.install(frame);
    await frame.executeJavaScript(this.flushScript);
  }
}
