import { test, expect } from '@playwright/test';

test('the production Pages path loads local assets and missing paths are actual 404s', async ({
  page,
  request,
  baseURL,
}) => {
  const responses: { url: string; status: number }[] = [];
  page.on('response', (response) => responses.push({ url: response.url(), status: response.status() }));
  await page.goto('?lang=ja');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  for (const image of await page.locator('main img').all()) {
    await image.scrollIntoViewIfNeeded();
    await expect
      .poll(() =>
        image.evaluate(
          (element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0,
        ),
      )
      .toBe(true);
  }
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  const origin = new URL(baseURL ?? '').origin;
  expect(responses.length).toBeGreaterThan(8);
  for (const response of responses) {
    const url = new URL(response.url);
    expect(url.origin).toBe(origin);
    expect(url.pathname).toMatch(/^\/Vandashi\//);
    expect(response.status, url.href).toBeLessThan(400);
  }
  expect(responses.some(({ url }) => /\/assets\/.+\.js$/.test(url))).toBe(true);
  expect(responses.some(({ url }) => /\/assets\/.+\.css$/.test(url))).toBe(true);
  expect(responses.some(({ url }) => /\.woff2$/.test(url))).toBe(true);
  for (const path of ['assets/definitely-missing.js', 'assets/definitely-missing.webp', 'not-a-page']) {
    const response = await request.get(`${baseURL ?? ''}${path}`);
    expect(response.status(), path).toBe(404);
    expect(await response.text()).not.toContain('<div id="root">');
  }
});
