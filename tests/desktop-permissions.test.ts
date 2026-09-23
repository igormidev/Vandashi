import type { Session, WebContents } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { installRendererPermissions, rendererMayWriteClipboard } from '../src/desktop/renderer-permissions';

const packagedUrl = 'file:///Applications/Vandashi.app/Contents/Resources/app/out/renderer/index.html';
const developmentUrl = 'http://127.0.0.1:5173/';

describe('renderer clipboard permission boundary', () => {
  it.each([packagedUrl, developmentUrl])('allows only the actual app document at %s', (url) => {
    const contents = { mainFrame: { url } };
    expect(
      rendererMayWriteClipboard(
        contents,
        'clipboard-sanitized-write',
        {
          isMainFrame: true,
          requestingUrl: `${url}#creation`,
        },
        contents,
        url,
      ),
    ).toBe(true);
    for (const permission of ['clipboard-read', 'deprecated-sync-clipboard-read', 'unknown', 'media'])
      expect(
        rendererMayWriteClipboard(
          contents,
          permission,
          { isMainFrame: true, requestingUrl: url },
          contents,
          url,
        ),
      ).toBe(false);
  });

  it('denies Studio, same-origin children, workers, other windows, and redirected app documents', () => {
    const contents = { mainFrame: { url: packagedUrl } };
    const request = { isMainFrame: true, requestingUrl: packagedUrl };
    for (const details of [
      { requestingUrl: packagedUrl },
      { isMainFrame: false, requestingUrl: 'http://127.0.0.1:3000/studio' },
      { isMainFrame: false, requestingUrl: packagedUrl },
      { isMainFrame: true },
      { isMainFrame: true, requestingUrl: 'file:///tmp/other.html' },
      { isMainFrame: true, requestingUrl: `${packagedUrl}?untrusted=1` },
      { isMainFrame: true, requestingUrl: 'not a URL' },
    ])
      expect(
        rendererMayWriteClipboard(contents, 'clipboard-sanitized-write', details, contents, packagedUrl),
      ).toBe(false);
    for (const requester of [null, { mainFrame: { url: packagedUrl } }])
      expect(
        rendererMayWriteClipboard(requester, 'clipboard-sanitized-write', request, contents, packagedUrl),
      ).toBe(false);
    contents.mainFrame.url = 'https://untrusted.example/';
    expect(
      rendererMayWriteClipboard(contents, 'clipboard-sanitized-write', request, contents, packagedUrl),
    ).toBe(false);
  });

  it('denies a destroyed frame rather than throwing from a permission callback', () => {
    const contents = {
      get mainFrame(): { url: string } {
        throw new Error('Frame was disposed');
      },
    };
    expect(
      rendererMayWriteClipboard(
        contents,
        'clipboard-sanitized-write',
        {
          isMainFrame: true,
          requestingUrl: packagedUrl,
        },
        contents,
        packagedUrl,
      ),
    ).toBe(false);
  });

  it('installs the same default-deny policy for permission checks and requests', () => {
    type Check = NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>;
    type Request = NonNullable<Parameters<Session['setPermissionRequestHandler']>[0]>;
    const checks: Check[] = [];
    const requests: Request[] = [];
    const contents = { mainFrame: { url: packagedUrl } } as WebContents;
    installRendererPermissions(
      {
        setPermissionCheckHandler: (handler) => {
          if (handler) checks.push(handler);
        },
        setPermissionRequestHandler: (handler) => {
          if (handler) requests.push(handler);
        },
      },
      contents,
      packagedUrl,
    );
    const check = checks[0];
    const request = requests[0];
    if (!check || !request) throw new Error('Both permission handlers must be installed');
    const details = { isMainFrame: true, requestingUrl: packagedUrl };
    const result = vi.fn();
    expect(check(contents, 'clipboard-sanitized-write', 'file://', details)).toBe(true);
    request(contents, 'clipboard-sanitized-write', result, details);
    expect(result).toHaveBeenLastCalledWith(true);
    for (const permission of ['clipboard-read', 'unknown'] as const) {
      expect(check(contents, permission, 'file://', details)).toBe(false);
      request(contents, permission, result, details);
      expect(result).toHaveBeenLastCalledWith(false);
    }
    expect(check(null, 'clipboard-sanitized-write', 'file://', details)).toBe(false);
    request(contents, 'clipboard-sanitized-write', result, { ...details, isMainFrame: false });
    expect(result).toHaveBeenLastCalledWith(false);
  });
});
