import {
  app,
  BrowserWindow,
  ClipboardItem,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  net,
  protocol,
  session,
  shell,
} from 'electron';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LocalStorage } from '../infrastructure/storage/local-storage';
import { LocalGit } from '../infrastructure/git/local-git';
import { CodexAgent } from '../infrastructure/codex/client';
import { HyperframesMediaAdapter } from '../infrastructure/media/hyperframes';
import { createBackend } from '../application/backend';
import {
  externalUrl,
  mediaRequestPath,
  parseInvocation,
  PathPermissions,
  rendererLocation,
  trustedSender,
} from './validation';
import { desktopMessages, nativeMessages } from './messages';
import { defaultLocale, normalizeLocale } from '../domain/locales';
import { createMediaHandler } from './media-handler';
import { DesktopStudioHost } from './studio-host';
import { STUDIO_BRIDGE_FLUSH, STUDIO_BRIDGE_INSTALL } from '../infrastructure/media/studio-bridge';
import { AppFault, failureEnvelope } from '../domain/diagnostics';
import { installRendererPermissions } from './renderer-permissions';
import { loadInitialRenderer } from './renderer-load';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vandashi-media',
    privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true },
  },
]);
if (process.env.VANDASHI_USER_DATA) app.setPath('userData', process.env.VANDASHI_USER_DATA);
// Keep the established profile location when replacing Electron's development identity.
const userData = app.getPath('userData');
app.setName('Vandashi');
app.setPath('userData', userData);
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'icon.png')
  : join(import.meta.dirname, '../../build/icon.png');
let mainWindow: BrowserWindow | null = null;
const git = new LocalGit();
const agent = new CodexAgent();
const media = new HyperframesMediaAdapter({ cacheDirectory: join(app.getPath('userData'), 'models') });
let closing = false;

async function createWindow(): Promise<void> {
  if (process.platform === 'darwin') app.dock?.setIcon(nativeImage.createFromPath(iconPath));
  let nativeLocale = defaultLocale;
  const mediaUrl = (path: string) => `vandashi-media://local/file?path=${encodeURIComponent(path)}`;
  const store = new LocalStorage(app.getPath('userData'), git, mediaUrl, ({ path, backupPath }) => {
    if (mainWindow && !mainWindow.isDestroyed())
      mainWindow.webContents.send('vandashi:event', {
        type: 'notice',
        code: 'workspace-recovered',
        detail: desktopMessages.recovery(basename(path), backupPath),
        diagnostic: {
          kind: 'app',
          message: backupPath
            ? { id: 'recoveredDocument', params: { name: basename(path), path: backupPath } }
            : { id: 'restoredDocument', params: { name: basename(path) } },
        },
      });
  });
  const permissions = new PathPermissions(
    (value) => store.allowedPath(value),
    (value) => agent.generatedImage(value),
  );
  nativeLocale = await store.getState().then(
    (state) => state.settings.locale,
    () => defaultLocale,
  );
  const rendererUrl = rendererLocation(
    app.isPackaged,
    process.env.ELECTRON_RENDERER_URL,
    pathToFileURL(join(import.meta.dirname, '../renderer/index.html')).href,
  );
  protocol.handle(
    'vandashi-media',
    createMediaHandler(permissions, (url, options) => net.fetch(url, options)),
  );
  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1200,
    minHeight: 720,
    backgroundColor: '#0a0a0a',
    title: 'Vandashi',
    icon: iconPath,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(import.meta.dirname, '../preload/preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      webviewTag: false,
      allowRunningInsecureContent: false,
    },
  });
  mainWindow = window;
  const studioHost = new DesktopStudioHost(window.webContents, STUDIO_BRIDGE_INSTALL, STUDIO_BRIDGE_FLUSH);
  const backend = createBackend(
    store,
    git,
    agent,
    media,
    {
      prepareStudio: (url) => studioHost.prepareStudio(url),
      flushStudio: (url) => studioHost.flushStudio(url),
      chooseDirectory: async () => {
        const result = await dialog.showOpenDialog(window, {
          properties: ['openDirectory', 'createDirectory'],
        });
        const selected = result.canceled ? undefined : result.filePaths[0];
        return selected ? permissions.grantDirectory(selected) : null;
      },
      chooseFiles: async (kind) => {
        const messages = nativeMessages(nativeLocale);
        const result = await dialog.showOpenDialog(window, {
          properties: ['openFile', 'multiSelections'],
          ...(kind === 'images'
            ? {
                filters: [
                  { name: messages.imagesFilter, extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] },
                ],
              }
            : kind === 'video'
              ? { filters: [{ name: messages.videoFilter, extensions: ['mp4', 'mov', 'webm', 'mkv'] }] }
              : {}),
        });
        return result.canceled
          ? []
          : Promise.all(result.filePaths.slice(0, 200).map((path) => permissions.grantFile(path)));
      },
      revealPath: async (path) => {
        shell.showItemInFolder(await store.allowedPath(path));
      },
      openExternal: async (value) => {
        await shell.openExternal(externalUrl(value));
      },
      copyImage: async (path) => {
        const image = nativeImage.createFromPath(await store.allowedPath(path));
        if (image.isEmpty()) throw new AppFault({ id: 'imageCannotCopy' });
        await clipboard.write([
          new ClipboardItem({
            'image/png': new Blob([new Uint8Array(image.toPNG())], { type: 'image/png' }),
          }),
        ]);
      },
      mediaUrl: async (path) => {
        const url = mediaUrl(await permissions.file(path));
        mediaRequestPath(url, 'GET');
        return url;
      },
    },
    (event) => {
      if (!window.isDestroyed()) window.webContents.send('vandashi:event', event);
    },
  );
  ipcMain.handle('vandashi:invoke', async (event, method: unknown, args: unknown) => {
    try {
      if (!trustedSender(event, window.webContents, rendererUrl))
        throw new AppFault({ id: 'untrustedRequest' });
      const parsed = parseInvocation(method, args);
      await permissions.authorize(parsed.method, parsed.args);
      if (!Object.hasOwn(backend, parsed.method)) throw new AppFault({ id: 'unknownOperation' });
      const result: unknown = await Reflect.apply(backend[parsed.method], backend, parsed.args);
      if (parsed.method === 'getState' && result && typeof result === 'object' && 'settings' in result) {
        const settings = result.settings;
        if (settings && typeof settings === 'object' && 'locale' in settings)
          nativeLocale = normalizeLocale(settings.locale);
      }
      if (parsed.method === 'settings') {
        const settings = parsed.args[0];
        if (settings && typeof settings === 'object' && 'locale' in settings)
          nativeLocale = normalizeLocale(settings.locale);
      }
      return result;
    } catch (error) {
      return failureEnvelope(error);
    }
  });
  ipcMain.on('vandashi:grant-drop', (event, value: unknown) => {
    if (
      !trustedSender(event, window.webContents, rendererUrl) ||
      typeof value !== 'string' ||
      !value ||
      value.length > 32_768 ||
      value.includes('\0')
    )
      return;
    // Registration happens before the following invoke; authorize() awaits the pending canonicalization.
    void permissions.grantFile(value).catch(() => {
      if (!window.isDestroyed())
        window.webContents.send('vandashi:event', {
          type: 'notice',
          code: 'file-unavailable',
          detail: 'The selected file is unavailable.',
          diagnostic: { kind: 'app', message: { id: 'selectedFileUnavailable' } },
        });
    });
  });
  installRendererPermissions(session.defaultSession, window.webContents, rendererUrl);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => {
    event.preventDefault();
  });
  window.webContents.on('will-prevent-unload', (event) => {
    const messages = nativeMessages(nativeLocale);
    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      title: messages.closeTitle,
      message: messages.closeMessage,
      detail: messages.closeDetail,
      buttons: [messages.closeKeep, messages.closeDiscard],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (choice === 1) event.preventDefault();
  });
  window.on('closed', () => {
    mainWindow = null;
  });
  await loadInitialRenderer(window.webContents, rendererUrl);
}
void app
  .whenReady()
  .then(createWindow)
  .catch((error: unknown) => {
    console.error(error);
    app.quit();
  });
app.on('window-all-closed', () => {
  app.quit();
});
app.on('will-quit', (event) => {
  if (closing) return;
  event.preventDefault();
  closing = true;
  agent.dispose();
  void media.dispose().finally(() => {
    setImmediate(() => {
      app.quit();
    });
  });
});
app.on('activate', () => {
  mainWindow?.show();
});
