import type { Session } from 'electron';

interface RendererContents {
  mainFrame: { url: string };
}
interface PermissionFrame {
  isMainFrame?: boolean;
  requestingUrl?: string;
}

function sameLocation(actual: string, expected: string): boolean {
  const actualUrl = new URL(actual);
  const expectedUrl = new URL(expected);
  actualUrl.hash = '';
  expectedUrl.hash = '';
  return actualUrl.href === expectedUrl.href;
}

/** Only the app's current top-level document may write; reads and embedded content stay denied. */
export function rendererMayWriteClipboard(
  requestingContents: unknown,
  permission: string,
  details: PermissionFrame,
  renderer: RendererContents,
  rendererUrl: string,
): boolean {
  if (
    permission !== 'clipboard-sanitized-write' ||
    requestingContents !== renderer ||
    details.isMainFrame !== true ||
    !details.requestingUrl
  )
    return false;
  try {
    return (
      sameLocation(details.requestingUrl, rendererUrl) && sameLocation(renderer.mainFrame.url, rendererUrl)
    );
  } catch {
    // Missing/destroyed frames and malformed URLs never retain a permission grant.
    return false;
  }
}

export function installRendererPermissions(
  session: Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>,
  renderer: RendererContents,
  rendererUrl: string,
): void {
  session.setPermissionCheckHandler((contents, permission, _origin, details) =>
    rendererMayWriteClipboard(contents, permission, details, renderer, rendererUrl),
  );
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(rendererMayWriteClipboard(contents, permission, details, renderer, rendererUrl));
  });
}
