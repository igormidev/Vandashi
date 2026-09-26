import { validateNativeUpdate } from '../infrastructure/updates/native-metadata';
import { beginUpdateInstall } from './update-install';
import electronUpdater from 'electron-updater';
import { app, shell } from 'electron';
import { join } from 'node:path';
import type { UpdatePort, UpdateRelease, UpdateState } from '../domain/updates';
import { AppFault } from '../domain/diagnostics';
import { latestArtifact, type ReleaseArtifact } from '../infrastructure/updates/github-release';
import {
  InstallerDownload,
  verifyInstaller,
  quarantineInstaller,
} from '../infrastructure/updates/installer-download';

/** macOS remains installer-only until Developer ID signing and notarization are configured. */
export class DesktopUpdates implements UpdatePort {
  readonly currentVersion = app.getVersion();
  readonly supported = app.isPackaged;
  readonly mode: UpdateState['mode'] =
    process.platform === 'darwin' || (process.platform === 'linux' && !process.env.APPIMAGE)
      ? 'installer'
      : 'restart';
  private release: ReleaseArtifact | null = null;
  private downloaded: ReleaseArtifact | null = null;
  private nativeInstaller: string | null = null;
  private readonly installer = new InstallerDownload(join(app.getPath('userData'), 'updates'));
  private readonly updater = electronUpdater.autoUpdater;
  constructor() {
    this.updater.autoDownload = false;
    this.updater.autoInstallOnAppQuit = false;
    this.updater.allowDowngrade = false;
    this.updater.allowPrerelease = false;
    // Errors are handled through awaited operations; EventEmitter must also have a listener.
    this.updater.on('error', () => undefined);
  }
  async check(): Promise<UpdateRelease | null> {
    const extension =
      process.platform === 'darwin'
        ? 'dmg'
        : process.platform === 'win32'
          ? 'exe'
          : process.env.APPIMAGE
            ? 'AppImage'
            : 'deb';
    this.release = await latestArtifact(
      this.currentVersion,
      `${process.platform}-${process.arch}-${extension}`,
    );
    return this.release ? { version: this.release.version, notes: this.release.notes } : null;
  }
  async download(version: string, progress: (value: number) => void): Promise<void> {
    const release = this.downloaded?.version === version ? this.downloaded : this.release;
    if (release?.version !== version) throw new AppFault({ id: 'updateChanged' });
    this.nativeInstaller = null;
    if (this.mode === 'installer') await this.installer.download(release, progress);
    else {
      const report = ({ percent }: { percent: number }) => {
        progress(percent);
      };
      this.updater.on('download-progress', report);
      try {
        // Pin the reviewed release: publishing a newer version cannot switch the approved download.
        this.updater.setFeedURL({ provider: 'generic', url: release.feed });
        const check = await this.updater.checkForUpdates();
        if (!check?.isUpdateAvailable || check.updateInfo.version !== version)
          throw new AppFault({ id: 'updateChanged' });
        validateNativeUpdate(check.updateInfo, release);
        const token = check.cancellationToken;
        if (!token) throw new AppFault({ id: 'updateInvalid' });
        const timeout = setTimeout(
          () => {
            token.cancel();
          },
          30 * 60 * 1000,
        );
        try {
          const paths = await this.updater.downloadUpdate(token);
          this.nativeInstaller = paths[0] ?? null;
          if (!this.nativeInstaller) throw new AppFault({ id: 'updateInvalid' });
          await verifyInstaller(this.nativeInstaller, release.asset);
        } finally {
          clearTimeout(timeout);
        }
      } catch (error) {
        if (error instanceof AppFault) {
          if (
            error.diagnostic.kind === 'app' &&
            error.diagnostic.message.id === 'updateInvalid' &&
            this.nativeInstaller
          )
            await quarantineInstaller(this.nativeInstaller);
          throw error;
        }
        throw new AppFault(
          { id: 'updateDownloadFailed' },
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        this.updater.removeListener('download-progress', report);
      }
    }
    this.downloaded = release;
  }
  async apply(version: string): Promise<void> {
    if (this.downloaded?.version !== version) throw new AppFault({ id: 'updateChanged' });
    if (this.mode === 'installer') {
      const path = await this.installer.verifiedPath(version);
      const failure = await shell.openPath(path);
      if (failure) throw new AppFault({ id: 'updateOpenFailed' }, failure);
    } else {
      try {
        if (!this.nativeInstaller) throw new AppFault({ id: 'updateInvalid' });
        await verifyInstaller(this.nativeInstaller, this.downloaded.asset);
      } catch {
        if (this.nativeInstaller) await quarantineInstaller(this.nativeInstaller);
        throw new AppFault({ id: 'updateInvalid' });
      }
      await beginUpdateInstall(app, this.updater);
    }
  }
}
