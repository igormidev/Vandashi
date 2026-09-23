import { test, expect } from '@playwright/test';
import { catalogs } from '../../landing/src/locales/catalogs';

const regionalLanguages = [
  ['en-GB', 'en'],
  ['ja-JP', 'ja'],
  ['fr-CA', 'fr'],
  ['es-MX', 'es'],
  ['de-CH', 'de'],
  ['ko-KR', 'ko'],
  ['pt-PT', 'pt-BR'],
  ['it-CH', 'it'],
] as const;

for (const [browserLocale, expected] of regionalLanguages) {
  test(`browser language ${browserLocale} selects ${expected}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ locale: browserLocale });
    try {
      const page = await context.newPage();
      await page.goto(baseURL ?? '');
      await expect(page.locator('html')).toHaveAttribute('lang', expected);
      await expect(page.getByRole('combobox')).toHaveValue(expected);
      await expect(page).toHaveTitle(catalogs[expected].pageTitle);
    } finally {
      await context.close();
    }
  });
}

test('URL choice outranks storage; deliberate selection survives new pages and preserves the URL', async ({
  page,
  context,
  baseURL,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', { value: ['de-CH'] });
    if (!localStorage.getItem('vandashi.site.language')) localStorage.setItem('vandashi.site.language', 'fr');
  });
  await page.goto('?campaign=a%20b&lang=ja#start');
  await expect(page.getByRole('combobox')).toHaveValue('ja');
  await page.getByRole('combobox').selectOption('es');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(catalogs.es.heroTitle);
  const selected = new URL(page.url());
  expect(selected.pathname).toBe('/Vandashi/');
  expect(selected.searchParams.get('campaign')).toBe('a b');
  expect(selected.searchParams.getAll('lang')).toEqual(['es']);
  expect(selected.hash).toBe('#start');
  await page.reload();
  await expect(page.getByRole('combobox')).toHaveValue('es');
  const reopened = await context.newPage();
  await reopened.goto(baseURL ?? '');
  await expect(reopened.getByRole('combobox')).toHaveValue('es');
  await reopened.goto(`${baseURL ?? ''}?lang=en`);
  await expect(reopened.getByRole('combobox')).toHaveValue('en');
  await reopened.goto(`${baseURL ?? ''}?lang=not-a-supported-language`);
  await expect(reopened.getByRole('combobox')).toHaveValue('es');
});

test('unsupported browser languages fall back to English without hiding later supported preferences', async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', { value: ['zh-Hant-TW', 'ar', 'ru'], configurable: true });
  });
  await page.goto('./');
  await expect(page.getByRole('combobox')).toHaveValue('en');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'languages', { value: ['zh-TW', 'fr-CA', 'ja'], configurable: true });
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('combobox')).toHaveValue('fr');
});

test('denied storage still supports immediate selection, URL reload, and browser history', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', { value: ['ko-KR'] });
    Object.defineProperty(Storage.prototype, 'getItem', {
      value: () => {
        throw new DOMException('Storage denied', 'SecurityError');
      },
    });
    Object.defineProperty(Storage.prototype, 'setItem', {
      value: () => {
        throw new DOMException('Storage denied', 'SecurityError');
      },
    });
  });
  await page.goto('./');
  await expect(page.getByRole('combobox')).toHaveValue('ko');
  await page.getByRole('combobox').selectOption('it');
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    catalogs.it.pageDescription,
  );
  await page.reload();
  await expect(page.getByRole('combobox')).toHaveValue('it');
  await page.evaluate(() => {
    history.pushState(null, '', '?lang=de');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  await expect(page.getByRole('combobox')).toHaveValue('de');
  await page.goBack();
  await expect(page.getByRole('combobox')).toHaveValue('it');
  expect(errors).toEqual([]);
});
