import { mkdir } from 'node:fs/promises';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { siteLocales } from '../../landing/src/language';
import { catalogs } from '../../landing/src/locales/catalogs';

const viewports = [
  { width: 320, height: 568 },
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 844, height: 390 },
];

async function loadedContent(page: Page) {
  const images = page.locator('main img');
  await expect(images).toHaveCount(4);
  for (const image of await images.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() => image.evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth))
      .toBe(2960);
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

async function visibleContentFits(page: Page) {
  const failures = await page.evaluate(() => {
    const problems: string[] = [];
    if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('page overflow');
    const controls = document.querySelectorAll<HTMLElement>('button, select, summary, a, textarea');
    for (const element of controls) {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height || element.matches('.skip')) continue;
      const label = element.getAttribute('aria-label') ?? element.textContent.trim().slice(0, 60);
      if (rect.left < -1 || rect.right > innerWidth + 1) problems.push(`control outside page: ${label}`);
      if (element.scrollWidth > element.clientWidth + 1) problems.push(`control clips content: ${label}`);
      if (element instanceof HTMLSelectElement) {
        const context = document.createElement('canvas').getContext('2d');
        if (!context) throw new Error('Canvas text measurement is unavailable');
        const style = getComputedStyle(element);
        context.font = style.font;
        const text = element.selectedOptions[0]?.text ?? '';
        const required =
          context.measureText(text).width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        if (required > element.clientWidth + 1) problems.push(`selected language clips: ${text}`);
      }
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (
        !node.textContent?.trim() ||
        node.parentElement?.closest('.sr-only,.skip,textarea,option,script,style')
      )
        continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects())
        if (rect.width && (rect.left < -1 || rect.right > innerWidth + 1))
          problems.push(`text outside page: ${node.textContent.trim().slice(0, 60)}`);
    }
    return problems;
  });
  expect(failures).toEqual([]);
}

for (const locale of siteLocales) {
  for (const viewport of viewports) {
    test(`${locale} fits ${String(viewport.width)}x${String(viewport.height)}`, async ({
      page,
      browserName,
    }) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.setViewportSize(viewport);
      await page.goto(`?lang=${locale}`);
      await expect(page.locator('html')).toHaveAttribute('lang', locale);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(catalogs[locale].heroTitle);
      await expect(page).toHaveTitle(catalogs[locale].pageTitle);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute(
        'content',
        catalogs[locale].pageDescription,
      );
      await loadedContent(page);
      await visibleContentFits(page);
      const font =
        locale === 'ja' ? 'Noto Sans JP Variable' : locale === 'ko' ? 'Noto Sans KR Variable' : 'Geist';
      expect(
        await page.evaluate(
          (family) =>
            [...document.fonts].some(
              (face) => face.family.replaceAll('"', '') === family && face.status === 'loaded',
            ),
          font,
        ),
      ).toBe(true);
      if (browserName === 'chromium') {
        await mkdir('/tmp/vandashi-site-visuals', { recursive: true });
        await page.evaluate(() => {
          window.scrollTo({ top: 0, behavior: 'instant' });
        });
        await page.screenshot({
          path: `/tmp/vandashi-site-visuals/${locale}-${String(viewport.width)}x${String(viewport.height)}.png`,
          fullPage: true,
          animations: 'disabled',
        });
      }
      expect(errors).toEqual([]);
    });
  }

  test(`${locale} preserves reading and controls with text enlarged to 200%`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`?lang=${locale}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await loadedContent(page);
    await page.evaluate(() => {
      const original = [...document.querySelectorAll<HTMLElement>('body *')].map((element) => ({
        element,
        size: parseFloat(getComputedStyle(element).fontSize),
      }));
      for (const { element, size } of original) element.style.fontSize = `${String(size * 2)}px`;
    });
    await visibleContentFits(page);
    await page.getByRole('button', { name: catalogs[locale].copy, exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: catalogs[locale].copy, exact: true })).toBeVisible();
  });
}
