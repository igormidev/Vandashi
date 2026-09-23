import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4174/Vandashi/';

export default defineConfig({
  testDir: './tests/site',
  testMatch: '**/*.spec.ts',
  outputDir: 'test-results/site',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 2,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/site', open: 'never' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run site:preview',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
