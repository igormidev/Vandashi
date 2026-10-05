import { test, expect } from './development-fixtures';
import type { DependencyCheck } from '../../src/domain/models';
import { supportedLocales } from '../../src/domain/locales';
import {
  installStartupFixture,
  startupCalls,
  startupControl,
  proveDevelopment,
} from './startup-development-fixture';

const checks: DependencyCheck[] = [
  { id: 'Codex', status: 'ready', detail: 'Codex', repairPrompt: null, helpUrl: null },
  ...['media-ffmpeg', 'media-ffprobe', 'media-chrome', 'skill'].map((id): DependencyCheck => ({
    id,
    status: 'missing',
    detail: 'Unavailable',
    repairPrompt: null,
    installation: {
      id: 'appInstallDependency',
      params: {
        name:
          id === 'skill'
            ? 'Hyperframes core skill'
            : id === 'media-chrome'
              ? 'Hyperframes Chrome Headless Shell'
              : id === 'media-ffprobe'
                ? 'FFprobe'
                : 'FFmpeg',
      },
    },
    helpUrl: 'https://ffmpeg.org/download.html',
    label: {
      id:
        id === 'skill'
          ? 'mediaSkillLabel'
          : id === 'media-chrome'
            ? 'mediaChromeLabel'
            : id === 'media-ffprobe'
              ? 'mediaFfprobeLabel'
              : 'mediaFfmpegLabel',
    },
  })),
];

test('prepares an unsent installation chat, aligns its AI emphasis and locks the whole checklist until completion', async ({
  desktopApp,
  page,
  rendererUrl,
}) => {
  await installStartupFixture(desktopApp, rendererUrl, false, true, checks);
  await page.reload();
  await proveDevelopment(page);
  const list = page.locator('.check-list');
  const install = list.getByRole('button', { name: 'Ask AI to install for me', exact: true });
  await expect(install).toHaveCount(4);
  await expect(page.locator('.chat-pane')).toHaveCount(0);
  const geometry = await install.first().evaluate((button) => {
    const label = button.querySelector('span');
    const ai = button.querySelector('.installation-ai');
    if (!label || !ai) throw new Error('Missing rich label');
    return {
      aiColor: getComputedStyle(ai).color,
      primary: getComputedStyle(button).getPropertyValue('--accent').trim(),
      font: getComputedStyle(ai).fontSize,
      labelFont: getComputedStyle(label).fontSize,
      y: ai.getBoundingClientRect().y,
      labelY: label.getBoundingClientRect().y,
    };
  });
  expect(geometry.aiColor).toBe('rgb(60, 230, 172)');
  expect(geometry.font).toBe(geometry.labelFont);
  expect(Math.abs(geometry.y - geometry.labelY)).toBeLessThanOrEqual(1);
  await install.first().click();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await expect(composer).toContainText('Install FFmpeg for Vandashi on this computer.');
  expect((await startupCalls(desktopApp)).filter((call) => call.method === 'sendChat')).toHaveLength(0);
  await expect(page.getByRole('combobox', { name: 'Read only', exact: true })).toContainText(
    'Install on this computer',
  );
  await page.screenshot({ path: '/tmp/vandashi-installation-chat.png' });
  await composer.press('Enter');
  await expect(list).toHaveAttribute('aria-busy', 'true');
  for (const button of await list.getByRole('button').all()) await expect(button).toBeDisabled();
  await expect(list).toHaveCSS('opacity', '0.55');
  await expect(list.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeEnabled();
  await startupControl(desktopApp, { finishChat: 'done', dependenciesReady: true });
  await expect(page.getByRole('textbox', { name: 'Titles', exact: true })).toBeVisible();
  await expect(list).toHaveCount(0);
  expect((await startupCalls(desktopApp)).filter((call) => call.method === 'checks')).toHaveLength(2);
});

test('rechecks failed, cancelled and non-installation conversations once per completed operation and retains the chat on missing dependencies', async ({
  desktopApp,
  page,
  rendererUrl,
}) => {
  await installStartupFixture(desktopApp, rendererUrl, false, true, checks);
  await page.reload();
  await page.getByRole('button', { name: 'Ask AI to install for me', exact: true }).first().click();
  const composer = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await composer.press('Enter');
  await startupControl(desktopApp, { finishChat: 'error' });
  await expect
    .poll(async () => (await startupCalls(desktopApp)).filter((call) => call.method === 'checks').length)
    .toBe(2);
  await expect(page.locator('.check-list')).toContainText('Unavailable');
  await expect(composer).toBeVisible();
  await composer.fill('Try installing again.');
  await composer.press('Enter');
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect
    .poll(async () => (await startupCalls(desktopApp)).filter((call) => call.method === 'checks').length)
    .toBe(3);
  await page.locator('.chat-tabs').getByRole('button', { name: 'Brand attributes', exact: true }).click();
  await composer.fill('Explain what is missing.');
  await composer.press('Enter');
  await startupControl(desktopApp, { finishChat: 'done' });
  await expect
    .poll(async () => (await startupCalls(desktopApp)).filter((call) => call.method === 'checks').length)
    .toBe(4);
  await expect(
    page.locator('.check-list').getByRole('button', { name: 'Check again', exact: true }),
  ).toBeEnabled();
});

test('unavailable Codex leaves manual guides available and suppresses installation chats', async ({
  desktopApp,
  page,
  rendererUrl,
}) => {
  await installStartupFixture(desktopApp, rendererUrl, false, true, [
    {
      id: 'Codex',
      status: 'missing',
      detail: 'Unavailable',
      repairPrompt: null,
      helpUrl: 'https://developers.openai.com/codex/cli/',
    },
    ...checks.slice(1),
  ]);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Installation guide', exact: true })).toHaveCount(5);
  await expect(page.getByRole('button', { name: 'Ask AI to install for me', exact: true })).toHaveCount(0);
});

for (const locale of supportedLocales) {
  test(`installation actions fit the minimum window and narrow checklist in ${locale}`, async ({
    desktopApp,
    page,
    rendererUrl,
  }) => {
    await installStartupFixture(desktopApp, rendererUrl, false, true, checks, { locale, split: 75 });
    await desktopApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setContentSize(1200, 720);
    });
    await page.reload();
    const install = page.locator('.check-list .installation-ai').first().locator('..').locator('..');
    await install.click();
    await expect(page.locator('.chat-pane')).toBeVisible();
    await expect(page.locator('.check-list .installation-ai')).toHaveCount(4);
    const fits = await page.locator('.split-right').evaluate((pane) => {
      const parent = pane.getBoundingClientRect();
      return (
        [...pane.querySelectorAll('button')].every((button) => {
          const box = button.getBoundingClientRect();
          return (
            box.x >= parent.x && box.right <= parent.right + 1 && button.scrollWidth <= button.clientWidth + 1
          );
        }) && pane.scrollWidth <= pane.clientWidth + 1
      );
    });
    expect(fits).toBe(true);
    await page.screenshot({ path: `/tmp/vandashi-installation-${locale}.png` });
  });
}
