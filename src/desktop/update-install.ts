import { AppFault } from '../domain/diagnostics';

/** BaseUpdater reports install failure through an event, not its void return value. */
export function beginUpdateInstall(
  app: {
    once(event: 'will-quit', listener: () => void): unknown;
    removeListener(event: 'will-quit', listener: () => void): unknown;
  },
  updater: {
    once(event: 'error', listener: (error: Error) => void): unknown;
    removeListener(event: 'error', listener: (error: Error) => void): unknown;
    quitAndInstall(silent: boolean, forceRun: boolean): void;
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      app.removeListener('will-quit', quitting);
      updater.removeListener('error', failed);
    };
    const quitting = () => {
      cleanup();
      resolve();
    };
    const failed = (error: Error) => {
      cleanup();
      reject(new AppFault({ id: 'updateOpenFailed' }, error.message));
    };
    const timer = setTimeout(() => {
      failed(new Error('The installer did not start.'));
    }, 30_000);
    app.once('will-quit', quitting);
    updater.once('error', failed);
    try {
      updater.quitAndInstall(false, true);
    } catch (error) {
      failed(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
