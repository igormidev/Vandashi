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
function rendererMayUsePermission(
  requestingContents: unknown,
  permission: string,
  details: PermissionFrame,
  renderer: RendererContents,
  rendererUrl: string,
): boolean {
  if (
    !['clipboard-sanitized-write', 'fullscreen'].includes(permission) ||
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

/** Clipboard API keeps its narrow write-only contract. */
export function rendererMayWriteClipboard(
  requestingContents: unknown,
  permission: string,
  details: PermissionFrame,
  renderer: RendererContents,
  rendererUrl: string,
): boolean {
  return (
    permission === 'clipboard-sanitized-write' &&
    rendererMayUsePermission(requestingContents, permission, details, renderer, rendererUrl)
  );
}
export function installRendererPermissions(
  session: Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>,
  renderer: RendererContents,
  rendererUrl: string,
): void {
  const allowed = (contents: unknown, permission: string, details: PermissionFrame) =>
    rendererMayUsePermission(contents, permission, details, renderer, rendererUrl);
  session.setPermissionCheckHandler((contents, permission, _origin, details) =>
    allowed(contents, permission, details),
  );
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(allowed(contents, permission, details));
  });
}
