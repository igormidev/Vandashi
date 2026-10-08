import type { Locator } from '@playwright/test';
import { test, expect } from './development-fixtures';
import { installInlineCommandFixture, inlineState } from './chat-inline-commands-followup-fixture';
import { compactCalls, installChatUsageFixture, usageControl } from './chat-usage-refactor-fixture';

async function selectedVisible(menu: Locator) {
  await expect
    .poll(() =>
      menu.evaluate((panel) => {
        const selected = panel.querySelector('[aria-selected="true"]');
        if (!selected) return false;
        const option = selected.getBoundingClientRect();
        const top = panel.getBoundingClientRect().top + panel.clientTop;
        return option.top >= top - 1 && option.bottom <= top + panel.clientHeight + 1;
      }),
    )
    .toBe(true);
}

test('arrow navigation scrolls long dollar suggestions both ways and across wraparound without moving the draft or conversation', async ({
  desktopApp,
  page,
}, testInfo) => {
  const skills = Array.from({ length: 30 }, (_, index) => ({
    name: `skill-${String(index + 1).padStart(2, '0')}`,
    description: `Enabled skill ${String(index + 1)}`,
  }));
  await installInlineCommandFixture(desktopApp, undefined, skills);
  await page.reload();
  const editor = page.getByRole('textbox', { name: 'AI chat', exact: true });
  await editor.fill('Keep this draft $');
  const menu = page.getByRole('listbox', { name: 'Commands', exact: true });
  await expect(menu.getByRole('option')).toHaveCount(36);
  expect(await menu.evaluate((panel) => panel.scrollHeight > panel.clientHeight)).toBe(true);
  const timeline = page.locator('.messages:visible');
  const readingPosition = await timeline.evaluate((panel) => panel.scrollTop);
  await selectedVisible(menu);
  for (let index = 0; index < 35; index++) {
    await page.keyboard.press('ArrowDown');
    await selectedVisible(menu);
  }
  await expect(menu.locator('[aria-selected="true"]')).toContainText('$skill-30');
  expect(await menu.evaluate((panel) => panel.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('ArrowDown');
  await selectedVisible(menu);
  await expect(menu.locator('[aria-selected="true"]')).toContainText('$plan');
  await page.keyboard.press('ArrowUp');
  await selectedVisible(menu);
  await expect(menu.locator('[aria-selected="true"]')).toContainText('$skill-30');
  await page.screenshot({ path: testInfo.outputPath('dollar-last-option.png'), animations: 'disabled' });
  for (let index = 0; index < 35; index++) {
    await page.keyboard.press('ArrowUp');
    await selectedVisible(menu);
  }
  await expect(menu.locator('[aria-selected="true"]')).toContainText('$plan');
  await expect(editor).toBeFocused();
  const selectedId = await menu.locator('[aria-selected="true"]').getAttribute('id');
  if (!selectedId) throw new Error('The selected command must have an accessible identity');
  await expect(editor).toHaveAttribute('aria-activedescendant', selectedId);
  await expect(editor).toHaveText('Keep this draft $');
  expect(await timeline.evaluate((panel) => panel.scrollTop)).toBe(readingPosition);
  expect((await inlineState(desktopApp)).requests).toHaveLength(0);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
});

test('continuous context arc represents native remaining capacity beside Attach and retains the explicit usage dialog', async ({
  desktopApp,
  page,
}) => {
  const context = {
    usedTokens: 25000,
    maxTokens: 100000,
    totalTokens: 500000,
    observedAt: new Date().toISOString(),
  };
  await installChatUsageFixture(desktopApp, {
    context,
    account: { available: false, windows: [], checkedAt: context.observedAt },
  });
  await page.reload();
  const composer = page.locator('.composer:visible');
  const trigger = composer.locator('.chat-usage-trigger');
  await expect(trigger).toHaveAccessibleName('Context window: 75% available');
  await expect(trigger.locator('.context-ring-fill')).toHaveAttribute('stroke-dashoffset', '25');
  expect(
    await trigger.locator('.context-ring-track').evaluate((track) => getComputedStyle(track).strokeDasharray),
  ).toBe('none');
  await expect(composer.locator('.chat-usage + .icon-button')).toHaveAccessibleName('Attach files');
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Usage', exact: true });
  await expect(dialog).toContainText('25,000 / 100,000 tokens');
  await expect(dialog.getByRole('button', { name: 'Compact context', exact: true })).toBeEnabled();
  expect(await compactCalls(desktopApp)).toBe(0);
  await page.keyboard.press('Escape');
  for (const usedTokens of [0, 100000]) {
    await usageControl(desktopApp, {
      event: { type: 'chat-usage', sessionId: 'chat-one', context: { ...context, usedTokens } },
    });
    await expect(trigger).toHaveAccessibleName(`Context window: ${usedTokens ? '0' : '100'}% available`);
    await expect(trigger.locator('.context-ring-fill')).toHaveAttribute(
      'stroke-dashoffset',
      String(usedTokens / 1000),
    );
  }
  await usageControl(desktopApp, {
    event: { type: 'chat-usage', sessionId: 'chat-one', context: { ...context, maxTokens: null } },
  });
  await expect(trigger).toHaveAccessibleName('Context window unavailable');
  await expect(trigger.locator('.context-ring.unknown')).toHaveCount(1);
  await expect(trigger.locator('.context-ring-fill')).toHaveCount(0);
  expect(
    await trigger.locator('.context-ring-track').evaluate((track) => getComputedStyle(track).strokeDasharray),
  ).toBe('none');
});

test('darker attached settings pill keeps its divider and usable controls at the minimum chat width', async ({
  desktopApp,
  page,
}, testInfo) => {
  await installInlineCommandFixture(desktopApp);
  await page.reload();
  await desktopApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1200, 720);
  });
  const divider = page.getByRole('slider', { name: 'Resize panels', exact: true });
  await divider.focus();
  for (let index = 0; index < 25; index++) await divider.press('ArrowLeft');
  await expect(divider).toHaveAttribute('aria-valuenow', '25');
  const wrap = page.locator('.composer-wrap:visible');
  const appearance = await wrap.evaluate((element) => {
    const composer = element.querySelector('.composer');
    const pill = element.querySelector('.model-controls-attached');
    if (!composer || !pill) throw new Error('Both attached composer surfaces must exist');
    const upper = getComputedStyle(composer);
    const lower = getComputedStyle(pill);
    const top = composer.getBoundingClientRect();
    const bottom = pill.getBoundingClientRect();
    return {
      upper: upper.backgroundColor,
      lower: lower.backgroundColor,
      border: lower.borderTopWidth,
      borderStyle: lower.borderTopStyle,
      seam: bottom.top - top.bottom,
      overflow: element.scrollWidth - element.clientWidth,
      centered: Math.abs((top.left + top.right) / 2 - (bottom.left + bottom.right) / 2),
    };
  });
  expect(appearance.lower).not.toBe(appearance.upper);
  expect(appearance.border).toBe('1px');
  expect(appearance.borderStyle).toBe('solid');
  expect(Math.abs(appearance.seam)).toBeLessThanOrEqual(1);
  expect(appearance.centered).toBeLessThanOrEqual(1);
  expect(appearance.overflow).toBeLessThanOrEqual(1);
  const model = wrap.getByRole('combobox', { name: 'Model', exact: true });
  const effort = wrap.getByRole('combobox', { name: 'Thinking', exact: true });
  await expect(model).toBeEnabled();
  await expect(effort).toBeEnabled();
  await effort.click();
  const options = page.getByRole('listbox', { name: 'Thinking', exact: true });
  await expect(options).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(effort).toBeFocused();
  await expect(wrap.getByRole('button', { name: 'Attach files', exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('separated-settings-pill.png'), animations: 'disabled' });
});
