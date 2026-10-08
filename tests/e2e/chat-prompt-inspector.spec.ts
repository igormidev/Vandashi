import { test, expect } from './development-fixtures';
import { installPromptFixture, promptControl, promptRequests } from './chat-prompt-inspector-fixture';

test('system prompt inspector reads complete nested guides, goes back and selects truthful historical sources', async ({
  desktopApp,
  page,
}, testInfo) => {
  await installPromptFixture(desktopApp);
  await page.reload();
  const info = page.getByRole('button', { name: 'System prompt', exact: true });
  await expect(info).toBeVisible();
  await info.click();
  const modal = page.getByRole('dialog', { name: 'System prompt', exact: true });
  const source = modal.getByRole('combobox', { name: 'Prompt source' });
  const left = modal.getByRole('region', { name: 'App guidance', exact: true });
  const right = modal.getByRole('region', { name: 'Referenced file', exact: true });
  await expect(left).toContainText('End of the complete prompt.');
  await expect(modal).toContainText('Older requests have no saved prompt record.');
  await left.getByRole('button', { name: '/native/My Brand/brand_identity/README.md', exact: true }).click();
  await expect(right).toContainText('END OF README');
  await expect(right).toContainText('<script>window.promptExecuted=true</script>');
  expect(await page.evaluate(() => 'promptExecuted' in window)).toBe(false);
  await right.getByRole('button', { name: 'docs/DETAILS.md', exact: true }).click();
  await expect(right).toContainText('END OF NESTED FILE');
  await right.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(right).toContainText('END OF README');
  await source.selectOption('saved-request');
  await expect(left).toContainText('EXACT HISTORICAL GUIDANCE');
  await expect(modal).toContainText('Exact app guidance saved for this request.');
  await source.selectOption('developer:saved-request');
  await expect(left).toContainText('Captured developer instructions.');
  await source.selectOption('developer');
  await expect(left).toContainText('CURRENT THREAD TEMPLATE');
  await expect(modal).toContainText('Existing threads may retain earlier instructions.');
  await source.selectOption('preview');
  await left.getByRole('button', { name: '/native/My Brand/brand_identity/README.md', exact: true }).click();
  await page.screenshot({
    path: testInfo.outputPath('prompt-inspector-recursive.png'),
    animations: 'disabled',
  });
  await expect(modal.getByRole('textbox')).toHaveCount(0);
  await expect(modal.getByRole('button', { name: 'Save changes' })).toHaveCount(0);
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(modal).toHaveCount(0);
});

test('prompt inspection locks asynchronous reads, retries failure, retains guides and follows the composer Plan mode', async ({
  desktopApp,
  page,
}) => {
  await installPromptFixture(desktopApp);
  await page.reload();
  await page.locator('.composer:visible').getByRole('combobox').click();
  await page.getByRole('listbox').getByRole('option', { name: 'Plan', exact: true }).click();
  await promptControl(desktopApp, { hold: true });
  await page.getByRole('button', { name: 'System prompt', exact: true }).click();
  const modal = page.getByRole('dialog', { name: 'System prompt', exact: true });
  await expect(modal.getByRole('status')).toContainText('Loading');
  await expect(modal.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await expect(modal).toBeVisible();
  await promptControl(desktopApp, { hold: false });
  const left = modal.getByRole('region', { name: 'App guidance', exact: true });
  await left.getByRole('button', { name: '/native/My Brand/brand_identity/README.md', exact: true }).click();
  const right = modal.getByRole('region', { name: 'Referenced file', exact: true });
  await expect(right).toContainText('END OF README');
  await promptControl(desktopApp, { hold: true, fail: true });
  await right.getByRole('button', { name: 'docs/DETAILS.md', exact: true }).click();
  await expect(modal.getByRole('combobox')).toBeDisabled();
  await expect(modal.getByRole('button', { name: 'Close', exact: true })).toBeDisabled();
  await promptControl(desktopApp, { hold: false });
  await expect(right.getByRole('alert')).toContainText('Readable fixture failure');
  await expect(right).toContainText('END OF README');
  await promptControl(desktopApp, { fail: false });
  await right.getByRole('button', { name: 'Check again', exact: true }).click();
  await expect(right).toContainText('END OF NESTED FILE');
  expect((await promptRequests(desktopApp))[0]?.input).toMatchObject({ mode: 'read', collaboration: 'plan' });
  await modal.getByRole('button', { name: 'Close', exact: true }).click();
});

test('prompt inspector fits the native minimum and resolves labels in every supported language', async ({
  desktopApp,
  page,
}, testInfo) => {
  await installPromptFixture(desktopApp);
  await desktopApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(1200, 720);
  });
  await promptControl(desktopApp, { skillsAvailable: false });
  const languages = [
    ['en', 'System prompt'],
    ['pt-BR', 'Prompt do sistema'],
    ['de', 'Systemprompt'],
    ['fr', 'Prompt système'],
    ['es', 'Prompt del sistema'],
    ['it', 'Prompt di sistema'],
    ['ja', 'システムプロンプト'],
    ['ko', '시스템 프롬프트'],
  ] as const;
  for (const [locale, title] of languages) {
    await page.evaluate(async (locale) => {
      const api = window.vandashi;
      if (!api) throw new Error('Native fixture bridge missing');
      const state = await api.getState();
      await api.settings({ ...state.settings, locale });
    }, locale);
    await page.reload();
    await page.getByRole('button', { name: title, exact: true }).click();
    const modal = page.getByRole('dialog', { name: title, exact: true });
    await expect(modal.locator('.prompt-text').first()).toContainText('End of the complete prompt.');
    await modal.locator('button.prompt-reference').first().click();
    await expect(modal.locator('.prompt-file-panel')).toContainText('END OF README');
    const fit = await modal.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const panels = [...element.querySelectorAll('.prompt-panel')].map((panel) => {
        const bounds = panel.getBoundingClientRect();
        return { left: bounds.left, right: bounds.right, width: bounds.width, bottom: bounds.bottom };
      });
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        panels,
        overflow: element.scrollWidth > element.clientWidth,
      };
    });
    expect(fit.left).toBeGreaterThanOrEqual(0);
    expect(fit.right).toBeLessThanOrEqual(fit.viewportWidth);
    expect(fit.top).toBeGreaterThanOrEqual(0);
    expect(fit.bottom).toBeLessThanOrEqual(fit.viewportHeight);
    expect(fit.overflow).toBe(false);
    expect(fit.panels.every((panel) => panel.width >= 400 && panel.bottom <= fit.bottom - 15)).toBe(true);
    if (locale === 'ja' || locale === 'de')
      await page.screenshot({
        path: testInfo.outputPath('prompt-inspector-' + locale + '.png'),
        animations: 'disabled',
      });
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
  }
});
