import { test, expect } from './fixtures';
import { installChatRefactorFixture } from './chat-refactor-fixture';
import { chatControl } from './chat-fixture';
import { preservingNativeClipboard } from './native-clipboard';
import type { ChatMessage } from '../../src/domain/models';

const message = (text: string): ChatMessage => ({
  id: 'markdown-controls',
  role: 'assistant',
  text,
  files: [],
  createdAt: '',
  turnId: 'turn',
  streaming: false,
});
const diagram = 'flowchart LR\n  A["Read guide"] --> B["Edit video"]\n';

test('rendered tables copy native plain text, Markdown and CSV without losing inline formatting or complete cells', async ({
  desktopApp,
  page,
}) => {
  const markdown =
    '| Name | Note |\n| :--- | ---: |\n| **Brand, main** | A "quoted" \\| detail |\n| `logo.ts` | Café |';
  await installChatRefactorFixture(desktopApp, { initialMessages: [message(markdown)] });
  await page.reload();
  const table = page.getByRole('group', { name: 'Table', exact: true });
  await expect(table.getByRole('table')).toBeVisible();
  await preservingNativeClipboard(desktopApp, async () => {
    await table.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(table.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
    expect(await desktopApp.evaluate(({ clipboard }) => clipboard.readText())).toBe(
      'Name\tNote\nBrand, main\tA "quoted" | detail\nlogo.ts\tCafé',
    );
    for (const [format, expected] of [
      ['CSV', 'Name,Note\r\n"Brand, main","A ""quoted"" | detail"\r\nlogo.ts,Café'],
      ['Markdown', markdown],
    ] as const) {
      await table.getByRole('combobox', { name: 'Copy table', exact: true }).click();
      await page.getByRole('option', { name: format, exact: true }).click();
      // A completed copy of the previous format must not label this new format Copied.
      await expect(table.getByRole('button', { name: 'Copy', exact: true })).toBeVisible();
      await table.getByRole('button', { name: 'Copy', exact: true }).click();
      await expect(table.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
      expect(await desktopApp.evaluate(({ clipboard }) => clipboard.readText())).toBe(expected);
    }
  });
  await table.getByRole('button', { name: 'Wrap table cells', exact: true }).click();
  await expect(table).toHaveClass(/is-wrapped/);
  await expect(table.getByRole('cell').first()).toHaveCSS('white-space', 'normal');
  await table.getByRole('button', { name: 'Keep table cells on one line', exact: true }).click();
  await expect(table.getByRole('cell').first()).toHaveCSS('white-space', 'nowrap');
  expect(page.url()).toMatch(/^file:/);
});

test('expanded Mermaid uses a focused portal, preserves a stable sanitized snapshot and returns keyboard focus after Escape', async ({
  desktopApp,
  page,
}) => {
  await installChatRefactorFixture(desktopApp, {
    initialMessages: [message(`\`\`\`mermaid\n${diagram}\`\`\``)],
    observeLinkAccess: true,
  });
  await page.reload();
  const preview = page.locator('.chat-diagram-preview');
  await expect(preview.locator('.chat-diagram svg[id]')).toBeVisible();
  const previewHeight = await preview.locator('.chat-diagram').evaluate((element) => element.clientHeight);
  const expand = preview.getByRole('button', { name: 'Expand diagram', exact: true });
  await expand.focus();
  await expand.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Diagram', exact: true });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.closest('.messages') === null)).toBe(true);
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expect(dialog.locator('svg[id]')).toHaveCount(1);
  await expect(preview.locator('.chat-diagram svg[id]')).toHaveCount(0);
  expect(await preview.locator('.chat-diagram').evaluate((element) => element.clientHeight)).toBe(
    previewHeight,
  );
  await dialog.getByRole('button', { name: 'Source', exact: true }).click();
  const source = dialog.getByRole('textbox', { name: 'Source', exact: true });
  await expect(source).toHaveValue(diagram);
  await expect(source).toHaveAttribute('readonly', '');
  await source.focus();
  await source.press('Tab');
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: false,
      message: message('```mermaid\nflowchart LR\n  C[New answer] --> D[Preserved history]\n```'),
    },
  });
  // An already-open viewer retains its exact reviewed source while the provider changes the message.
  await expect(source).toHaveValue(diagram);
  await preservingNativeClipboard(desktopApp, async () => {
    await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(dialog.getByRole('button', { name: 'Copied', exact: true })).toBeVisible();
    expect(await desktopApp.evaluate(({ clipboard }) => clipboard.readText())).toBe(diagram);
  });
  await dialog.getByRole('button', { name: 'Diagram', exact: true }).click();
  await desktopApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(980, 720);
  });
  const bounds = await dialog.boundingBox();
  const viewport =
    page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })));
  expect(bounds).not.toBeNull();
  if (!bounds) throw new Error('Expanded diagram must have visible bounds.');
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.chat-diagram-expand')).toHaveCSS('transition-duration', '0s');
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(expand).toBeFocused();
  await expect(preview.locator('.chat-diagram svg[id]')).toBeVisible();
  await expand.press('Enter');
  await expect(dialog).toBeVisible();
  const rejected = 'flowchart LR\n A["<img src=\\"https://example.com/private\\">"] --> B[Rejected]\n';
  await chatControl(desktopApp, {
    event: {
      type: 'chat',
      sessionId: 'chat-one',
      delta: false,
      message: message(`\`\`\`mermaid\n${rejected}\`\`\``),
    },
  });
  await expect(page.locator('.chat-diagram-failure pre')).toHaveText(rejected);
  // Invalid replacement source removes Expand. The existing code control remains a local safe focus target.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(
    page.locator('.chat-code-heading').getByRole('button', { name: 'Source', exact: true }),
  ).toBeFocused();
  expect(page.url()).toMatch(/^file:/);
});

test('expanded Mermaid holds modal dismissal and controls until its real native copy settles', async ({
  desktopApp,
  page,
}) => {
  await installChatRefactorFixture(desktopApp, {
    initialMessages: [message(`\`\`\`mermaid\n${diagram}\`\`\``)],
  });
  await page.reload();
  await page.getByRole('button', { name: 'Expand diagram', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Diagram', exact: true });
  await expect(dialog).toBeVisible();
  await preservingNativeClipboard(desktopApp, async () => {
    await page.evaluate(() => {
      const nativeWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
      let release: (() => void) | undefined;
      Object.defineProperty(window, '__releaseNativeDiagramCopy', {
        configurable: true,
        value: () => release?.(),
      });
      navigator.clipboard.writeText = (text) =>
        new Promise<void>((resolve) => {
          release = () => {
            navigator.clipboard.writeText = nativeWrite;
            delete (window as unknown as Record<string, unknown>)['__releaseNativeDiagramCopy'];
            resolve();
          };
        }).then(() => nativeWrite(text));
    });
    const copy = dialog.getByRole('button', { name: 'Copy', exact: true });
    await copy.click();
    await expect(copy).toBeDisabled();
    await expect(copy).toHaveAttribute('aria-busy', 'true');
    await expect(dialog.getByRole('button', { name: 'Source', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __releaseNativeDiagramCopy: () => void }).__releaseNativeDiagramCopy();
    });
    await expect(dialog.getByRole('button', { name: 'Copied', exact: true })).toBeEnabled();
    expect(await desktopApp.evaluate(({ clipboard }) => clipboard.readText())).toBe(diagram);
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Expand diagram', exact: true })).toBeFocused();
  });
});

test('resource-bearing Mermaid remains literal source and cannot open an expanded viewer or request remote content', async ({
  desktopApp,
  page,
}) => {
  const source = 'flowchart LR\n A["<img src=\\"https://example.com/private\\">"] --> B[Untrusted]\n';
  const remoteRequests: string[] = [];
  page.on('request', (request) => {
    if (/^https?:/.test(request.url())) remoteRequests.push(request.url());
  });
  await installChatRefactorFixture(desktopApp, {
    initialMessages: [message(`\`\`\`mermaid\n${source}\`\`\``)],
    observeLinkAccess: true,
  });
  await page.reload();
  await expect(page.locator('.chat-diagram-failure pre')).toHaveText(source);
  await expect(page.getByRole('button', { name: 'Expand diagram', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Diagram', exact: true })).toHaveCount(0);
  await expect(page.locator('.chat-code img, .chat-code iframe, .chat-code svg[id]')).toHaveCount(0);
  expect(remoteRequests).toEqual([]);
});

test('expanded Mermaid bounds zoom and supports native keyboard scrolling, captured pointer panning and reset across source toggles', async ({
  desktopApp,
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await desktopApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setContentSize(1100, 700);
  });
  await installChatRefactorFixture(desktopApp, {
    initialMessages: [message(`\`\`\`mermaid\n${diagram}\`\`\``)],
  });
  await page.reload();
  await page.getByRole('button', { name: 'Expand diagram', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Diagram', exact: true });
  const zoomIn = dialog.getByRole('button', { name: 'Zoom in', exact: true });
  const zoomOut = dialog.getByRole('button', { name: 'Zoom out', exact: true });
  const percent = dialog.locator('.chat-diagram-zoom > span');
  await zoomOut.focus();
  await zoomOut.press('Space');
  await zoomOut.press('Enter');
  await expect(percent).toHaveText('50%');
  await expect(zoomOut).toBeDisabled();
  const smallDiagramWidth = await dialog
    .locator('.chat-diagram-canvas > svg')
    .evaluate((element) => element.getBoundingClientRect().width);
  await zoomIn.focus();
  for (let step = 0; step < 14; step++) await zoomIn.press('Enter');
  await expect(percent).toHaveText('400%');
  await expect(zoomIn).toBeDisabled();
  const view = dialog.getByRole('region', { name: 'Diagram', exact: true });
  expect(
    await dialog
      .locator('.chat-diagram-canvas > svg')
      .evaluate((element) => element.getBoundingClientRect().width),
  ).toBeGreaterThan(smallDiagramWidth * 7);
  expect(await view.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await dialog.getByRole('button', { name: 'Copy', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(view).toBeFocused();
  await expect(view).toHaveCSS('outline-style', 'solid');
  await view.evaluate((element) => {
    element.scrollLeft = 100;
  });
  const beforeKey = await view.evaluate((element) => element.scrollLeft);
  expect(await view.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeGreaterThan(
    beforeKey,
  );
  await view.press('ArrowRight');
  await expect.poll(() => view.evaluate((element) => element.scrollLeft)).toBeGreaterThan(beforeKey);
  await view.press('ArrowLeft');
  expect(await view.evaluate((element) => element.scrollLeft)).toBe(beforeKey);
  await view.press('End');
  expect(
    await view.evaluate((element) => element.scrollLeft === element.scrollWidth - element.clientWidth),
  ).toBe(true);
  const beforePage = await view.evaluate((element) => element.scrollTop);
  expect(beforePage).toBeGreaterThan(0);
  await view.press('PageUp');
  expect(await view.evaluate((element) => element.scrollTop)).toBeLessThan(beforePage);
  await view.press('PageDown');
  // Native scroll bounds can have half-pixel positions while scrollHeight rounds to integers.
  expect(Math.abs((await view.evaluate((element) => element.scrollTop)) - beforePage)).toBeLessThanOrEqual(1);
  await view.press('Home');
  expect(await view.evaluate((element) => element.scrollLeft === 0 && element.scrollTop === 0)).toBe(true);
  await view.evaluate((element) => {
    element.scrollLeft = 100;
    element.scrollTop = 0;
  });
  const bounds = await view.boundingBox();
  if (!bounds) throw new Error('Expanded diagram must have a pointer-accessible viewport.');
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 - 120, bounds.y + bounds.height / 2 - 40);
  await expect(view).toHaveClass(/is-dragging/);
  expect(await view.evaluate((element) => element.scrollLeft)).toBeGreaterThanOrEqual(220);
  // Capture retains the pan outside the viewport; native scrolling clamps to reachable content.
  await page.mouse.move(bounds.x - 6000, bounds.y - 6000);
  expect(
    await view.evaluate(
      (element) =>
        Math.abs(element.scrollLeft - (element.scrollWidth - element.clientWidth)) <= 1 &&
        Math.abs(element.scrollTop - (element.scrollHeight - element.clientHeight)) <= 1,
    ),
  ).toBe(true);
  await page.mouse.move(bounds.x + 6000, bounds.y + 6000);
  expect(await view.evaluate((element) => element.scrollLeft === 0 && element.scrollTop === 0)).toBe(true);
  await page.mouse.move(bounds.x + bounds.width / 2 - 60, bounds.y + bounds.height / 2 - 30);
  await page.mouse.up();
  await expect(view).not.toHaveClass(/is-dragging/);
  const preserved = await view.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }));
  await dialog.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(dialog.getByRole('textbox', { name: 'Source', exact: true })).toHaveValue(diagram);
  await expect(zoomOut).toBeDisabled();
  await dialog.getByRole('button', { name: 'Diagram', exact: true }).click();
  await expect(percent).toHaveText('400%');
  expect(await view.evaluate((element) => ({ left: element.scrollLeft, top: element.scrollTop }))).toEqual(
    preserved,
  );
  await preservingNativeClipboard(desktopApp, async () => {
    await page.evaluate(() => {
      const nativeWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
      let release: (() => void) | undefined;
      Object.defineProperty(window, '__releaseNativeZoomCopy', {
        configurable: true,
        value: () => release?.(),
      });
      navigator.clipboard.writeText = (text) =>
        new Promise<void>((resolve) => {
          release = () => {
            navigator.clipboard.writeText = nativeWrite;
            delete (window as unknown as Record<string, unknown>)['__releaseNativeZoomCopy'];
            resolve();
          };
        }).then(() => nativeWrite(text));
    });
    await dialog.getByRole('button', { name: 'Copy', exact: true }).click();
    await expect(zoomOut).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Reset view', exact: true })).toBeDisabled();
    await expect(dialog.getByRole('button', { name: 'Source', exact: true })).toBeDisabled();
    await expect(dialog.locator('.chat-diagram-full-view')).toHaveAttribute('inert', '');
    await expect(dialog.locator('.chat-diagram-full-view')).toHaveAttribute('tabindex', '-1');
    await expect(dialog.locator('.chat-diagram-full-view')).toHaveCSS('overflow-x', 'hidden');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await page.evaluate(() => {
      (window as unknown as { __releaseNativeZoomCopy: () => void }).__releaseNativeZoomCopy();
    });
    await expect(dialog.getByRole('button', { name: 'Copied', exact: true })).toBeEnabled();
    await expect(zoomOut).toBeEnabled();
    expect(await desktopApp.evaluate(({ clipboard }) => clipboard.readText())).toBe(diagram);
  });
  await dialog.getByRole('button', { name: 'Reset view', exact: true }).click();
  await expect(percent).toHaveText('100%');
  expect(await view.evaluate((element) => element.scrollLeft === 0 && element.scrollTop === 0)).toBe(true);
  await expect(zoomIn).toBeEnabled();
  await expect(zoomOut).toBeEnabled();
  await expect(view).toHaveCSS('scroll-behavior', 'auto');
  // Leave toolbar tooltips before testing the viewport's Escape dismissal.
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await view.focus();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Expand diagram', exact: true })).toBeFocused();
});
