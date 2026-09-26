import type { ElectronApplication } from '@playwright/test';

/** UI fixtures only; production protocol coverage uses real grants in separate tests. */
export async function installFixtureMedia(desktop: ElectronApplication, path: string): Promise<void> {
  await desktop.evaluate(({ protocol, net }, mediaPath) => {
    protocol.unhandle('vandashi-media');
    protocol.handle('vandashi-media', () => net.fetch(`file://${mediaPath}`));
  }, path);
}
