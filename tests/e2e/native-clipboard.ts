import type { ElectronApplication } from '@playwright/test';

/** Retain every clipboard flavor inside the native process; never print private clipboard data. */
export async function preservingNativeClipboard(app: ElectronApplication, task: () => Promise<void>) {
  const saved = await app.evaluateHandle(async ({ clipboard, ClipboardItem }) => {
    const items = await Promise.all(
      (await clipboard.read())
        .filter((item) => item.types.length)
        .map(async (item) => {
          const entries = await Promise.all(
            item.types.map(async (type) => [type, await item.getType(type)] as const),
          );
          return new ClipboardItem(Object.fromEntries(entries));
        }),
    );
    return {
      restore: async () => {
        if (items.length) await clipboard.write(items);
        else clipboard.clear();
      },
    };
  });
  try {
    await saved.evaluate((state) => state.restore());
    await task();
  } finally {
    await saved.evaluate((state) => state.restore());
    await saved.dispose();
  }
}
