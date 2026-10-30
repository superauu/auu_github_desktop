import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  timeout: 60_000,
  updateSnapshots: 'none',
  snapshotPathTemplate: './tests/visual/baselines/playwright-{platform}/{arg}{ext}',
  reporter: [['list'], ['html', { open: 'never' }]],
  expect: {
    timeout: 15_000,
    toHaveScreenshot: { animations: 'disabled', caret: 'hide', maxDiffPixelRatio: 0.005, threshold: 0.2 },
  },
  use: {
    browserName: 'chromium',
    headless: true,
    baseURL: 'http://127.0.0.1:5179',
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    timezoneId: 'Australia/Sydney',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5179',
    url: 'http://127.0.0.1:5179/tests/visual/index.html',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
